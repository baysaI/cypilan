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

  // --- Yonetici gorunumu ----------------------------------------------------
  //
  // Bir konusma = ayni iki kisi + ayni ilan. Yon onemsiz oldugu icin taraflar
  // MIN/MAX ile siralaniyor: A'dan B'ye ve B'den A'ya giden mesajlar tek
  // konusma sayilmazsa her sohbet listede iki kez gorunurdu.
  static adminStats() {
    const db = getDb();

    const totals = db.prepare(`
      SELECT COUNT(*) AS total_messages,
             COUNT(DISTINCT sender_id) AS senders,
             SUM(CASE WHEN created_at >= datetime('now', '-1 day') THEN 1 ELSE 0 END) AS last_day,
             SUM(CASE WHEN created_at >= datetime('now', '-7 days') THEN 1 ELSE 0 END) AS last_week,
             SUM(CASE WHEN created_at >= datetime('now', '-30 days') THEN 1 ELSE 0 END) AS last_month
      FROM messages
    `).get() || {};

    // Asil soru "mesaj atiliyor mu" degil, "karsi taraf cevap veriyor mu".
    // Tek yonlu bir konusma cogu zaman cevapsiz kalmis bir alici demek ve
    // toplam mesaj sayisi bunu gizler.
    const conversations = db.prepare(`
      SELECT COUNT(*) AS total,
             SUM(CASE WHEN sides > 1 THEN 1 ELSE 0 END) AS two_way
      FROM (
        SELECT COUNT(DISTINCT sender_id) AS sides
        FROM messages
        GROUP BY MIN(sender_id, receiver_id), MAX(sender_id, receiver_id), listing_id
      )
    `).get() || {};

    return {
      totalMessages: totals.total_messages || 0,
      senders: totals.senders || 0,
      lastDay: totals.last_day || 0,
      lastWeek: totals.last_week || 0,
      lastMonth: totals.last_month || 0,
      conversations: conversations.total || 0,
      twoWayConversations: conversations.two_way || 0
    };
  }

  static adminDailyCounts(days = 14) {
    const db = getDb();
    const safeDays = Math.min(Math.max(parseInt(days, 10) || 14, 1), 90);

    return db.prepare(`
      SELECT date(created_at) AS day, COUNT(*) AS total
      FROM messages
      WHERE created_at >= datetime('now', ?)
      GROUP BY day
      ORDER BY day ASC
    `).all(['-' + safeDays + ' days']);
  }

  static adminConversations({ q = '', page = 1, limit = 25 } = {}) {
    const db = getDb();
    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 25, 1), 100);
    const safePage = Math.max(parseInt(page, 10) || 1, 1);
    const offset = (safePage - 1) * safeLimit;

    const term = String(q || '').trim();
    const like = '%' + term + '%';

    // MAX(id) son mesaji veriyor: id artan sirada yazildigi icin bu ayni
    // zamanda kronolojik son mesap. Gruplamadan sonra o satira geri baglanmak,
    // her konusma icin ayri bir alt sorgu calistirmaktan ucuz.
    const base = `
      FROM (
        SELECT MIN(sender_id, receiver_id) AS user_a,
               MAX(sender_id, receiver_id) AS user_b,
               listing_id,
               COUNT(*) AS message_count,
               COUNT(DISTINCT sender_id) AS sides,
               MAX(id) AS last_id,
               MIN(created_at) AS started_at
        FROM messages
        GROUP BY MIN(sender_id, receiver_id), MAX(sender_id, receiver_id), listing_id
      ) g
      JOIN messages lm ON lm.id = g.last_id
      LEFT JOIN users ua ON ua.id = g.user_a
      LEFT JOIN users ub ON ub.id = g.user_b
      LEFT JOIN listings l ON l.id = g.listing_id
    `;

    // Icerik aramasi konusmanin tamamina bakiyor, yalnizca son mesaja degil.
    // Once oyleydi ve sessizce yaniltiyordu: bir kelimeyi arayan yonetici, o
    // kelimenin gectigi ama sohbetin baska bir cumleyle bittigi yazismalari
    // hic gormuyordu. Kucuk bir sitede indekssiz EXISTS yeterince hizli;
    // mesaj sayisi buyurse content uzerinde bir indeks gerekir.
    const where = term
      ? ` WHERE ua.full_name LIKE ? OR ub.full_name LIKE ? OR ua.email LIKE ? OR ub.email LIKE ?
              OR l.title LIKE ?
              OR EXISTS (
                SELECT 1 FROM messages mm
                WHERE MIN(mm.sender_id, mm.receiver_id) = g.user_a
                  AND MAX(mm.sender_id, mm.receiver_id) = g.user_b
                  AND mm.listing_id IS g.listing_id
                  AND mm.content LIKE ?
              )`
      : '';
    const whereParams = term ? [like, like, like, like, like, like] : [];

    const total = db.prepare('SELECT COUNT(*) AS total ' + base + where).get(whereParams).total;

    const data = db.prepare(`
      SELECT g.user_a, g.user_b, g.listing_id, g.message_count, g.sides, g.started_at,
             lm.content AS last_content, lm.created_at AS last_at, lm.sender_id AS last_sender_id,
             ua.full_name AS user_a_name, ua.email AS user_a_email,
             ub.full_name AS user_b_name, ub.email AS user_b_email,
             l.title AS listing_title, l.slug AS listing_slug
      ${base}${where}
      ORDER BY lm.created_at DESC, lm.id DESC
      LIMIT ? OFFSET ?
    `).all([...whereParams, safeLimit, offset]);

    return { data, total, page: safePage, pages: Math.max(1, Math.ceil(total / safeLimit)) };
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
