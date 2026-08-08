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

  static async findByEmail(email) {
    const db = await getDb();
    const stmt = db.prepare('SELECT * FROM users WHERE email = ?');
    stmt.bind([email]);
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
      email,
      full_name,
      phone = null,
      role = 'user',
      company_name = null,
      language_pref = 'tr',
      currency_pref = 'TRY'
    } = userData;

    const password_hash = userData.password_hash
      || (userData.password ? await bcrypt.hash(userData.password, SALT_ROUNDS) : null);

    if (!password_hash) {
      throw new Error('User.create requires either password or password_hash');
    }

    const stmt = db.prepare(`
      INSERT INTO users (email, password_hash, full_name, phone, role, company_name, language_pref, currency_pref)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run([email, password_hash, full_name, phone, role, company_name, language_pref, currency_pref]);
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
    return this.update(id, { password_hash });
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
