const { getDb } = require('../config/database');

class Support {
  static async getOrCreateConversation(sessionToken, userDetails = {}) {
    if (!sessionToken || typeof sessionToken !== 'string') {
      throw new Error('Geçersiz oturum belirteci.');
    }

    const db = getDb();
    let conv = db.prepare('SELECT * FROM support_conversations WHERE session_token = ?').get([sessionToken]);

    const userName = (userDetails.name || '').slice(0, 100) || (userDetails.userId ? 'Kullanıcı' : 'Ziyaretçi');
    const userEmail = (userDetails.email || '').slice(0, 150) || null;
    const userId = userDetails.userId || null;

    if (!conv) {
      const info = db.prepare(`
        INSERT INTO support_conversations (
          session_token, user_id, user_name, user_email, status,
          unread_user_count, unread_admin_count, last_message, last_message_at
        ) VALUES (?, ?, ?, ?, 'waiting', 1, 0, ?, CURRENT_TIMESTAMP)
      `).run([
        sessionToken,
        userId,
        userName,
        userEmail,
        'Merhaba! CYPILAN Canlı Destek ekibine hoş geldiniz. Size nasıl yardımcı olabiliriz?'
      ]);

      const conversationId = info.lastInsertRowid;

      // Add system greeting message
      db.prepare(`
        INSERT INTO support_messages (conversation_id, sender_type, sender_name, message, is_read)
        VALUES (?, 'system', 'CYPILAN Destek', ?, 0)
      `).run([
        conversationId,
        'Merhaba! CYPILAN Canlı Destek ekibine hoş geldiniz. İlanlar, üyelik veya genel sorularınız için bize yazabilir ya da aşağıdaki hızlı seçeneklerden birini seçebilirsiniz.'
      ]);

      conv = db.prepare('SELECT * FROM support_conversations WHERE id = ?').get([conversationId]);
    } else if (userId && !conv.user_id) {
      db.prepare(`
        UPDATE support_conversations
        SET user_id = ?, user_name = COALESCE(?, user_name), user_email = COALESCE(?, user_email), updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run([userId, userName, userEmail, conv.id]);
      conv = db.prepare('SELECT * FROM support_conversations WHERE id = ?').get([conv.id]);
    }

    return conv;
  }

  static async getConversationById(id) {
    const db = getDb();
    return db.prepare(`
      SELECT c.*,
             u.full_name as registered_user_name, u.email as registered_user_email, u.avatar_url as registered_user_avatar,
             a.full_name as assigned_admin_name
      FROM support_conversations c
      LEFT JOIN users u ON c.user_id = u.id
      LEFT JOIN users a ON c.assigned_admin_id = a.id
      WHERE c.id = ?
    `).get([id]) || null;
  }

  static async getConversationByToken(sessionToken) {
    const db = getDb();
    return db.prepare('SELECT * FROM support_conversations WHERE session_token = ?').get([sessionToken]) || null;
  }

  static async sendMessage({ conversationId, senderType, senderId = null, senderName, message }) {
    const cleanMessage = String(message || '').trim().slice(0, 2000);
    if (!cleanMessage) {
      throw new Error('Mesaj boş olamaz.');
    }

    const cleanSenderName = String(senderName || 'Kullanıcı').slice(0, 80);
    const db = getDb();

    const info = db.prepare(`
      INSERT INTO support_messages (conversation_id, sender_type, sender_id, sender_name, message, is_read)
      VALUES (?, ?, ?, ?, ?, 0)
    `).run([conversationId, senderType, senderId, cleanSenderName, cleanMessage]);

    const messageId = info.lastInsertRowid;

    if (senderType === 'user') {
      db.prepare(`
        UPDATE support_conversations
        SET last_message = ?,
            last_message_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP,
            unread_admin_count = unread_admin_count + 1,
            status = CASE WHEN status = 'closed' THEN 'waiting' ELSE status END
        WHERE id = ?
      `).run([cleanMessage, conversationId]);
    } else if (senderType === 'admin') {
      db.prepare(`
        UPDATE support_conversations
        SET last_message = ?,
            last_message_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP,
            unread_user_count = unread_user_count + 1,
            status = 'active',
            assigned_admin_id = COALESCE(assigned_admin_id, ?)
        WHERE id = ?
      `).run([cleanMessage, senderId, conversationId]);
    } else {
      // System
      db.prepare(`
        UPDATE support_conversations
        SET last_message = ?,
            last_message_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP,
            unread_user_count = unread_user_count + 1
        WHERE id = ?
      `).run([cleanMessage, conversationId]);
    }

    return db.prepare('SELECT * FROM support_messages WHERE id = ?').get([messageId]);
  }

  static async getMessages(conversationId, afterId = 0) {
    const db = getDb();
    return db.prepare(`
      SELECT * FROM support_messages
      WHERE conversation_id = ? AND id > ?
      ORDER BY id ASC
    `).all([conversationId, Number(afterId) || 0]);
  }

  static async markMessagesRead(conversationId, readerType) {
    const db = getDb();
    if (readerType === 'user') {
      db.prepare(`
        UPDATE support_messages
        SET is_read = 1
        WHERE conversation_id = ? AND sender_type IN ('admin', 'system') AND is_read = 0
      `).run([conversationId]);

      db.prepare(`
        UPDATE support_conversations
        SET unread_user_count = 0
        WHERE id = ?
      `).run([conversationId]);
    } else if (readerType === 'admin') {
      db.prepare(`
        UPDATE support_messages
        SET is_read = 1
        WHERE conversation_id = ? AND sender_type = 'user' AND is_read = 0
      `).run([conversationId]);

      db.prepare(`
        UPDATE support_conversations
        SET unread_admin_count = 0
        WHERE id = ?
      `).run([conversationId]);
    }
    return true;
  }

  static async listConversations({ status = 'all', page = 1, limit = 20, search = '' } = {}) {
    const db = getDb();
    const offset = Math.max(0, (page - 1) * limit);

    let whereClause = '1=1';
    const params = [];

    if (status && status !== 'all') {
      whereClause += ' AND c.status = ?';
      params.push(status);
    }

    if (search && search.trim()) {
      whereClause += ' AND (c.user_name LIKE ? OR c.user_email LIKE ? OR c.last_message LIKE ?)';
      const term = `%${search.trim()}%`;
      params.push(term, term, term);
    }

    const countRow = db.prepare(`
      SELECT COUNT(*) as total
      FROM support_conversations c
      WHERE ${whereClause}
    `).get(params);

    const conversations = db.prepare(`
      SELECT c.*,
             u.full_name as registered_user_name, u.avatar_url as registered_user_avatar,
             a.full_name as assigned_admin_name
      FROM support_conversations c
      LEFT JOIN users u ON c.user_id = u.id
      LEFT JOIN users a ON c.assigned_admin_id = a.id
      WHERE ${whereClause}
      ORDER BY
        CASE c.status
          WHEN 'waiting' THEN 1
          WHEN 'active' THEN 2
          ELSE 3
        END ASC,
        c.last_message_at DESC
      LIMIT ? OFFSET ?
    `).all([...params, limit, offset]);

    return {
      total: countRow ? countRow.total : 0,
      page,
      limit,
      totalPages: Math.ceil((countRow ? countRow.total : 0) / limit),
      data: conversations
    };
  }

  static async countWaiting() {
    const db = getDb();
    const row = db.prepare(`
      SELECT COUNT(*) as count
      FROM support_conversations
      WHERE status = 'waiting' OR unread_admin_count > 0
    `).get();
    return row ? row.count : 0;
  }

  static async updateStatus(conversationId, status, adminId = null) {
    if (!['waiting', 'active', 'closed'].includes(status)) {
      throw new Error('Geçersiz durum.');
    }

    const db = getDb();
    db.prepare(`
      UPDATE support_conversations
      SET status = ?,
          assigned_admin_id = COALESCE(?, assigned_admin_id),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run([status, adminId, conversationId]);

    if (status === 'closed') {
      db.prepare(`
        INSERT INTO support_messages (conversation_id, sender_type, sender_name, message, is_read)
        VALUES (?, 'system', 'CYPILAN Destek', 'Bu canlı destek görüşmesi tamamlanmıştır. Bizi değerlendirmeyi unutmayın!', 0)
      `).run([conversationId]);
    }

    return this.getConversationById(conversationId);
  }

  static async rateConversation(conversationId, rating, comment = null) {
    const numRating = Math.max(1, Math.min(5, parseInt(rating, 10) || 5));
    const cleanComment = comment ? String(comment).trim().slice(0, 500) : null;

    const db = getDb();
    db.prepare(`
      UPDATE support_conversations
      SET rating = ?,
          rating_comment = ?,
          status = 'closed',
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run([numRating, cleanComment, conversationId]);

    return this.getConversationById(conversationId);
  }

  static async deleteConversation(conversationId) {
    const db = getDb();
    db.prepare('DELETE FROM support_conversations WHERE id = ?').run([conversationId]);
    return true;
  }

  static async getStats() {
    const db = getDb();
    const totalRow = db.prepare('SELECT COUNT(*) as count FROM support_conversations').get();
    const waitingRow = db.prepare("SELECT COUNT(*) as count FROM support_conversations WHERE status = 'waiting'").get();
    const activeRow = db.prepare("SELECT COUNT(*) as count FROM support_conversations WHERE status = 'active'").get();
    const closedRow = db.prepare("SELECT COUNT(*) as count FROM support_conversations WHERE status = 'closed'").get();
    const avgRatingRow = db.prepare('SELECT AVG(rating) as avg_rating, COUNT(rating) as rating_count FROM support_conversations WHERE rating IS NOT NULL').get();
    const todayRow = db.prepare("SELECT COUNT(*) as count FROM support_conversations WHERE date(created_at) = date('now')").get();

    return {
      total: totalRow ? totalRow.count : 0,
      waiting: waitingRow ? waitingRow.count : 0,
      active: activeRow ? activeRow.count : 0,
      closed: closedRow ? closedRow.count : 0,
      avgRating: avgRatingRow && avgRatingRow.avg_rating ? parseFloat(avgRatingRow.avg_rating.toFixed(1)) : 5.0,
      ratingCount: avgRatingRow ? avgRatingRow.rating_count : 0,
      today: todayRow ? todayRow.count : 0
    };
  }
}

module.exports = Support;
