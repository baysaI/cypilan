const { getDb } = require('../config/database');

class Analytics {
  static async getSummary() {
    const db = getDb();

    // Time window definitions for SQLite
    const windows = [
      { key: 'today', whereSql: ">= date('now', 'localtime', 'start of day')" },
      { key: 'week', whereSql: ">= datetime('now', '-7 days')" },
      { key: 'month', whereSql: ">= datetime('now', '-30 days')" },
      { key: 'year', whereSql: ">= datetime('now', '-365 days')" },
      { key: 'all', whereSql: "IS NOT NULL" }
    ];

    const stats = {};

    for (const w of windows) {
      const isAll = w.key === 'all';
      const pvWhere = isAll ? '1=1' : `created_at ${w.whereSql}`;
      const userWhere = isAll ? '1=1' : `created_at ${w.whereSql}`;
      const listingWhere = isAll ? '1=1' : `created_at ${w.whereSql}`;

      const pvRow = db.prepare(`
        SELECT COUNT(*) as views, COUNT(DISTINCT COALESCE(ip_hash, session_id)) as visitors
        FROM page_views WHERE ${pvWhere}
      `).get() || { views: 0, visitors: 0 };

      const userRow = db.prepare(`
        SELECT COUNT(*) as total FROM users WHERE ${userWhere}
      `).get() || { total: 0 };

      const listingRow = db.prepare(`
        SELECT COUNT(*) as total FROM listings WHERE ${listingWhere}
      `).get() || { total: 0 };

      stats[w.key] = {
        views: pvRow.views || 0,
        visitors: pvRow.visitors || 0,
        registrations: userRow.total || 0,
        listings: listingRow.total || 0
      };
    }

    return stats;
  }

  static async getDailyTrends(days = 30) {
    const db = getDb();
    const result = [];

    for (let i = days - 1; i >= 0; i--) {
      const dateRow = db.prepare(`SELECT date('now', 'localtime', '-${i} days') as d`).get();
      const dateStr = dateRow.d;

      const pvRow = db.prepare(`
        SELECT COUNT(*) as views, COUNT(DISTINCT COALESCE(ip_hash, session_id)) as visitors
        FROM page_views WHERE date(created_at, 'localtime') = ?
      `).get([dateStr]) || { views: 0, visitors: 0 };

      const userRow = db.prepare(`
        SELECT COUNT(*) as total FROM users WHERE date(created_at, 'localtime') = ?
      `).get([dateStr]) || { total: 0 };

      const listingRow = db.prepare(`
        SELECT COUNT(*) as total FROM listings WHERE date(created_at, 'localtime') = ?
      `).get([dateStr]) || { total: 0 };

      result.push({
        date: dateStr,
        views: pvRow.views || 0,
        visitors: pvRow.visitors || 0,
        registrations: userRow.total || 0,
        listings: listingRow.total || 0
      });
    }

    return result;
  }

  static async getCategoryDistribution() {
    const db = getDb();
    return db.prepare(`
      SELECT c.name_tr as name, COUNT(l.id) as count
      FROM categories c
      LEFT JOIN listings l ON l.category_id = c.id
      GROUP BY c.id
      HAVING count > 0
      ORDER BY count DESC
      LIMIT 8
    `).all();
  }

  static async getRoleDistribution() {
    const db = getDb();
    return db.prepare(`
      SELECT role, COUNT(*) as count
      FROM users
      GROUP BY role
    `).all();
  }

  static async getStatusDistribution() {
    const db = getDb();
    return db.prepare(`
      SELECT status, COUNT(*) as count
      FROM listings
      GROUP BY status
    `).all();
  }
}

module.exports = Analytics;
