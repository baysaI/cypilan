const { getDb } = require('../config/database');

const TYPES = ['assurance', 'promotion'];
const STATUSES = ['pending', 'contacted', 'approved', 'rejected', 'completed'];
const OPEN_STATUSES = ['pending', 'contacted'];

class ServiceRequest {
  static async findById(id) {
    const db = getDb();
    return db.prepare('SELECT * FROM service_requests WHERE id = ?').get([id]) || null;
  }

  static async findOpen(listingId, type) {
    const db = getDb();
    return db.prepare(`
      SELECT * FROM service_requests
      WHERE listing_id = ? AND type = ? AND status IN ('pending', 'contacted')
    `).get([listingId, type]) || null;
  }

  // The partial unique index already refuses a second open request for the same
  // listing and service; this catches it rather than letting a constraint error
  // reach the user as a 500.
  static async create({ user_id, listing_id = null, type, note = null }) {
    if (!TYPES.includes(type)) return null;

    const db = getDb();

    if (listing_id && await this.findOpen(listing_id, type)) return null;

    const result = db.prepare(`
      INSERT INTO service_requests (user_id, listing_id, type, note)
      VALUES (?, ?, ?, ?)
    `).run([user_id, listing_id, type, note]);

    return this.findById(Number(result.lastInsertRowid));
  }

  static async findForUser(userId) {
    const db = getDb();
    return db.prepare(`
      SELECT s.*, l.title as listing_title, l.slug as listing_slug
      FROM service_requests s
      LEFT JOIN listings l ON s.listing_id = l.id
      WHERE s.user_id = ?
      ORDER BY s.created_at DESC
    `).all([userId]);
  }

  static async findAll(filters = {}, page = 1, limit = 20) {
    const db = getDb();
    let where = ' WHERE 1=1';
    const params = [];

    if (STATUSES.includes(filters.status)) {
      where += ' AND s.status = ?';
      params.push(filters.status);
    }
    if (TYPES.includes(filters.type)) {
      where += ' AND s.type = ?';
      params.push(filters.type);
    }

    const { total } = db.prepare(`SELECT COUNT(*) as total FROM service_requests s${where}`).get(params);

    const offset = (page - 1) * limit;
    const data = db.prepare(`
      SELECT s.*,
             u.full_name as requester_name, u.email as requester_email, u.phone as requester_phone,
             l.title as listing_title, l.slug as listing_slug,
             l.price as listing_price, l.currency as listing_currency,
             l.is_featured, l.is_premium
      FROM service_requests s
      JOIN users u ON s.user_id = u.id
      LEFT JOIN listings l ON s.listing_id = l.id
      ${where}
      ORDER BY
        CASE s.status WHEN 'pending' THEN 0 WHEN 'contacted' THEN 1 ELSE 2 END,
        s.created_at DESC
      LIMIT ? OFFSET ?
    `).all([...params, limit, offset]);

    return { data, total, pages: Math.ceil(total / limit) || 1 };
  }

  static async countPending() {
    const db = getDb();
    const { count } = db.prepare("SELECT COUNT(*) as count FROM service_requests WHERE status = 'pending'").get();
    return count;
  }

  // Approving a promotion is the moment the listing actually gets featured, so
  // the flag and the request status move together rather than leaving an
  // approved request whose listing was never promoted.
  static async setStatus(id, status, adminNote = null) {
    if (!STATUSES.includes(status)) return null;

    const db = getDb();

    const apply = db.transaction(() => {
      const request = db.prepare('SELECT * FROM service_requests WHERE id = ?').get([id]);
      if (!request) return null;

      db.prepare(`
        UPDATE service_requests
        SET status = ?, admin_note = COALESCE(?, admin_note), updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run([status, adminNote, id]);

      if (request.type === 'promotion' && request.listing_id) {
        if (status === 'approved' || status === 'completed') {
          db.prepare('UPDATE listings SET is_featured = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            .run([request.listing_id]);
        } else if (status === 'rejected') {
          db.prepare('UPDATE listings SET is_featured = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            .run([request.listing_id]);
        }
      }

      return { ...request, status };
    });

    return apply();
  }
}

ServiceRequest.TYPES = TYPES;
ServiceRequest.STATUSES = STATUSES;
ServiceRequest.OPEN_STATUSES = OPEN_STATUSES;

module.exports = ServiceRequest;
