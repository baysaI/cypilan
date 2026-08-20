const { getDb } = require('../config/database');

class Notification {
  static ensureTable(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        link_url TEXT,
        is_read INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, is_read, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at DESC);
    `);
  }

  static async create({ user_id, actor_id = null, type, title, message, link_url = null }) {
    if (!user_id || !title || !message) {
      throw new Error('user_id, title and message are required for notification');
    }

    const db = getDb();
    this.ensureTable(db);

    const userRow = db.prepare('SELECT id FROM users WHERE id = ?').get([user_id]);
    if (!userRow) return null;

    let validActorId = null;
    if (actor_id) {
      const actorRow = db.prepare('SELECT id FROM users WHERE id = ?').get([actor_id]);
      if (actorRow) validActorId = actorRow.id;
    }

    const info = db.prepare(`
      INSERT INTO notifications (user_id, actor_id, type, title, message, link_url, is_read, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP)
    `).run([user_id, validActorId, type || 'system', title, message, link_url]);

    return this.findById(info.lastInsertRowid);
  }

  /**
   * Broadcasts a notification to an entire corporate category / group (e.g. real_estate, auto).
   */
  static async notifyCorporateGroup({ corporate_type = null, exclude_user_id = null, actor_id = null, title, message, link_url = null }) {
    if (!title || !message) return;
    const db = getDb();
    this.ensureTable(db);

    let where = "WHERE role IN ('business', 'agent') AND is_active = 1 AND corporate_status = 'approved'";
    const params = [];

    if (corporate_type) {
      where += " AND (corporate_type = ? OR (corporate_type IS NULL AND role IN ('business', 'agent')))";
      params.push(corporate_type);
    }
    if (exclude_user_id) {
      where += " AND id != ?";
      params.push(exclude_user_id);
    }

    let validActorId = null;
    if (actor_id) {
      const actorRow = db.prepare('SELECT id FROM users WHERE id = ?').get([actor_id]);
      if (actorRow) validActorId = actorRow.id;
    }

    const recipients = db.prepare(`SELECT id FROM users ${where}`).all(params);
    const stmt = db.prepare(`
      INSERT INTO notifications (user_id, actor_id, type, title, message, link_url, is_read, created_at)
      VALUES (?, ?, 'bid', ?, ?, ?, 0, CURRENT_TIMESTAMP)
    `);

    for (const r of recipients) {
      try {
        stmt.run([r.id, validActorId, title, message, link_url]);
      } catch (err) {
        console.error('Notify corporate user error:', err);
      }
    }
  }

  static async findById(id, userId = null) {
    const db = getDb();
    this.ensureTable(db);
    let query = `
      SELECT n.*, u.full_name as actor_name, u.avatar_url as actor_avatar
      FROM notifications n
      LEFT JOIN users u ON n.actor_id = u.id
      WHERE n.id = ?
    `;
    const params = [id];
    if (userId) {
      query += ' AND n.user_id = ?';
      params.push(userId);
    }
    return db.prepare(query).get(params) || null;
  }

  static async getByUserId(userId, { limit = 50, offset = 0, unreadOnly = false } = {}) {
    const db = getDb();
    this.ensureTable(db);
    let whereClause = 'WHERE n.user_id = ?';
    const params = [userId];

    if (unreadOnly) {
      whereClause += ' AND n.is_read = 0';
    }

    const rows = db.prepare(`
      SELECT n.*, u.full_name as actor_name, u.avatar_url as actor_avatar
      FROM notifications n
      LEFT JOIN users u ON n.actor_id = u.id
      ${whereClause}
      ORDER BY n.created_at DESC, n.id DESC
      LIMIT ? OFFSET ?
    `).all([...params, limit, offset]);

    return rows;
  }

  static async countForUser(userId, { unreadOnly = false } = {}) {
    const db = getDb();
    this.ensureTable(db);
    let query = 'SELECT COUNT(*) as count FROM notifications WHERE user_id = ?';
    const params = [userId];

    if (unreadOnly) {
      query += ' AND is_read = 0';
    }

    const row = db.prepare(query).get(params);
    return row ? row.count : 0;
  }

  static async getRecent(userId, limit = 5) {
    return this.getByUserId(userId, { limit, offset: 0 });
  }

  static async getUnreadCount(userId) {
    if (!userId) return 0;
    const db = getDb();
    this.ensureTable(db);
    const row = db.prepare(
      'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0'
    ).get([userId]);
    return row ? row.count : 0;
  }

  static async markAsRead(id, userId = null) {
    const db = getDb();
    this.ensureTable(db);
    let query = 'UPDATE notifications SET is_read = 1 WHERE id = ?';
    const params = [id];
    if (userId) {
      query += ' AND user_id = ?';
      params.push(userId);
    }
    const result = db.prepare(query).run(params);
    return result.changes > 0;
  }

  static async markAllAsRead(userId) {
    if (!userId) return false;
    const db = getDb();
    this.ensureTable(db);
    const result = db.prepare(
      'UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0'
    ).run([userId]);
    return result.changes > 0;
  }

  static async delete(id, userId) {
    const db = getDb();
    this.ensureTable(db);
    const result = db.prepare(
      'DELETE FROM notifications WHERE id = ? AND user_id = ?'
    ).run([id, userId]);
    return result.changes > 0;
  }

  static async deleteAll(userId) {
    const db = getDb();
    this.ensureTable(db);
    const result = db.prepare(
      'DELETE FROM notifications WHERE user_id = ?'
    ).run([userId]);
    return result.changes > 0;
  }

  static async notifyAdmins({ actor_id = null, type = 'support', title, message, link_url = '/admin/canli-destek' }) {
    if (!title || !message) return [];
    const db = getDb();
    this.ensureTable(db);

    let validActorId = null;
    if (actor_id) {
      const actorRow = db.prepare('SELECT id FROM users WHERE id = ?').get([actor_id]);
      if (actorRow) validActorId = actorRow.id;
    }

    const adminRows = db.prepare("SELECT id FROM users WHERE role = 'admin' AND is_active = 1").all();
    const notifications = [];
    for (const admin of adminRows) {
      const info = db.prepare(`
        INSERT INTO notifications (user_id, actor_id, type, title, message, link_url, is_read, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP)
      `).run([admin.id, validActorId, type, title, message, link_url]);
      notifications.push(info.lastInsertRowid);
    }
    return notifications;
  }
}

module.exports = Notification;
