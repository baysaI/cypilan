const { getDb } = require('../config/database');

// Runtime switches, read on their way through the request pipeline.
//
// A short cache sits in front of the table because maintenance mode is checked
// on every single request. Writing through the cache means a flip takes effect
// immediately in the process that made it; the TTL is what bounds how long a
// second worker can still be serving the old answer.
const CACHE_TTL_MS = 5000;

const cache = new Map();

const readThrough = (key) => {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;

  const db = getDb();
  const row = db.prepare('SELECT value FROM settings WHERE setting_key = ?').get([key]);
  const value = row ? row.value : null;

  cache.set(key, { value, at: Date.now() });
  return value;
};

class Setting {
  static get(key, fallback = null) {
    const value = readThrough(key);
    return value === null ? fallback : value;
  }

  // Stored as '1'/'0' rather than JSON: these are read in middleware on every
  // request and a parse step there buys nothing.
  static getBool(key, fallback = false) {
    const value = readThrough(key);
    if (value === null) return fallback;
    return value === '1' || value === 'true';
  }

  static set(key, value, updatedBy = null) {
    const db = getDb();
    const stored = value === null || value === undefined ? null : String(value);

    db.prepare(`
      INSERT INTO settings (setting_key, value, updated_by, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(setting_key) DO UPDATE SET
        value = excluded.value,
        updated_by = excluded.updated_by,
        updated_at = CURRENT_TIMESTAMP
    `).run([key, stored, updatedBy]);

    cache.set(key, { value: stored, at: Date.now() });
    return stored;
  }

  static setBool(key, value, updatedBy = null) {
    return this.set(key, value ? '1' : '0', updatedBy);
  }

  // Who flipped it and when — the panel shows this so an admin arriving at a
  // closed site can tell whether a colleague did it five minutes ago or whether
  // it has been down since last week.
  static describe(key) {
    const db = getDb();
    return db.prepare(`
      SELECT s.setting_key, s.value, s.updated_at, u.full_name as updated_by_name
      FROM settings s
      LEFT JOIN users u ON s.updated_by = u.id
      WHERE s.setting_key = ?
    `).get([key]) || null;
  }

  // Tests and the seed path need a way to drop the cache without waiting out
  // the TTL.
  static clearCache() {
    cache.clear();
  }
}

Setting.KEYS = {
  MAINTENANCE_ENABLED: 'maintenance.enabled',
  MAINTENANCE_MESSAGE: 'maintenance.message',
  MAINTENANCE_UNTIL: 'maintenance.until',
  UNLIMITED_LISTINGS_MODE: 'listings.unlimited_mode'
};

Setting.CACHE_TTL_MS = CACHE_TTL_MS;

module.exports = Setting;
