const { getDb, saveDb } = require('../config/database');

class Message {
  static async create(messageData) {
    const db = await getDb();
    const { sender_id, receiver_id, listing_id, content } = messageData;
    
    const stmt = db.prepare(`
      INSERT INTO messages (sender_id, receiver_id, listing_id, content)
      VALUES (?, ?, ?, ?)
    `);
    
    stmt.run([sender_id, receiver_id, listing_id, content]);
    stmt.free();
    
    const idRes = db.exec("SELECT last_insert_rowid() as id");
    const lastId = idRes[0].values[0][0];
    saveDb();
    return lastId;
  }

  static async getConversation(userId1, userId2, listingId = null, limit = 50, offset = 0) {
    const db = await getDb();
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

    if (listingId) {
      query += ' AND m.listing_id = ?';
      params.push(listingId);
    }

    query += ' ORDER BY m.created_at ASC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const stmt = db.prepare(query);
    stmt.bind(params);
    const results = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
  }

  static async getInbox(userId) {
    const db = await getDb();
    const stmt = db.prepare(`
      SELECT m1.*,
             CASE WHEN m1.sender_id = ? THEN u2.full_name ELSE u1.full_name END as other_party_name,
             l.title as listing_title
      FROM messages m1
      LEFT JOIN messages m2
        ON (
          (m1.sender_id = m2.sender_id AND m1.receiver_id = m2.receiver_id) OR
          (m1.sender_id = m2.receiver_id AND m1.receiver_id = m2.sender_id)
        ) AND m1.id < m2.id
      JOIN users u1 ON m1.sender_id = u1.id
      JOIN users u2 ON m1.receiver_id = u2.id
      LEFT JOIN listings l ON m1.listing_id = l.id
      WHERE m2.id IS NULL AND (m1.sender_id = ? OR m1.receiver_id = ?)
      ORDER BY m1.created_at DESC
    `);
    
    stmt.bind([userId, userId, userId]);
    const results = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
  }

  static async markAsRead(receiverId, senderId, listingId = null) {
    const db = await getDb();
    let query = 'UPDATE messages SET is_read = 1 WHERE receiver_id = ? AND sender_id = ? AND is_read = 0';
    const params = [receiverId, senderId];

    if (listingId) {
      query += ' AND listing_id = ?';
      params.push(listingId);
    }

    const stmt = db.prepare(query);
    stmt.run(params);
    stmt.free();
    
    const changesRes = db.exec("SELECT changes() as changes");
    const changes = changesRes[0].values[0][0];
    if (changes > 0) saveDb();
    return changes;
  }

  static async getUnreadCount(userId) {
    const db = await getDb();
    const stmt = db.prepare('SELECT COUNT(*) as count FROM messages WHERE receiver_id = ? AND is_read = 0');
    stmt.bind([userId]);
    let count = 0;
    if (stmt.step()) {
      count = stmt.getAsObject().count;
    }
    stmt.free();
    return count;
  }
}

module.exports = Message;
