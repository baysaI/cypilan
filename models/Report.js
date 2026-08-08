const { getDb, saveDb } = require('../config/database');

const REASONS = ['wrong_category', 'misleading_price', 'missing_photos', 'spam', 'fraud', 'inappropriate', 'other'];
const STATUSES = ['pending', 'reviewed', 'resolved', 'dismissed'];

class Report {
  static get reasons() {
    return REASONS;
  }

  static async create({ reporter_id, listing_id, reason, description = null }) {
    if (!REASONS.includes(reason)) {
      throw new Error(`Invalid reason: ${reason}`);
    }

    const db = await getDb();
    const stmt = db.prepare(
      'INSERT INTO reports (reporter_id, listing_id, reason, description) VALUES (?, ?, ?, ?)'
    );
    stmt.run([reporter_id, listing_id, reason, description]);
    stmt.free();

    const idRes = db.exec('SELECT last_insert_rowid() as id');
    saveDb();
    return idRes[0].values[0][0];
  }

  static async findAll(filters = {}, page = 1, limit = 20) {
    const db = await getDb();
    let where = ' WHERE 1=1';
    const params = [];

    if (filters.status) {
      where += ' AND r.status = ?';
      params.push(filters.status);
    }

    const countStmt = db.prepare(`SELECT COUNT(*) as total FROM reports r${where}`);
    countStmt.bind(params);
    let total = 0;
    if (countStmt.step()) {
      total = countStmt.getAsObject().total;
    }
    countStmt.free();

    const offset = (page - 1) * limit;
    const stmt = db.prepare(`
      SELECT r.*, l.title as listing_title, l.slug as listing_slug, l.status as listing_status,
             u.full_name as reporter_name, u.email as reporter_email
      FROM reports r
      LEFT JOIN listings l ON r.listing_id = l.id
      LEFT JOIN users u ON r.reporter_id = u.id
      ${where} ORDER BY r.created_at DESC LIMIT ? OFFSET ?
    `);
    stmt.bind([...params, limit, offset]);
    const data = [];
    while (stmt.step()) {
      data.push(stmt.getAsObject());
    }
    stmt.free();

    return { data, total, pages: Math.ceil(total / limit) || 1 };
  }

  static async updateStatus(id, status, adminNote = null) {
    if (!STATUSES.includes(status)) {
      throw new Error(`Invalid status: ${status}`);
    }

    const db = await getDb();
    const stmt = db.prepare('UPDATE reports SET status = ?, admin_note = ? WHERE id = ?');
    stmt.run([status, adminNote, id]);
    stmt.free();

    const changesRes = db.exec('SELECT changes() as changes');
    const changes = changesRes[0].values[0][0];
    if (changes > 0) saveDb();
    return changes > 0;
  }

  static async countPending() {
    const db = await getDb();
    const stmt = db.prepare("SELECT COUNT(*) as count FROM reports WHERE status = 'pending'");
    let count = 0;
    if (stmt.step()) {
      count = stmt.getAsObject().count;
    }
    stmt.free();
    return count;
  }
}

module.exports = Report;
