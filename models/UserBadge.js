const { getDb } = require('../config/database');
const userBadges = require('../config/userBadges');

// Rows are read on every profile view and every listing page, so the queries
// here stay narrow: one index on user_id carries all of them.
//
// Expiry is filtered in SQL rather than in JavaScript. A monthly title that has
// run out must disappear everywhere at once — profile, seller box, admin list —
// and the only way to be sure of that is for no caller to have the option of
// forgetting the check.
const ACTIVE = '(expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)';

class UserBadge {
  // Granting the same badge twice is an extension, not a duplicate: awarding
  // "Ayın Emlakçısı" to the same member two months running should move the end
  // date, not leave two identical pills on their profile. The UNIQUE constraint
  // on (user_id, badge_key) is what makes that the only possible outcome.
  //
  // Returns whether this was a first grant, because that decides the wording of
  // the notification the member gets.
  static grant(userId, badgeKey, { grantedBy = null, note = null, expiresAt = undefined } = {}) {
    if (!userBadges.isKnownKey(badgeKey)) return null;

    const db = getDb();
    const existing = db.prepare(
      `SELECT id FROM user_badges WHERE user_id = ? AND badge_key = ? AND ${ACTIVE}`
    ).get([userId, badgeKey]);

    const expiry = expiresAt === undefined ? userBadges.defaultExpiry(badgeKey) : expiresAt;

    db.prepare(`
      INSERT INTO user_badges (user_id, badge_key, note, granted_by, granted_at, expires_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
      ON CONFLICT(user_id, badge_key) DO UPDATE SET
        note = excluded.note,
        granted_by = excluded.granted_by,
        granted_at = CURRENT_TIMESTAMP,
        expires_at = excluded.expires_at
    `).run([userId, badgeKey, note, grantedBy, expiry]);

    return { badgeKey, expiresAt: expiry, isNew: !existing };
  }

  static revoke(userId, badgeKey) {
    const db = getDb();
    const result = db.prepare(
      'DELETE FROM user_badges WHERE user_id = ? AND badge_key = ?'
    ).run([userId, badgeKey]);

    return result.changes > 0;
  }

  // What a visitor sees. Newest first so a title awarded this morning leads.
  static forUser(userId) {
    const db = getDb();
    return db.prepare(`
      SELECT badge_key, note, granted_at, expires_at
      FROM user_badges
      WHERE user_id = ? AND ${ACTIVE}
      ORDER BY granted_at DESC
    `).all([userId]);
  }

  // One query for a page full of members. Called with an empty list — a page of
  // listings whose sellers are all unknown — it must not build "IN ()", which is
  // a syntax error rather than an empty result.
  static forUsers(userIds = []) {
    const ids = [...new Set(userIds.map(Number).filter(Number.isInteger))];
    const grouped = new Map();
    if (ids.length === 0) return grouped;

    const db = getDb();
    const rows = db.prepare(`
      SELECT user_id, badge_key, granted_at, expires_at
      FROM user_badges
      WHERE user_id IN (${ids.map(() => '?').join(',')}) AND ${ACTIVE}
      ORDER BY granted_at DESC
    `).all(ids);

    rows.forEach((row) => {
      if (!grouped.has(row.user_id)) grouped.set(row.user_id, []);
      grouped.get(row.user_id).push(row);
    });

    return grouped;
  }

  // The admin screen also shows what has already run out: an expired title is
  // the reason somebody is on that screen looking to award it to the next
  // winner, so hiding it would hide the answer.
  static adminListForUser(userId) {
    const db = getDb();
    return db.prepare(`
      SELECT b.badge_key, b.note, b.granted_at, b.expires_at,
             u.full_name AS granted_by_name,
             CASE WHEN b.expires_at IS NOT NULL AND b.expires_at <= CURRENT_TIMESTAMP
                  THEN 1 ELSE 0 END AS is_expired
      FROM user_badges b
      LEFT JOIN users u ON b.granted_by = u.id
      WHERE b.user_id = ?
      ORDER BY is_expired ASC, b.granted_at DESC
    `).all([userId]);
  }

  // Who currently holds a given title. "Ayın Emlakçısı" is meant for one person
  // at a time and the admin has no other way to see who that is.
  static holdersOf(badgeKey) {
    const db = getDb();
    return db.prepare(`
      SELECT b.user_id, b.granted_at, b.expires_at, u.full_name, u.company_name
      FROM user_badges b
      JOIN users u ON b.user_id = u.id
      WHERE b.badge_key = ? AND ${ACTIVE}
      ORDER BY b.granted_at DESC
    `).all([badgeKey]);
  }

  static countActive(userId) {
    const db = getDb();
    const row = db.prepare(
      `SELECT COUNT(*) AS total FROM user_badges WHERE user_id = ? AND ${ACTIVE}`
    ).get([userId]);

    return row ? row.total : 0;
  }
}

module.exports = UserBadge;
