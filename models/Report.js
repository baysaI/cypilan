const { getDb } = require('../config/database');

const LISTING_REASONS = ['wrong_category', 'misleading_price', 'missing_photos', 'spam', 'fraud', 'inappropriate', 'other'];
const USER_REASONS = ['harassment', 'spam', 'fraud', 'inappropriate', 'other'];
const REASONS = [...new Set([...LISTING_REASONS, ...USER_REASONS])];
const STATUSES = ['pending', 'reviewed', 'resolved', 'dismissed'];

class Report {
  static get reasons() {
    return REASONS;
  }

  static get listingReasons() {
    return LISTING_REASONS;
  }

  static get userReasons() {
    return USER_REASONS;
  }

  static async create({ reporter_id, type = 'listing', listing_id = null, reported_user_id = null, message_id = null, reason, description = null }) {
    if (!REASONS.includes(reason)) {
      throw new Error(`Invalid reason: ${reason}`);
    }

    if (!['listing', 'user'].includes(type)) {
      throw new Error(`Invalid report type: ${type}`);
    }

    if (listing_id == null && reported_user_id == null) {
      throw new Error('A report needs either a listing or a user target');
    }

    const db = getDb();
    const result = db.prepare(
      'INSERT INTO reports (reporter_id, type, listing_id, reported_user_id, message_id, reason, description) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run([reporter_id, type, listing_id, reported_user_id, message_id, reason, description]);

    return Number(result.lastInsertRowid);
  }

  static async hasPending({ reporter_id, type = 'listing', listing_id = null, reported_user_id = null }) {
    const db = getDb();
    let query = "SELECT COUNT(*) as count FROM reports WHERE reporter_id = ? AND status IN ('pending','reviewed') AND COALESCE(type,'listing') = ?";
    const params = [reporter_id, type];

    if (type === 'listing') {
      query += ' AND listing_id = ?';
      params.push(listing_id);
    } else {
      query += ' AND reported_user_id = ?';
      params.push(reported_user_id);
    }

    const { count } = db.prepare(query).get(params);
    return count > 0;
  }

  static async findAll(filters = {}, page = 1, limit = 20) {
    const db = getDb();
    let where = ' WHERE 1=1';
    const params = [];

    if (filters.status) {
      where += ' AND r.status = ?';
      params.push(filters.status);
    }

    const { total } = db.prepare(`SELECT COUNT(*) as total FROM reports r${where}`).get(params);

    const offset = (page - 1) * limit;
    const data = db.prepare(`
      SELECT r.*, l.title as listing_title, l.slug as listing_slug, l.status as listing_status,
             u.full_name as reporter_name, u.email as reporter_email,
             ru.full_name as reported_user_name, ru.email as reported_user_email,
             ru.is_active as reported_user_active,
             m.content as message_content
      FROM reports r
      LEFT JOIN listings l ON r.listing_id = l.id
      LEFT JOIN users u ON r.reporter_id = u.id
      LEFT JOIN users ru ON r.reported_user_id = ru.id
      LEFT JOIN messages m ON r.message_id = m.id
      ${where} ORDER BY r.created_at DESC LIMIT ? OFFSET ?
    `).all([...params, limit, offset]);

    return { data, total, pages: Math.ceil(total / limit) || 1 };
  }

  static async findById(id) {
    const db = getDb();
    return db.prepare(`
      SELECT r.*, l.title as listing_title, l.slug as listing_slug,
             u.full_name as reporter_name,
             ru.full_name as reported_user_name
      FROM reports r
      LEFT JOIN listings l ON r.listing_id = l.id
      LEFT JOIN users u ON r.reporter_id = u.id
      LEFT JOIN users ru ON r.reported_user_id = ru.id
      WHERE r.id = ?
    `).get([id]) || null;
  }

  static async updateStatus(id, status, adminNote = null) {
    if (!STATUSES.includes(status)) {
      throw new Error(`Invalid status: ${status}`);
    }

    const db = getDb();
    return db.prepare('UPDATE reports SET status = ?, admin_note = ? WHERE id = ?')
      .run([status, adminNote, id]).changes > 0;
  }

  static async countPending() {
    const db = getDb();
    const { count } = db.prepare("SELECT COUNT(*) as count FROM reports WHERE status = 'pending'").get();
    return count;
  }
}

module.exports = Report;
