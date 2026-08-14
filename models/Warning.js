const { getDb } = require('../config/database');

// How many standing warnings a member may hold before the account is restricted.
// Third strike, not first: a mistyped category and a fraud attempt are both
// rule breaches, but only one of them should cost somebody their account on the
// spot — and a moderator who wants that can still suspend directly.
const SUSPENSION_THRESHOLD = 3;

class Warning {
  // Issuing the third warning suspends the account in the same transaction, so
  // the count and the account state can never disagree.
  static async issue({ user_id, issued_by = null, report_id = null, reason, note = null }) {
    const db = getDb();

    const apply = db.transaction(() => {
      db.prepare(`
        INSERT INTO user_warnings (user_id, issued_by, report_id, reason, note)
        VALUES (?, ?, ?, ?, ?)
      `).run([user_id, issued_by, report_id, reason, note]);

      const { count } = db.prepare(
        'SELECT COUNT(*) as count FROM user_warnings WHERE user_id = ? AND is_active = 1'
      ).get([user_id]);

      let suspended = false;
      if (count >= SUSPENSION_THRESHOLD) {
        db.prepare('UPDATE users SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run([user_id]);
        suspended = true;
      }

      return { count, suspended };
    });

    return apply();
  }

  static async forUser(userId, limit = 20) {
    const db = getDb();
    return db.prepare(`
      SELECT w.*, u.full_name as issued_by_name
      FROM user_warnings w
      LEFT JOIN users u ON w.issued_by = u.id
      WHERE w.user_id = ?
      ORDER BY w.created_at DESC
      LIMIT ?
    `).all([userId, limit]);
  }

  static async countActive(userId) {
    const db = getDb();
    const { count } = db.prepare(
      'SELECT COUNT(*) as count FROM user_warnings WHERE user_id = ? AND is_active = 1'
    ).get([userId]);
    return count;
  }

  // Lifting a warning also lifts the suspension it caused, provided the member
  // is no longer at the threshold. Otherwise clearing a mistake would leave the
  // account locked with nothing left to point at.
  static async revoke(warningId) {
    const db = getDb();

    const lift = db.transaction(() => {
      const warning = db.prepare('SELECT * FROM user_warnings WHERE id = ?').get([warningId]);
      if (!warning) return false;

      db.prepare('UPDATE user_warnings SET is_active = 0 WHERE id = ?').run([warningId]);

      const { count } = db.prepare(
        'SELECT COUNT(*) as count FROM user_warnings WHERE user_id = ? AND is_active = 1'
      ).get([warning.user_id]);

      if (count < SUSPENSION_THRESHOLD) {
        db.prepare('UPDATE users SET is_active = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
          .run([warning.user_id]);
      }

      return true;
    });

    return lift();
  }

  static remainingBeforeSuspension(activeCount) {
    return Math.max(0, SUSPENSION_THRESHOLD - activeCount);
  }
}

Warning.SUSPENSION_THRESHOLD = SUSPENSION_THRESHOLD;

module.exports = Warning;
