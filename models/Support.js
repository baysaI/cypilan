const { getDb } = require('../config/database');
const Notification = require('./Notification');

const REPRESENTATIVE_PERSONAS = [
  { name: 'Cansu (Müşteri Temsilcisi)', shortName: 'Cansu', gender: 'female' },
  { name: 'Deniz (Müşteri Temsilcisi)', shortName: 'Deniz', gender: 'female' },
  { name: 'Emre (Müşteri Temsilcisi)', shortName: 'Emre', gender: 'male' },
  { name: 'Zeynep (Müşteri Temsilcisi)', shortName: 'Zeynep', gender: 'female' },
  { name: 'Burak (Müşteri Temsilcisi)', shortName: 'Burak', gender: 'male' },
  { name: 'Ece (Müşteri Temsilcisi)', shortName: 'Ece', gender: 'female' },
  { name: 'Murat (Müşteri Temsilcisi)', shortName: 'Murat', gender: 'male' },
  { name: 'Selin (Müşteri Temsilcisi)', shortName: 'Selin', gender: 'female' },
  { name: 'Kaan (Müşteri Temsilcisi)', shortName: 'Kaan', gender: 'male' },
  { name: 'Elif (Müşteri Temsilcisi)', shortName: 'Elif', gender: 'female' },
  { name: 'Mert (Müşteri Temsilcisi)', shortName: 'Mert', gender: 'male' },
  { name: 'Büşra (Müşteri Temsilcisi)', shortName: 'Büşra', gender: 'female' },
  { name: 'Tolga (Müşteri Temsilcisi)', shortName: 'Tolga', gender: 'male' },
  { name: 'Damla (Müşteri Temsilcisi)', shortName: 'Damla', gender: 'female' }
];

function pickRandomPersona() {
  const idx = Math.floor(Math.random() * REPRESENTATIVE_PERSONAS.length);
  return REPRESENTATIVE_PERSONAS[idx];
}

// The table is created if missing on first use, but that check was running on
// every call — and getUnreadCount runs on every page a signed-in visitor opens.
// A CREATE TABLE IF NOT EXISTS parses and compares the schema each time; here it
// cost more than the query it was guarding. Once per process is enough: nothing
// drops the table while the server is up.
let tableEnsured = false;

class Support {
  static ensureTable(db) {
    if (tableEnsured) return;

    db.exec(`
      CREATE TABLE IF NOT EXISTS support_conversations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_token TEXT NOT NULL UNIQUE,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        user_name TEXT,
        user_email TEXT,
        agent_name TEXT,
        status TEXT DEFAULT 'waiting',
        assigned_admin_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        rating INTEGER,
        rating_comment TEXT,
        unread_user_count INTEGER DEFAULT 0,
        unread_admin_count INTEGER DEFAULT 0,
        last_message TEXT,
        last_message_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_support_conversations_token ON support_conversations(session_token);
      CREATE INDEX IF NOT EXISTS idx_support_conversations_status ON support_conversations(status, updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_support_conversations_user ON support_conversations(user_id);

      CREATE TABLE IF NOT EXISTS support_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id INTEGER NOT NULL REFERENCES support_conversations(id) ON DELETE CASCADE,
        sender_type TEXT NOT NULL,
        sender_id INTEGER,
        sender_name TEXT NOT NULL,
        message TEXT NOT NULL,
        is_read INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_support_messages_conv ON support_messages(conversation_id, created_at ASC);
      CREATE INDEX IF NOT EXISTS idx_support_messages_read ON support_messages(conversation_id, is_read);
    `);

    tableEnsured = true;
  }

  static getPersonas() {
    return REPRESENTATIVE_PERSONAS;
  }

  static async getOrCreateConversation(sessionToken, userDetails = {}) {
    if (!sessionToken || typeof sessionToken !== 'string') {
      throw new Error('Geçersiz oturum belirteci.');
    }

    const db = getDb();
    this.ensureTable(db);
    let conv = db.prepare('SELECT * FROM support_conversations WHERE session_token = ?').get([sessionToken]);

    const userName = (userDetails.name || '').slice(0, 100) || (userDetails.userId ? 'Kullanıcı' : 'Ziyaretçi');
    const userEmail = (userDetails.email || '').slice(0, 150) || null;
    let userId = userDetails.userId || null;

    if (userId) {
      const userRow = db.prepare('SELECT id FROM users WHERE id = ?').get([userId]);
      if (!userRow) userId = null;
    }

    if (!conv) {
      const persona = pickRandomPersona();
      const agentName = persona.name;
      const initialGreeting = `Merhaba! Ben ${persona.shortName}, CYPILAN Canlı Destek ekibindenim. Size nasıl yardımcı olabilirim? İlanlar, üyelik veya diğer konular için bana yazabilir ya da aşağıdaki hızlı başlıklardan birini seçebilirsiniz.`;

      const info = db.prepare(`
        INSERT INTO support_conversations (
          session_token, user_id, user_name, user_email, agent_name, status,
          unread_user_count, unread_admin_count, last_message, last_message_at
        ) VALUES (?, ?, ?, ?, ?, 'waiting', 1, 0, ?, CURRENT_TIMESTAMP)
      `).run([
        sessionToken,
        userId,
        userName,
        userEmail,
        agentName,
        initialGreeting
      ]);

      const conversationId = info.lastInsertRowid;

      // Add warm greeting message from representative
      db.prepare(`
        INSERT INTO support_messages (conversation_id, sender_type, sender_name, message, is_read)
        VALUES (?, 'system', ?, ?, 0)
      `).run([
        conversationId,
        agentName,
        initialGreeting
      ]);

      conv = db.prepare('SELECT * FROM support_conversations WHERE id = ?').get([conversationId]);
    } else {
      let needsUpdate = false;
      let newAgentName = conv.agent_name;
      if (!newAgentName) {
        newAgentName = pickRandomPersona().name;
        needsUpdate = true;
      }
      if (userId && !conv.user_id) {
        needsUpdate = true;
      }

      if (needsUpdate) {
        db.prepare(`
          UPDATE support_conversations
          SET user_id = COALESCE(?, user_id),
              user_name = COALESCE(?, user_name),
              user_email = COALESCE(?, user_email),
              agent_name = COALESCE(?, agent_name),
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run([userId, userName, userEmail, newAgentName, conv.id]);
        conv = db.prepare('SELECT * FROM support_conversations WHERE id = ?').get([conv.id]);
      }
    }

    return conv;
  }

  static async getConversationById(id) {
    const db = getDb();
    this.ensureTable(db);
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
    this.ensureTable(db);
    return db.prepare('SELECT * FROM support_conversations WHERE session_token = ?').get([sessionToken]) || null;
  }

  static async sendMessage({ conversationId, senderType, senderId = null, senderName = null, message, notifyAdmin = true }) {
    const cleanMessage = String(message || '').trim().slice(0, 2000);
    if (!cleanMessage) {
      throw new Error('Mesaj boş olamaz.');
    }

    const db = getDb();
    this.ensureTable(db);
    const conv = db.prepare('SELECT * FROM support_conversations WHERE id = ?').get([conversationId]);
    if (!conv) {
      throw new Error('Görüşme bulunamadı.');
    }

    // Resolve representative persona name for admin/system
    let finalSenderName = senderName;
    if (senderType === 'admin' || senderType === 'system') {
      finalSenderName = conv.agent_name || pickRandomPersona().name;
    } else if (!finalSenderName) {
      finalSenderName = conv.user_name || 'Ziyaretçi';
    }

    let validSenderId = null;
    if (senderId) {
      const userRow = db.prepare('SELECT id FROM users WHERE id = ?').get([senderId]);
      if (userRow) validSenderId = userRow.id;
    }

    const info = db.prepare(`
      INSERT INTO support_messages (conversation_id, sender_type, sender_id, sender_name, message, is_read)
      VALUES (?, ?, ?, ?, ?, 0)
    `).run([conversationId, senderType, validSenderId, finalSenderName, cleanMessage]);

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

      // Notify all active site admins only if notifyAdmin is true (skip for automated FAQ chips)
      if (notifyAdmin) {
        try {
          await Notification.notifyAdmins({
            actor_id: conv.user_id || null,
            type: 'support',
            title: 'Canlı Destek Bildirimi',
            message: `${conv.user_name || 'Bir ziyaretçi'} canlı destek üzerinden mesaj gönderdi: "${cleanMessage.slice(0, 60)}${cleanMessage.length > 60 ? '...' : ''}"`,
            link_url: '/admin/canli-destek'
          });
        } catch (notifErr) {
          console.error('Support admin notification error:', notifErr);
        }
      }
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
      `).run([cleanMessage, validSenderId, conversationId]);
    } else {
      // System / Assistant
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
    this.ensureTable(db);
    return db.prepare(`
      SELECT * FROM support_messages
      WHERE conversation_id = ? AND id > ?
      ORDER BY id ASC
    `).all([conversationId, Number(afterId) || 0]);
  }

  static async markMessagesRead(conversationId, readerType) {
    const db = getDb();
    this.ensureTable(db);
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
    this.ensureTable(db);
    const offset = Math.max(0, (page - 1) * limit);

    let whereClause = '1=1';
    const params = [];

    if (status && status !== 'all') {
      whereClause += ' AND c.status = ?';
      params.push(status);
    }

    if (search && search.trim()) {
      whereClause += ' AND (c.user_name LIKE ? OR c.user_email LIKE ? OR c.last_message LIKE ? OR c.agent_name LIKE ?)';
      const term = `%${search.trim()}%`;
      params.push(term, term, term, term);
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
    this.ensureTable(db);
    try {
      const row = db.prepare(`
        SELECT COUNT(*) as count
        FROM support_conversations
        WHERE status = 'waiting' OR unread_admin_count > 0
      `).get();
      return row ? row.count : 0;
    } catch (e) {
      return 0;
    }
  }

  static async getLatestWaiting() {
    const db = getDb();
    this.ensureTable(db);
    try {
      return db.prepare(`
        SELECT id, user_name, user_email, last_message, last_message_at, unread_admin_count, status
        FROM support_conversations
        WHERE status = 'waiting' OR unread_admin_count > 0
        ORDER BY last_message_at DESC
        LIMIT 1
      `).get() || null;
    } catch (e) {
      return null;
    }
  }

  static async updateStatus(conversationId, status, adminId = null) {
    if (!['waiting', 'active', 'closed'].includes(status)) {
      throw new Error('Geçersiz durum.');
    }

    const db = getDb();
    this.ensureTable(db);

    let validAdminId = null;
    if (adminId) {
      const userRow = db.prepare('SELECT id FROM users WHERE id = ?').get([adminId]);
      if (userRow) validAdminId = userRow.id;
    }

    db.prepare(`
      UPDATE support_conversations
      SET status = ?,
          assigned_admin_id = COALESCE(?, assigned_admin_id),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run([status, validAdminId, conversationId]);

    if (status === 'closed') {
      try {
        db.prepare(`
          INSERT INTO support_messages (conversation_id, sender_type, sender_name, message, is_read)
          VALUES (?, 'system_notice', 'CYPILAN Destek', 'Bu canlı destek görüşmesi sonlandırılmıştır. Deneyiminizi değerlendirmeyi unutmayın!', 0)
        `).run([conversationId]);
      } catch (e) {}
    }

    return this.getConversationById(conversationId);
  }

  static async rateConversation(conversationId, rating, comment = null) {
    const numRating = Math.max(1, Math.min(5, parseInt(rating, 10) || 5));
    const cleanComment = comment ? String(comment).trim().slice(0, 500) : null;

    const db = getDb();
    this.ensureTable(db);
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
    this.ensureTable(db);
    db.prepare('DELETE FROM support_conversations WHERE id = ?').run([conversationId]);
    return true;
  }

  static async getStats() {
    const db = getDb();
    this.ensureTable(db);
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
