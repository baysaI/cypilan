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
    const stmt = db.prepare(`
      SELECT l.*, c.name_tr as category_name, i.image_url as primary_image
      FROM listings l
      LEFT JOIN categories c ON l.category_id = c.id
      LEFT JOIN listing_images i ON l.id = i.listing_id AND (i.is_primary = 1 OR i.id = (SELECT id FROM listing_images WHERE listing_id = l.id LIMIT 1))
      WHERE l.is_featured = 1 AND l.status = 'active'
      GROUP BY l.id
      ORDER BY l.created_at DESC LIMIT ?
    `);
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
    const stmt = db.prepare(`
      SELECT l.*, c.name_tr as category_name, i.image_url as primary_image
      FROM listings l
      LEFT JOIN categories c ON l.category_id = c.id
      LEFT JOIN listing_images i ON l.id = i.listing_id AND (i.is_primary = 1 OR i.id = (SELECT id FROM listing_images WHERE listing_id = l.id LIMIT 1))
      WHERE l.status = 'active'
      GROUP BY l.id
      ORDER BY l.created_at DESC LIMIT ?
    `);
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

  static async search(filters = {}, page = 1, limit = 20) {
    const db = await getDb();
    let query = 'SELECT * FROM listings WHERE 1=1';
    const params = [];

    if (filters.category) {
      query += ' AND category_id = ?';
      params.push(filters.category);
    }
    if (filters.city) {
      query += ' AND location_city = ?';
      params.push(filters.city);
    }

    if (filters.sort === 'price_asc') {
      query += ' ORDER BY price ASC';
    } else if (filters.sort === 'price_desc') {
      query += ' ORDER BY price DESC';
    } else {
      query += ' ORDER BY created_at DESC';
    }

    const offset = (page - 1) * limit;
    query += ` LIMIT ${limit} OFFSET ${offset}`;

    const stmt = db.prepare(query);
    stmt.bind(params);
    const results = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();

    return { data: results, total: results.length, pages: Math.ceil(results.length / limit) || 1 };
  }

  static async findAll(filters, page, limit) {
    return this.search(filters, page, limit);
  }

  static async toggleFavorite(listingId, userId) {
    const db = await getDb();
    const checkStmt = db.prepare('SELECT id FROM favorites WHERE user_id = ? AND listing_id = ?');
    checkStmt.bind([userId, listingId]);
    let exists = false;
    if (checkStmt.step()) {
      exists = true;
    }
    checkStmt.free();

    if (exists) {
      const delStmt = db.prepare('DELETE FROM favorites WHERE user_id = ? AND listing_id = ?');
      delStmt.run([userId, listingId]);
      delStmt.free();
      saveDb();
      return { favorited: false };
    } else {
      const insStmt = db.prepare('INSERT INTO favorites (user_id, listing_id) VALUES (?, ?)');
      insStmt.run([userId, listingId]);
      insStmt.free();
      saveDb();
      return { favorited: true };
    }
  }
  static async countAll() {
    const db = await getDb();
    const stmt = db.prepare('SELECT COUNT(*) as total FROM listings WHERE status = "active"');
    let total = 0;
    if (stmt.step()) {
      total = stmt.getAsObject().total;
    }
    stmt.free();
    return total;
  }
}

module.exports = Listing;
