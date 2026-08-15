const { getDb } = require('../config/database');

class UserBlock {
  static async block(blockerId, blockedId) {
    if (!blockerId || !blockedId || Number(blockerId) === Number(blockedId)) {
      return false;
    }
    const db = getDb();
    const result = db.prepare(`
      INSERT OR IGNORE INTO user_blocks (blocker_id, blocked_id)
      VALUES (?, ?)
    `).run([Number(blockerId), Number(blockedId)]);
    return result.changes > 0;
  }

  static async unblock(blockerId, blockedId) {
    if (!blockerId || !blockedId) return false;
    const db = getDb();
    const result = db.prepare(`
      DELETE FROM user_blocks
      WHERE blocker_id = ? AND blocked_id = ?
    `).run([Number(blockerId), Number(blockedId)]);
    return result.changes > 0;
  }

  static async isBlockedBy(userAId, userBId) {
    if (!userAId || !userBId) return false;
    const db = getDb();
    const row = db.prepare(`
      SELECT 1 FROM user_blocks
      WHERE blocker_id = ? AND blocked_id = ?
    `).get([Number(userAId), Number(userBId)]);
    return Boolean(row);
  }

  static async hasBlockBetween(userAId, userBId) {
    if (!userAId || !userBId) return false;
    const db = getDb();
    const row = db.prepare(`
      SELECT 1 FROM user_blocks
      WHERE (blocker_id = ? AND blocked_id = ?)
         OR (blocker_id = ? AND blocked_id = ?)
    `).get([Number(userAId), Number(userBId), Number(userBId), Number(userAId)]);
    return Boolean(row);
  }

  static async getBlockedUserIds(blockerId) {
    if (!blockerId) return [];
    const db = getDb();
    const rows = db.prepare(`
      SELECT blocked_id FROM user_blocks
      WHERE blocker_id = ?
    `).all([Number(blockerId)]);
    return rows.map(r => r.blocked_id);
  }
}

module.exports = UserBlock;
