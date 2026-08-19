const bcrypt = require('bcryptjs');
const { getDb } = require('../config/database');

const SALT_ROUNDS = 10;

class User {
  static async findById(id) {
    const db = getDb();
    return db.prepare('SELECT * FROM users WHERE id = ?').get([id]) || null;
  }

  // Case-insensitive so that accounts registered before e-mails were normalised
  // (and users typing a capitalised address) still resolve to the same row.
  static async findByEmail(email) {
    if (!email) return null;
    const db = getDb();
    return db.prepare('SELECT * FROM users WHERE LOWER(email) = LOWER(?)').get([String(email).trim()]) || null;
  }

  static async create(userData) {
    const db = getDb();
    const {
      full_name,
      phone = null,
      role = 'user',
      company_name = null,
      corporate_status = 'none',
      corporate_tax_no = null,
      corporate_applied_at = null,
      language_pref = 'tr',
      currency_pref = 'TRY',
      has_password = 1
    } = userData;

    const email = String(userData.email || '').trim().toLowerCase();

    const password_hash = userData.password_hash
      || (userData.password ? await bcrypt.hash(userData.password, SALT_ROUNDS) : null);

    if (!password_hash) {
      throw new Error('User.create requires either password or password_hash');
    }

    const result = db.prepare(`
      INSERT INTO users (email, password_hash, full_name, phone, role, company_name, corporate_status, corporate_tax_no, corporate_applied_at, language_pref, currency_pref, has_password)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run([email, password_hash, full_name, phone, role, company_name, corporate_status, corporate_tax_no, corporate_applied_at, language_pref, currency_pref, has_password]);

    return Number(result.lastInsertRowid);
  }

  static async update(id, updateData) {
    const db = getDb();
    const keys = Object.keys(updateData);
    if (keys.length === 0) return false;

    const setClause = keys.map(k => `${k} = ?`).join(', ');
    const values = Object.values(updateData);

    const result = db.prepare(`UPDATE users SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run([...values, id]);

    return result.changes > 0;
  }

  static async verifyPassword(plainPassword, hashedPassword) {
    if (!plainPassword || !hashedPassword) return false;
    return bcrypt.compare(plainPassword, hashedPassword);
  }

  static async setPassword(id, plainPassword) {
    const password_hash = await bcrypt.hash(plainPassword, SALT_ROUNDS);
    return this.update(id, { password_hash, has_password: 1, password_reset_token: null, password_reset_expires: null });
  }

  static async setResetToken(userId, token, expiresAt) {
    return this.update(userId, {
      password_reset_token: token,
      password_reset_expires: expiresAt
    });
  }

  static async findByResetToken(token) {
    if (!token) return null;
    const db = getDb();
    const nowISO = new Date().toISOString();
    return db.prepare('SELECT * FROM users WHERE password_reset_token = ? AND password_reset_expires > ? AND is_active = 1').get([token, nowISO]) || null;
  }

  static async clearResetToken(userId) {
    return this.update(userId, {
      password_reset_token: null,
      password_reset_expires: null
    });
  }

  static async setVerificationToken(userId, token, expiresAt) {
    return this.update(userId, {
      email_verification_token: token,
      email_verification_expires: expiresAt
    });
  }

  static async findByVerificationToken(token) {
    if (!token) return null;
    const db = getDb();
    const nowISO = new Date().toISOString();
    return db.prepare('SELECT * FROM users WHERE email_verification_token = ? AND email_verification_expires > ?').get([token, nowISO]) || null;
  }

  static async verifyEmail(userId) {
    return this.update(userId, {
      is_verified: 1,
      email_verification_token: null,
      email_verification_expires: null
    });
  }

  static async isEmailTaken(email, exceptUserId = null) {
    const existing = await this.findByEmail(email);
    if (!existing) return false;
    return exceptUserId == null || existing.id !== Number(exceptUserId);
  }

  static async getStats(id) {
    const db = getDb();

    const { count: listingsCount } = db.prepare('SELECT COUNT(*) as count FROM listings WHERE user_id = ?').get([id]);
    const reviews = db.prepare(
      'SELECT AVG(rating) as avg_rating, COUNT(*) as review_count FROM reviews WHERE reviewed_user_id = ?'
    ).get([id]);

    return {
      listingsCount,
      averageRating: reviews.avg_rating || 0,
      reviewCount: reviews.review_count || 0
    };
  }

  static async findAll(page = 1, limit = 20, filters = {}) {
    const db = getDb();
    let where = ' WHERE 1=1';
    const params = [];

    if (filters.role === 'pending_corporate') {
      where += " AND u.corporate_status = 'pending'";
    } else if (filters.role) {
      where += ' AND u.role = ?';
      params.push(filters.role);
    }
    if (filters.corporate_status) {
      where += ' AND u.corporate_status = ?';
      params.push(filters.corporate_status);
    }
    if (filters.q) {
      where += ' AND (u.full_name LIKE ? OR u.email LIKE ? OR u.company_name LIKE ?)';
      params.push(`%${filters.q}%`, `%${filters.q}%`, `%${filters.q}%`);
    }

    const { total } = db.prepare(`SELECT COUNT(*) as total FROM users u${where}`).get(params);

    const offset = (page - 1) * limit;
    const data = db.prepare(`
      SELECT u.id, u.email, u.full_name, u.phone, u.role, u.is_active, u.is_verified,
             u.company_name, u.corporate_status, u.corporate_tax_no, u.corporate_applied_at,
             u.corporate_reviewed_at, u.created_at, u.last_seen_at,
             (SELECT COUNT(*) FROM listings WHERE user_id = u.id) as listing_count
      FROM users u${where}
      ORDER BY u.created_at DESC LIMIT ? OFFSET ?
    `).all([...params, limit, offset]);

    return { data, total, pages: Math.ceil(total / limit) || 1 };
  }

  static async countPendingCorporate() {
    const db = getDb();
    const row = db.prepare("SELECT COUNT(*) as total FROM users WHERE corporate_status = 'pending'").get();
    return row ? row.total : 0;
  }

  static async approveCorporate(id, role = 'business') {
    const allowed = ['business', 'agent'];
    const targetRole = allowed.includes(role) ? role : 'business';
    const db = getDb();
    const result = db.prepare(`
      UPDATE users 
      SET role = ?, corporate_status = 'approved', corporate_reviewed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).run([targetRole, id]);
    return result.changes > 0;
  }

  static async rejectCorporate(id) {
    const db = getDb();
    const result = db.prepare(`
      UPDATE users 
      SET corporate_status = 'rejected', corporate_reviewed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).run([id]);
    return result.changes > 0;
  }

  static async applyForCorporate(id, { companyName, taxNo } = {}) {
    const db = getDb();
    const result = db.prepare(`
      UPDATE users 
      SET company_name = COALESCE(?, company_name), 
          corporate_tax_no = COALESCE(?, corporate_tax_no), 
          corporate_status = 'pending', 
          corporate_applied_at = CURRENT_TIMESTAMP, 
          updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).run([companyName || null, taxNo || null, id]);
    return result.changes > 0;
  }

  // Bumped from the request pipeline rather than at login: somebody who signed in
  // three weeks ago and has read listings every day since is active, and a login
  // timestamp would report the opposite. updated_at is deliberately left alone —
  // browsing is not an edit to the account, and moving it would make every row
  // look freshly modified in the admin table.
  static async touchLastSeen(id) {
    const db = getDb();
    return db.prepare('UPDATE users SET last_seen_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run([id]).changes > 0;
  }

  static async setActive(id, isActive) {
    return this.update(id, { is_active: isActive ? 1 : 0 });
  }

  static async setRole(id, role) {
    const allowed = ['user', 'business', 'agent', 'admin'];
    if (!allowed.includes(role)) {
      throw new Error(`Invalid role: ${role}`);
    }
    return this.update(id, { role });
  }

  static async countAll() {
    const db = getDb();
    const { total } = db.prepare('SELECT COUNT(*) as total FROM users WHERE is_active = 1').get();
    return total;
  }
}

module.exports = User;
