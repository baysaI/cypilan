const { getDb, saveDb } = require('../config/database');

class Listing {
  static async findById(id) {
    const db = await getDb();
    const stmt = db.prepare('SELECT * FROM listings WHERE id = ?');
    stmt.bind([id]);
    let row = null;
    if (stmt.step()) {
      row = stmt.getAsObject();
    }
    stmt.free();
    return row;
  }

  static async findBySlug(slug) {
    const db = await getDb();
    const stmt = db.prepare('SELECT * FROM listings WHERE slug = ?');
    stmt.bind([slug]);
    let row = null;
    if (stmt.step()) {
      row = stmt.getAsObject();
    }
    stmt.free();
    return row;
  }

  static async create(listingData) {
    const db = await getDb();
    const {
      user_id, category_id, title, slug, description, price, currency,
      listing_type, status, location_city, location_district,
      location_lat, location_lng, is_premium = 0, is_featured = 0, expires_at
    } = listingData;

    const stmt = db.prepare(`
      INSERT INTO listings (
        user_id, category_id, title, slug, description, price, currency,
        listing_type, status, location_city, location_district,
        location_lat, location_lng, is_premium, is_featured, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run([
      user_id, category_id, title, slug, description, price, currency,
      listing_type, status, location_city, location_district,
      location_lat, location_lng, is_premium, is_featured, expires_at
    ]);
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
    
    const stmt = db.prepare(`UPDATE listings SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`);
    stmt.run([...values, id]);
    stmt.free();
    
    const changesRes = db.exec("SELECT changes() as changes");
    const changes = changesRes[0].values[0][0];
    if (changes > 0) saveDb();
    return changes > 0;
  }

  static async delete(id) {
    const db = await getDb();
    const stmt = db.prepare('DELETE FROM listings WHERE id = ?');
    stmt.run([id]);
    stmt.free();
    
    const changesRes = db.exec("SELECT changes() as changes");
    const changes = changesRes[0].values[0][0];
    if (changes > 0) saveDb();
    return changes > 0;
  }

  static async search(filters = {}, limit = 20, offset = 0) {
    const db = await getDb();
    let query = 'SELECT * FROM listings WHERE status = "active"';
    const params = [];

    if (filters.category_id) {
      query += ' AND category_id = ?';
      params.push(filters.category_id);
    }
    
    if (filters.listing_type) {
      query += ' AND listing_type = ?';
      params.push(filters.listing_type);
    }
    
    if (filters.q) {
      query += ' AND (title LIKE ? OR description LIKE ?)';
      params.push(`%${filters.q}%`, `%${filters.q}%`);
    }
    
    if (filters.min_price) {
      query += ' AND price >= ?';
      params.push(filters.min_price);
    }
    
    if (filters.max_price) {
      query += ' AND price <= ?';
      params.push(filters.max_price);
    }

    query += ' ORDER BY is_premium DESC, created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const stmt = db.prepare(query);
    stmt.bind(params);
    const results = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
  }

  static async getByCategory(categoryId, limit = 20, offset = 0) {
    const db = await getDb();
    const stmt = db.prepare('SELECT * FROM listings WHERE category_id = ? AND status = "active" ORDER BY is_premium DESC, created_at DESC LIMIT ? OFFSET ?');
    stmt.bind([categoryId, limit, offset]);
    const results = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
  }

  static async getByUser(userId, limit = 20, offset = 0) {
    const db = await getDb();
    const stmt = db.prepare('SELECT * FROM listings WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?');
    stmt.bind([userId, limit, offset]);
    const results = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
  }

  static async getFeatured(limit = 10) {
    const db = await getDb();
    const stmt = db.prepare('SELECT * FROM listings WHERE is_featured = 1 AND status = "active" ORDER BY created_at DESC LIMIT ?');
    stmt.bind([limit]);
    const results = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
  }

  static async getRecent(limit = 10) {
    const db = await getDb();
    const stmt = db.prepare('SELECT * FROM listings WHERE status = "active" ORDER BY created_at DESC LIMIT ?');
    stmt.bind([limit]);
    const results = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
  }

  static async incrementViews(id) {
    const db = await getDb();
    const stmt = db.prepare('UPDATE listings SET views_count = views_count + 1 WHERE id = ?');
    stmt.run([id]);
    stmt.free();
    const changesRes = db.exec("SELECT changes() as changes");
    const changes = changesRes[0].values[0][0];
    if (changes > 0) saveDb();
    return changes > 0;
  }

  static async getAttributes(listingId) {
    const db = await getDb();
    const stmt = db.prepare('SELECT attribute_key, attribute_value FROM listing_attributes WHERE listing_id = ?');
    stmt.bind([listingId]);
    const results = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
  }

  static async setAttributes(listingId, attributes = {}) {
    const db = await getDb();
    const deleteStmt = db.prepare('DELETE FROM listing_attributes WHERE listing_id = ?');
    deleteStmt.run([listingId]);
    deleteStmt.free();

    if (Object.keys(attributes).length > 0) {
      const insertStmt = db.prepare('INSERT INTO listing_attributes (listing_id, attribute_key, attribute_value) VALUES (?, ?, ?)');
      for (const [key, value] of Object.entries(attributes)) {
        insertStmt.run([listingId, key, value]);
      }
      insertStmt.free();
    }
    saveDb();
    return true;
  }
}

module.exports = Listing;
