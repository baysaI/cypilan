const { getDb } = require('../config/database');

const TYPES = ['bug', 'suggestion', 'other'];
const STATUSES = ['new', 'read', 'resolved'];

const MESSAGE_MIN_LENGTH = 5;
const MESSAGE_MAX_LENGTH = 2000;

// The table is created if missing on first use, but that check was running on
// every call — and getUnreadCount runs on every page a signed-in visitor opens.
// A CREATE TABLE IF NOT EXISTS parses and compares the schema each time; here it
// cost more than the query it was guarding. Once per process is enough: nothing
// drops the table while the server is up.
let tableEnsured = false;

class Feedback {
  static ensureTable(db) {
    if (tableEnsured) return;

    db.exec(`
      CREATE TABLE IF NOT EXISTS feedback (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        type TEXT NOT NULL CHECK(type IN ('bug', 'suggestion', 'other')),
        message TEXT NOT NULL,
        contact_email TEXT,
        page_url TEXT,
        status TEXT DEFAULT 'new' CHECK(status IN ('new', 'read', 'resolved')),
        admin_note TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback(status, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback(created_at DESC);
    `);

    tableEnsured = true;
  }

  static async create({ user_id = null, type, message, contact_email = null, page_url = null }) {
    const db = getDb();
    this.ensureTable(db);

    let validUserId = null;
    if (user_id) {
      const userRow = db.prepare('SELECT id FROM users WHERE id = ?').get([user_id]);
      if (userRow) validUserId = userRow.id;
    }

    const result = db.prepare(`
      INSERT INTO feedback (user_id, type, message, contact_email, page_url)
      VALUES (?, ?, ?, ?, ?)
    `).run([validUserId, type, message, contact_email, page_url]);

    return Number(result.lastInsertRowid);
  }

  static async findAll(filters = {}, page = 1, limit = 30) {
    const db = getDb();
    this.ensureTable(db);
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
    this.ensureTable(db);
    try {
      const { count } = db.prepare("SELECT COUNT(*) as count FROM feedback WHERE status = 'new'").get();
      return count || 0;
    } catch (e) {
      return 0;
    }
  }

  // Counts per status in one pass, so the filter tabs can show how much is behind
  // each of them without a query each.
  static async countByStatus() {
    const db = getDb();
    this.ensureTable(db);
    const counts = { total: 0 };
    STATUSES.forEach((status) => { counts[status] = 0; });

    try {
      db.prepare('SELECT status, COUNT(*) as count FROM feedback GROUP BY status').all().forEach((row) => {
        counts[row.status] = row.count;
        counts.total += row.count;
      });
    } catch (e) {}

    return counts;
  }

  static async setStatus(id, status, adminNote = null) {
    if (!STATUSES.includes(status)) {
      throw new Error(`Invalid feedback status: ${status}`);
    }

    const db = getDb();
    this.ensureTable(db);
    return db.prepare(`
      UPDATE feedback
      SET status = ?, admin_note = COALESCE(?, admin_note), updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run([status, adminNote, id]).changes > 0;
  }

  static async remove(id) {
    const db = getDb();
    this.ensureTable(db);
    return db.prepare('DELETE FROM feedback WHERE id = ?').run([id]).changes > 0;
  }
}

Feedback.TYPES = TYPES;
Feedback.STATUSES = STATUSES;
Feedback.MESSAGE_MIN_LENGTH = MESSAGE_MIN_LENGTH;
Feedback.MESSAGE_MAX_LENGTH = MESSAGE_MAX_LENGTH;

module.exports = Feedback;
