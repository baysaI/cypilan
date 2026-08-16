const { getDb } = require('../config/database');

class Notification {
  static async create({ user_id, actor_id = null, type, title, message, link_url = null }) {
    if (!user_id || !title || !message) {
      throw new Error('user_id, title and message are required for notification');
    }

    const db = getDb();
    const info = db.prepare(`
      INSERT INTO notifications (user_id, actor_id, type, title, message, link_url, is_read, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP)
    `).run([user_id, actor_id, type || 'system', title, message, link_url]);

    return this.findById(info.lastInsertRowid);
  }

  static async findById(id, userId = null) {
    const db = getDb();
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
      ORDER BY n.created_at DESC
      LIMIT ? OFFSET ?
    `).all([...params, limit, offset]);

    return rows;
  }

  static async countForUser(userId, { unreadOnly = false } = {}) {
    const db = getDb();
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
    const row = db.prepare(
      'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0'
    ).get([userId]);
    return row ? row.count : 0;
  }

  static async markAsRead(id, userId = null) {
    const db = getDb();
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
    const result = db.prepare(
      'UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0'
    ).run([userId]);
    return result.changes > 0;
  }

  static async delete(id, userId) {
    const db = getDb();
    const result = db.prepare(
      'DELETE FROM notifications WHERE id = ? AND user_id = ?'
    ).run([id, userId]);
    return result.changes > 0;
  }

  static async deleteAll(userId) {
    const db = getDb();
    const result = db.prepare(
      'DELETE FROM notifications WHERE user_id = ?'
    ).run([userId]);
    return result.changes > 0;
  }
}

module.exports = Notification;
