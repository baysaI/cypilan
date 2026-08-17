const { getDb } = require('../config/database');
const Notification = require('./Notification');

// Announcements sent from the admin panel to many members at once.
//
// The text is whatever the admin typed, so unlike every other notification on the
// site it cannot be translated per recipient — there is no key to look up. That is
// why LANGUAGE is one of the audience filters: writing the Turkish announcement
// and sending it to the members who read Turkish is a better answer than sending
// one language to everybody and hoping.
//
// Suspended accounts are never included. They cannot sign in, so a notification
// waiting for them is a row nobody will ever read.

const AUDIENCES = ['all', 'role', 'language', 'specific'];
const ROLES = ['user', 'business', 'agent', 'admin'];
const LANGUAGES = ['tr', 'en', 'el', 'ru', 'fa'];

const TITLE_MAX_LENGTH = 150;
const MESSAGE_MAX_LENGTH = 2000;
const MESSAGE_MIN_LENGTH = 10;

// A link is stored so the card can carry a "Detayları Gör" button. Only a
// same-site path is accepted: an announcement is the one notification that goes to
// everybody at once, which makes it the worst possible place to put a link to
// somewhere else.
const safeLinkPath = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (!raw.startsWith('/') || raw.startsWith('//')) return null;
  return raw.slice(0, 500);
};

// Accepts commas, semicolons, whitespace and newlines, because the list is going
// to be pasted from somewhere else.
const parseEmails = (value) => [...new Set(
  String(value || '')
    .split(/[\s,;]+/)
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean)
)];

class Broadcast {
  // Who a given filter would reach, resolved before anything is written so the
  // admin sees the real number rather than an estimate.
  static resolveRecipients({ audience, role, language, emails } = {}) {
    const db = getDb();

    if (audience === 'role') {
      if (!ROLES.includes(role)) return { ids: [], unmatched: [] };
      return {
        ids: db.prepare('SELECT id FROM users WHERE is_active = 1 AND role = ?').all([role]).map((r) => r.id),
        unmatched: []
      };
    }

    if (audience === 'language') {
      if (!LANGUAGES.includes(language)) return { ids: [], unmatched: [] };
      // Rows predating the column, or created before a preference was set, are
      // treated as Turkish — the site default, and what those members have been
      // reading all along.
      const ids = language === 'tr'
        ? db.prepare("SELECT id FROM users WHERE is_active = 1 AND COALESCE(language_pref, 'tr') = 'tr'").all().map((r) => r.id)
        : db.prepare('SELECT id FROM users WHERE is_active = 1 AND language_pref = ?').all([language]).map((r) => r.id);
      return { ids, unmatched: [] };
    }

    if (audience === 'specific') {
      const wanted = parseEmails(emails);
      if (wanted.length === 0) return { ids: [], unmatched: [] };

      const placeholders = wanted.map(() => '?').join(',');
      const rows = db.prepare(
        `SELECT id, LOWER(email) as email FROM users WHERE is_active = 1 AND LOWER(email) IN (${placeholders})`
      ).all(wanted);

      const found = new Set(rows.map((row) => row.email));
      return {
        ids: rows.map((row) => row.id),
        // Reported back rather than swallowed: a typo in one address should not
        // look like a successful send to everybody on the list.
        unmatched: wanted.filter((email) => !found.has(email))
      };
    }

    return {
      ids: db.prepare('SELECT id FROM users WHERE is_active = 1').all().map((r) => r.id),
      unmatched: []
    };
  }

  // The numbers the compose form shows next to each option, so the audience is
  // chosen with its size already visible.
  static async audienceCounts() {
    const db = getDb();

    const counts = { all: 0, roles: {}, languages: {} };
    counts.all = db.prepare('SELECT COUNT(*) as count FROM users WHERE is_active = 1').get().count;

    ROLES.forEach((role) => { counts.roles[role] = 0; });
    db.prepare("SELECT role, COUNT(*) as count FROM users WHERE is_active = 1 GROUP BY role")
      .all().forEach((row) => { counts.roles[row.role] = row.count; });

    LANGUAGES.forEach((lang) => { counts.languages[lang] = 0; });
    db.prepare("SELECT COALESCE(language_pref, 'tr') as lang, COUNT(*) as count FROM users WHERE is_active = 1 GROUP BY COALESCE(language_pref, 'tr')")
      .all().forEach((row) => {
        if (Object.prototype.hasOwnProperty.call(counts.languages, row.lang)) counts.languages[row.lang] = row.count;
      });

    return counts;
  }

  // One transaction for the whole send: either every recipient has the
  // announcement and the log records it, or nothing happened at all. A broadcast
  // that half-delivered and left no trace would be impossible to reason about.
  static async send({ title, message, link_url = null, audience = 'all', role = null, language = null, emails = null, sent_by = null }) {
    if (!AUDIENCES.includes(audience)) {
      throw new Error(`Invalid broadcast audience: ${audience}`);
    }

    const cleanTitle = String(title || '').trim().slice(0, TITLE_MAX_LENGTH);
    const cleanMessage = String(message || '').trim().slice(0, MESSAGE_MAX_LENGTH);

    if (!cleanTitle) throw new Error('Broadcast title is required');
    if (cleanMessage.length < MESSAGE_MIN_LENGTH) throw new Error('Broadcast message is too short');

    const db = getDb();
    Notification.ensureTable(db);

    const { ids, unmatched } = this.resolveRecipients({ audience, role, language, emails });
    if (ids.length === 0) {
      return { sent: 0, unmatched, broadcastId: null };
    }

    const link = safeLinkPath(link_url);
    const detail = audience === 'role' ? role
      : audience === 'language' ? language
      : audience === 'specific' ? `${ids.length} adres`
      : null;

    const deliver = db.transaction(() => {
      const insertNotification = db.prepare(`
        INSERT INTO notifications (user_id, actor_id, type, title, message, link_url, is_read, created_at)
        VALUES (?, ?, 'announcement', ?, ?, ?, 0, CURRENT_TIMESTAMP)
      `);

      ids.forEach((userId) => {
        insertNotification.run([userId, sent_by, cleanTitle, cleanMessage, link]);
      });

      const info = db.prepare(`
        INSERT INTO broadcasts (sent_by, title, message, link_url, audience, audience_detail, recipient_count)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run([sent_by, cleanTitle, cleanMessage, link, audience, detail, ids.length]);

      return Number(info.lastInsertRowid);
    });

    return { sent: ids.length, unmatched, broadcastId: deliver() };
  }

  static async history(limit = 20) {
    const db = getDb();
    return db.prepare(`
      SELECT b.*, u.full_name as sent_by_name
      FROM broadcasts b
      LEFT JOIN users u ON b.sent_by = u.id
      ORDER BY b.created_at DESC, b.id DESC
      LIMIT ?
    `).all([limit]);
  }

  // How many of a past announcement's notifications are still unread, so the
  // history can show whether an announcement actually landed.
  static async readStats(broadcast) {
    const db = getDb();
    const row = db.prepare(`
      SELECT COUNT(*) as total, SUM(is_read) as read_count
      FROM notifications
      WHERE type = 'announcement' AND title = ? AND created_at >= ?
    `).get([broadcast.title, broadcast.created_at]);

    return {
      total: row.total || 0,
      read: row.read_count || 0
    };
  }
}

Broadcast.AUDIENCES = AUDIENCES;
Broadcast.ROLES = ROLES;
Broadcast.LANGUAGES = LANGUAGES;
Broadcast.TITLE_MAX_LENGTH = TITLE_MAX_LENGTH;
Broadcast.MESSAGE_MAX_LENGTH = MESSAGE_MAX_LENGTH;
Broadcast.MESSAGE_MIN_LENGTH = MESSAGE_MIN_LENGTH;
Broadcast.safeLinkPath = safeLinkPath;
Broadcast.parseEmails = parseEmails;

module.exports = Broadcast;
