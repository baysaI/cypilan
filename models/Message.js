const { getDb } = require('../config/database');

class Message {
  static async create(messageData) {
    const db = getDb();
    const { sender_id, receiver_id, content } = messageData;
    const listing_id = messageData.listing_id != null ? messageData.listing_id : null;

    const result = db.prepare(`
      INSERT INTO messages (sender_id, receiver_id, listing_id, content)
      VALUES (?, ?, ?, ?)
    `).run([sender_id, receiver_id, listing_id, content]);

    return Number(result.lastInsertRowid);
  }

  static async getConversation(userId1, userId2, listingId = null, limit = 200, offset = 0) {
    const db = getDb();
    let query = `
      SELECT m.*,
             s.full_name as sender_name,
             r.full_name as receiver_name
      FROM messages m
      JOIN users s ON m.sender_id = s.id
      JOIN users r ON m.receiver_id = r.id
      WHERE ((m.sender_id = ? AND m.receiver_id = ?)
         OR (m.sender_id = ? AND m.receiver_id = ?))
    `;
    const params = [userId1, userId2, userId2, userId1];

    if (listingId != null) {
      query += ' AND m.listing_id = ?';
      params.push(listingId);
    } else {
      query += ' AND m.listing_id IS NULL';
    }

    query += ' ORDER BY m.created_at ASC, m.id ASC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    return db.prepare(query).all(params);
  }

  static async getInbox(userId) {
    const db = getDb();
    return db.prepare(`
      SELECT m.id, m.content, m.created_at, m.listing_id, m.sender_id,
             CASE WHEN m.sender_id = ? THEN m.receiver_id ELSE m.sender_id END as other_party_id,
             CASE WHEN m.sender_id = ? THEN r.full_name ELSE s.full_name END as other_party_name,
             CASE WHEN m.sender_id = ? THEN r.avatar_url ELSE s.avatar_url END as other_party_avatar,
             l.title as listing_title,
             l.slug as listing_slug,
             (SELECT COUNT(*) FROM messages um
               WHERE um.receiver_id = ?
                 AND um.is_read = 0
                 AND um.sender_id = CASE WHEN m.sender_id = ? THEN m.receiver_id ELSE m.sender_id END
                 AND ((um.listing_id IS NULL AND m.listing_id IS NULL) OR um.listing_id = m.listing_id)
             ) as unread_count
      FROM messages m
      JOIN users s ON m.sender_id = s.id
      JOIN users r ON m.receiver_id = r.id
      LEFT JOIN listings l ON m.listing_id = l.id
      WHERE m.id IN (
        SELECT MAX(id) FROM messages
        WHERE sender_id = ? OR receiver_id = ?
        GROUP BY
          CASE WHEN sender_id < receiver_id THEN sender_id ELSE receiver_id END,
          CASE WHEN sender_id < receiver_id THEN receiver_id ELSE sender_id END,
          COALESCE(listing_id, 0)
      )
      ORDER BY m.created_at DESC, m.id DESC
    `).all([userId, userId, userId, userId, userId, userId, userId]);
  }

  static async markAsRead(receiverId, senderId, listingId = null) {
    const db = getDb();
    let query = 'UPDATE messages SET is_read = 1 WHERE receiver_id = ? AND sender_id = ? AND is_read = 0';
    const params = [receiverId, senderId];

    if (listingId != null) {
      query += ' AND listing_id = ?';
      params.push(listingId);
    } else {
      query += ' AND listing_id IS NULL';
    }

    return db.prepare(query).run(params).changes;
  }

  static async getUnreadCount(userId) {
    const db = getDb();
    const { count } = db.prepare('SELECT COUNT(*) as count FROM messages WHERE receiver_id = ? AND is_read = 0').get([userId]);
    return count;
  }
}

module.exports = Message;
