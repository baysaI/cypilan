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
      user_id, category_id, title, slug, description, price,
      currency = 'TRY', listing_type = 'sale', status = 'pending',
      location_lat = null, location_lng = null,
      is_premium = 0, is_featured = 0, expires_at = null,
      images = []
    } = listingData;

    const location_city = listingData.location_city ?? listingData.city ?? null;
    const location_district = listingData.location_district ?? listingData.district ?? null;

    const stmt = db.prepare(`
      INSERT INTO listings (
        user_id, category_id, title, slug, description, price, currency,
        listing_type, status, location_city, location_district,
        location_lat, location_lng, is_premium, is_featured, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run([
      user_id, category_id, title, slug, description ?? null, price ?? null, currency,
      listing_type, status, location_city, location_district,
      location_lat, location_lng, is_premium, is_featured, expires_at
    ]);
    stmt.free();

    const idRes = db.exec("SELECT last_insert_rowid() as id");
    const listingId = idRes[0].values[0][0];

    if (Array.isArray(images) && images.length > 0) {
      const imgStmt = db.prepare(
        'INSERT INTO listing_images (listing_id, image_url, is_primary, sort_order) VALUES (?, ?, ?, ?)'
      );
      images.forEach((imageUrl, index) => {
        imgStmt.run([listingId, imageUrl, index === 0 ? 1 : 0, index]);
      });
      imgStmt.free();
    }

    saveDb();
    return this.findById(listingId);
  }

  static async getImages(listingId) {
    const db = await getDb();
    const stmt = db.prepare(
      'SELECT image_url FROM listing_images WHERE listing_id = ? ORDER BY is_primary DESC, sort_order ASC'
    );
    stmt.bind([listingId]);
    const results = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject().image_url);
    }
    stmt.free();
    return results;
  }

  static async findDetailBySlug(slug) {
    const db = await getDb();
    const stmt = db.prepare(`
      SELECT l.*, c.name_tr as category_name, c.slug as category_slug,
             u.full_name as seller_name, u.phone as seller_phone,
             u.avatar_url as seller_avatar, u.role as seller_role,
             u.company_name as seller_company, u.created_at as seller_since
      FROM listings l
      LEFT JOIN categories c ON l.category_id = c.id
      LEFT JOIN users u ON l.user_id = u.id
      WHERE l.slug = ?
    `);
    stmt.bind([slug]);
    let row = null;
    if (stmt.step()) {
      row = stmt.getAsObject();
    }
    stmt.free();

    if (row) {
      row.images = await this.getImages(row.id);
    }
    return row;
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
    const stmt = db.prepare(`
      SELECT l.*, c.name_tr as category_name,
             (SELECT image_url FROM listing_images
               WHERE listing_id = l.id
               ORDER BY is_primary DESC, sort_order ASC LIMIT 1) as primary_image
      FROM listings l
      LEFT JOIN categories c ON l.category_id = c.id
      WHERE l.user_id = ?
      ORDER BY l.created_at DESC LIMIT ? OFFSET ?
    `);
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
    let where = ' WHERE 1=1';
    const params = [];

    if (filters.category) {
      where += ' AND l.category_id = ?';
      params.push(filters.category);
    }
    if (filters.city) {
      where += ' AND l.location_city = ?';
      params.push(filters.city);
    }
    if (filters.q) {
      where += ' AND (l.title LIKE ? OR l.description LIKE ?)';
      params.push(`%${filters.q}%`, `%${filters.q}%`);
    }
    if (filters.minPrice) {
      where += ' AND l.price >= ?';
      params.push(filters.minPrice);
    }
    if (filters.maxPrice) {
      where += ' AND l.price <= ?';
      params.push(filters.maxPrice);
    }

    let orderBy = ' ORDER BY l.created_at DESC';
    if (filters.sort === 'price_asc') {
      orderBy = ' ORDER BY l.price ASC';
    } else if (filters.sort === 'price_desc') {
      orderBy = ' ORDER BY l.price DESC';
    }

    const countStmt = db.prepare(`SELECT COUNT(*) as total FROM listings l${where}`);
    countStmt.bind(params);
    let total = 0;
    if (countStmt.step()) {
      total = countStmt.getAsObject().total;
    }
    countStmt.free();

    const offset = (page - 1) * limit;
    const stmt = db.prepare(`
      SELECT l.*, c.name_tr as category_name,
             (SELECT image_url FROM listing_images
               WHERE listing_id = l.id
               ORDER BY is_primary DESC, sort_order ASC LIMIT 1) as primary_image
      FROM listings l
      LEFT JOIN categories c ON l.category_id = c.id
      ${where}${orderBy} LIMIT ? OFFSET ?
    `);
    stmt.bind([...params, limit, offset]);
    const results = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();

    return { data: results, total, pages: Math.ceil(total / limit) || 1 };
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
