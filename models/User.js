const bcrypt = require('bcryptjs');
const { getDb, saveDb } = require('../config/database');

const SALT_ROUNDS = 10;

class User {
  static async findById(id) {
    const db = await getDb();
    const stmt = db.prepare('SELECT * FROM users WHERE id = ?');
    stmt.bind([id]);
    let row = null;
    if (stmt.step()) {
      row = stmt.getAsObject();
    }
    stmt.free();
    return row;
  }

  // Case-insensitive so that accounts registered before e-mails were normalised
  // (and users typing a capitalised address) still resolve to the same row.
  static async findByEmail(email) {
    if (!email) return null;
    const db = await getDb();
    const stmt = db.prepare('SELECT * FROM users WHERE LOWER(email) = LOWER(?)');
    stmt.bind([String(email).trim()]);
    let row = null;
    if (stmt.step()) {
      row = stmt.getAsObject();
    }
    stmt.free();
    return row;
  }

  static async create(userData) {
    const db = await getDb();
    const {
      full_name,
      phone = null,
      role = 'user',
      company_name = null,
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

    const stmt = db.prepare(`
      INSERT INTO users (email, password_hash, full_name, phone, role, company_name, language_pref, currency_pref, has_password)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run([email, password_hash, full_name, phone, role, company_name, language_pref, currency_pref, has_password]);
    stmt.free();
    
    const idRes = db.exec("SELECT last_insert_rowid() as id");
    const lastId = idRes[0].values[0][0];
    saveDb();
    return lastId;
  }

  static async update(id, updateData) {
    const db = await getDb();
    const keys = Object.keys(updateData);
    if (keys.length === 0) return false;

    const setClause = keys.map(k => `${k} = ?`).join(', ');
    const values = Object.values(updateData);
    
    const stmt = db.prepare(`UPDATE users SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`);
    stmt.run([...values, id]);
    stmt.free();
    
    const changesRes = db.exec("SELECT changes() as changes");
    const changes = changesRes[0].values[0][0];
    if (changes > 0) saveDb();
    return changes > 0;
  }

  static async verifyPassword(plainPassword, hashedPassword) {
    if (!plainPassword || !hashedPassword) return false;
    return bcrypt.compare(plainPassword, hashedPassword);
  }

  static async setPassword(id, plainPassword) {
    const password_hash = await bcrypt.hash(plainPassword, SALT_ROUNDS);
    return this.update(id, { password_hash, has_password: 1 });
  }

  static async isEmailTaken(email, exceptUserId = null) {
    const existing = await this.findByEmail(email);
    if (!existing) return false;
    return exceptUserId == null || existing.id !== Number(exceptUserId);
  }

  static async getStats(id) {
    const db = await getDb();
    
    const listingStmt = db.prepare('SELECT COUNT(*) as count FROM listings WHERE user_id = ?');
    listingStmt.bind([id]);
    let listingsCount = 0;
    if (listingStmt.step()) {
      listingsCount = listingStmt.getAsObject().count;
    }
    listingStmt.free();

    const reviewsStmt = db.prepare('SELECT AVG(rating) as avg_rating, COUNT(*) as review_count FROM reviews WHERE reviewed_user_id = ?');
    reviewsStmt.bind([id]);
    let reviewsData = { avg_rating: 0, review_count: 0 };
    if (reviewsStmt.step()) {
      reviewsData = reviewsStmt.getAsObject();
    }
    reviewsStmt.free();

    return {
      listingsCount,
      averageRating: reviewsData.avg_rating || 0,
      reviewCount: reviewsData.review_count || 0
    };
  }
  static async findAll(page = 1, limit = 20, filters = {}) {
    const db = await getDb();
    let where = ' WHERE 1=1';
    const params = [];

    if (filters.role) {
      where += ' AND u.role = ?';
      params.push(filters.role);
    }
    if (filters.q) {
      where += ' AND (u.full_name LIKE ? OR u.email LIKE ?)';
      params.push(`%${filters.q}%`, `%${filters.q}%`);
    }

    const countStmt = db.prepare(`SELECT COUNT(*) as total FROM users u${where}`);
    countStmt.bind(params);
    let total = 0;
    if (countStmt.step()) {
      total = countStmt.getAsObject().total;
    }
    countStmt.free();

    const offset = (page - 1) * limit;
    const stmt = db.prepare(`
      SELECT u.id, u.email, u.full_name, u.phone, u.role, u.is_active, u.is_verified,
             u.company_name, u.created_at,
             (SELECT COUNT(*) FROM listings WHERE user_id = u.id) as listing_count
      FROM users u${where}
      ORDER BY u.created_at DESC LIMIT ? OFFSET ?
    `);
    stmt.bind([...params, limit, offset]);
    const data = [];
    while (stmt.step()) {
      data.push(stmt.getAsObject());
    }
    stmt.free();

    return { data, total, pages: Math.ceil(total / limit) || 1 };
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
    const db = await getDb();
    const stmt = db.prepare('SELECT COUNT(*) as total FROM users WHERE is_active = 1');
    let total = 0;
    if (stmt.step()) {
      total = stmt.getAsObject().total;
    }
    stmt.free();
    return total;
  }
}

module.exports = User;
