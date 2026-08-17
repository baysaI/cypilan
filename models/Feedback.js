const { getDb } = require('../config/database');

const TYPES = ['bug', 'suggestion', 'other'];
const STATUSES = ['new', 'read', 'resolved'];

const MESSAGE_MIN_LENGTH = 5;
const MESSAGE_MAX_LENGTH = 2000;

class Feedback {
  static async create({ user_id = null, type, message, contact_email = null, page_url = null }) {
    const db = getDb();

    const result = db.prepare(`
      INSERT INTO feedback (user_id, type, message, contact_email, page_url)
      VALUES (?, ?, ?, ?, ?)
    `).run([user_id, type, message, contact_email, page_url]);

    return Number(result.lastInsertRowid);
  }

  static async findAll(filters = {}, page = 1, limit = 30) {
    const db = getDb();
    let where = ' WHERE 1=1';
    const params = [];

    if (STATUSES.includes(filters.status)) {
      where += ' AND f.status = ?';
      params.push(filters.status);
    }
    if (TYPES.includes(filters.type)) {
      where += ' AND f.type = ?';
      params.push(filters.type);
    }

    const { total } = db.prepare(`SELECT COUNT(*) as total FROM feedback f${where}`).get(params);

    const offset = (page - 1) * limit;
    const data = db.prepare(`
      SELECT f.*, u.full_name as user_name, u.email as user_email
      FROM feedback f
      LEFT JOIN users u ON f.user_id = u.id
      ${where}
      -- created_at has one-second resolution, so a burst of reports would come
      -- back in an arbitrary order and shuffle between page loads. The id breaks
      -- the tie in the same direction the timestamp is sorted.
      ORDER BY f.created_at DESC, f.id DESC
      LIMIT ? OFFSET ?
    `).all([...params, limit, offset]);

    return { data, total, pages: Math.ceil(total / limit) || 1 };
  }

  static async countNew() {
    const db = getDb();
    const { count } = db.prepare("SELECT COUNT(*) as count FROM feedback WHERE status = 'new'").get();
    return count;
  }

  // Counts per status in one pass, so the filter tabs can show how much is behind
  // each of them without a query each.
  static async countByStatus() {
    const db = getDb();
    const counts = { total: 0 };
    STATUSES.forEach((status) => { counts[status] = 0; });

    db.prepare('SELECT status, COUNT(*) as count FROM feedback GROUP BY status').all().forEach((row) => {
      counts[row.status] = row.count;
      counts.total += row.count;
    });

    return counts;
  }

  static async setStatus(id, status, adminNote = null) {
    if (!STATUSES.includes(status)) {
      throw new Error(`Invalid feedback status: ${status}`);
    }

    const db = getDb();
    return db.prepare(`
      UPDATE feedback
      SET status = ?, admin_note = COALESCE(?, admin_note), updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run([status, adminNote, id]).changes > 0;
  }

  static async remove(id) {
    const db = getDb();
    return db.prepare('DELETE FROM feedback WHERE id = ?').run([id]).changes > 0;
  }
}

Feedback.TYPES = TYPES;
Feedback.STATUSES = STATUSES;
Feedback.MESSAGE_MIN_LENGTH = MESSAGE_MIN_LENGTH;
Feedback.MESSAGE_MAX_LENGTH = MESSAGE_MAX_LENGTH;

module.exports = Feedback;
