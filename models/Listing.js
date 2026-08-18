const { getDb } = require('../config/database');

class Listing {
  static async findById(id) {
    const db = getDb();
    return db.prepare('SELECT * FROM listings WHERE id = ?').get([id]) || null;
  }

  static async findBySlug(slug) {
    const db = getDb();
    return db.prepare('SELECT * FROM listings WHERE slug = ?').get([slug]) || null;
  }

  static async create(listingData) {
    const db = getDb();
    const {
      user_id, category_id, title, slug, description, price,
      currency = 'TRY', listing_type = 'sale', status = 'pending',
      location_lat = null, location_lng = null,
      is_premium = 0, is_featured = 0, expires_at = null,
      is_urgent = 0, is_opportunity = 0, is_negotiable = 0,
      images = []
    } = listingData;

    const location_city = listingData.location_city ?? listingData.city ?? null;
    const location_district = listingData.location_district ?? listingData.district ?? null;

    // One transaction, so a listing can never end up half-written with some of
    // its images missing.
    const insert = db.transaction(() => {
      const result = db.prepare(`
        INSERT INTO listings (
          user_id, category_id, title, slug, description, price, currency,
          listing_type, status, location_city, location_district,
          location_lat, location_lng, is_premium, is_featured, expires_at,
          is_urgent, is_opportunity, is_negotiable
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run([
        user_id, category_id, title, slug, description ?? null, price ?? null, currency,
        listing_type, status, location_city, location_district,
        location_lat, location_lng, is_premium, is_featured, expires_at,
        is_urgent, is_opportunity, is_negotiable
      ]);

      const listingId = Number(result.lastInsertRowid);

      if (Array.isArray(images) && images.length > 0) {
        const imgStmt = db.prepare(
          'INSERT INTO listing_images (listing_id, image_url, is_primary, sort_order) VALUES (?, ?, ?, ?)'
        );
        images.forEach((imageUrl, index) => {
          imgStmt.run([listingId, imageUrl, index === 0 ? 1 : 0, index]);
        });
      }

      return listingId;
    });

    return this.findById(insert());
  }

  static async getImages(listingId) {
    const db = getDb();
    return db.prepare(
      'SELECT image_url FROM listing_images WHERE listing_id = ? ORDER BY is_primary DESC, sort_order ASC'
    ).all([listingId]).map(row => row.image_url);
  }

  static async replaceImages(listingId, images = []) {
    const db = getDb();

    db.transaction(() => {
      db.prepare('DELETE FROM listing_images WHERE listing_id = ?').run([listingId]);

      if (Array.isArray(images) && images.length > 0) {
        const imgStmt = db.prepare(
          'INSERT INTO listing_images (listing_id, image_url, is_primary, sort_order) VALUES (?, ?, ?, ?)'
        );
        images.forEach((imageUrl, index) => {
          imgStmt.run([listingId, imageUrl, index === 0 ? 1 : 0, index]);
        });
      }
    })();

    return true;
  }

  static async findDetailBySlug(slug) {
    const db = getDb();
    const row = db.prepare(`
      SELECT l.*, c.name_tr as category_name, c.name_en as category_name_en, c.name_el as category_name_el, c.name_ru as category_name_ru, c.name_fa as category_name_fa, c.slug as category_slug,
             u.full_name as seller_name, u.phone as seller_phone,
             COALESCE(u.show_phone, 1) as seller_show_phone,
             COALESCE(u.show_surname, 0) as seller_show_surname,
             u.avatar_url as seller_avatar, u.role as seller_role,
             u.company_name as seller_company, u.created_at as seller_since,
             u.last_seen_at as seller_last_seen
      FROM listings l
      LEFT JOIN categories c ON l.category_id = c.id
      LEFT JOIN users u ON l.user_id = u.id
      WHERE l.slug = ?
    `).get([slug]);

    if (!row) return null;

    row.images = await this.getImages(row.id);
    const rawAttrs = await this.getAttributes(row.id);
    const attrMap = {};
    if (Array.isArray(rawAttrs)) {
      rawAttrs.forEach(a => {
        attrMap[a.attribute_key] = a.attribute_value;
      });
    }
    row.attributes = attrMap;
    return row;
  }

  static async update(id, updateData) {
    const db = getDb();
    const keys = Object.keys(updateData);
    if (keys.length === 0) return false;

    const oldListing = db.prepare('SELECT * FROM listings WHERE id = ?').get([id]);

    const setClause = keys.map(k => `${k} = ?`).join(', ');
    const values = Object.values(updateData);

    const changes = db.prepare(`UPDATE listings SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run([...values, id]).changes;

    if (changes > 0 && oldListing && updateData.price !== undefined && oldListing.price !== null) {
      const oldPrice = Number(oldListing.price);
      const newPrice = Number(updateData.price);
      if (newPrice < oldPrice) {
        try {
          const PriceAlert = require('./PriceAlert');
          const updated = { ...oldListing, ...updateData };
          PriceAlert.triggerPriceDropNotifications(updated, oldPrice, newPrice);
        } catch (err) {
          console.error('Price alert notification error:', err);
        }
      }
    }

    return changes > 0;
  }

  static async delete(id) {
    const db = getDb();

    // With foreign keys enforced, rows that merely point at the listing have to
    // be detached rather than orphaned: a conversation outlives the listing it
    // started from, and losing it would destroy moderation evidence.
    const remove = db.transaction(() => {
      db.prepare('UPDATE messages SET listing_id = NULL WHERE listing_id = ?').run([id]);
      db.prepare('UPDATE reviews SET listing_id = NULL WHERE listing_id = ?').run([id]);
      db.prepare('UPDATE payments SET listing_id = NULL WHERE listing_id = ?').run([id]);

      db.prepare('DELETE FROM reports WHERE listing_id = ?').run([id]);
      db.prepare('DELETE FROM bids WHERE listing_id = ?').run([id]);
      db.prepare('DELETE FROM favorites WHERE listing_id = ?').run([id]);
      db.prepare('DELETE FROM listing_attributes WHERE listing_id = ?').run([id]);
      db.prepare('DELETE FROM listing_images WHERE listing_id = ?').run([id]);

      return db.prepare('DELETE FROM listings WHERE id = ?').run([id]).changes;
    });

    return remove() > 0;
  }

  static async getByCategory(categoryId, limit = 20, offset = 0) {
    const db = getDb();
    return db.prepare(
      "SELECT * FROM listings WHERE category_id = ? AND status = 'active' ORDER BY is_premium DESC, created_at DESC LIMIT ? OFFSET ?"
    ).all([categoryId, limit, offset]);
  }

  static async getByUser(userId, limit = 20, offset = 0) {
    const db = getDb();
    return db.prepare(`
      SELECT l.*, c.name_tr as category_name,
             (SELECT image_url FROM listing_images
               WHERE listing_id = l.id
               ORDER BY is_primary DESC, sort_order ASC LIMIT 1) as primary_image,
             (SELECT COUNT(*) FROM listing_images WHERE listing_id = l.id) as image_count
      FROM listings l
      LEFT JOIN categories c ON l.category_id = c.id
      WHERE l.user_id = ?
      ORDER BY l.created_at DESC LIMIT ? OFFSET ?
    `).all([userId, limit, offset]);
  }

  static async getFeatured(limit = 10) {
    const db = getDb();
    return db.prepare(`
      SELECT l.*, c.name_tr as category_name,
             (SELECT image_url FROM listing_images
               WHERE listing_id = l.id
               ORDER BY is_primary DESC, sort_order ASC LIMIT 1) as primary_image,
             (SELECT COUNT(*) FROM listing_images WHERE listing_id = l.id) as image_count
      FROM listings l
      LEFT JOIN categories c ON l.category_id = c.id
      WHERE l.is_featured = 1 AND l.status = 'active'
      ORDER BY l.created_at DESC LIMIT ?
    `).all([limit]);
  }

  static async getRecent(limit = 10) {
    const db = getDb();
    return db.prepare(`
      SELECT l.*, c.name_tr as category_name,
             (SELECT image_url FROM listing_images
               WHERE listing_id = l.id
               ORDER BY is_primary DESC, sort_order ASC LIMIT 1) as primary_image,
             (SELECT COUNT(*) FROM listing_images WHERE listing_id = l.id) as image_count
      FROM listings l
      LEFT JOIN categories c ON l.category_id = c.id
      WHERE l.status = 'active'
      ORDER BY l.created_at DESC LIMIT ?
    `).all([limit]);
  }

  static async incrementViews(id) {
    const db = getDb();
    return db.prepare('UPDATE listings SET views_count = views_count + 1 WHERE id = ?').run([id]).changes > 0;
  }

  static async getAttributes(listingId) {
    const db = getDb();
    return db.prepare('SELECT attribute_key, attribute_value FROM listing_attributes WHERE listing_id = ?').all([listingId]);
  }

  static async setAttributes(listingId, attributes = {}) {
    const db = getDb();

    db.transaction(() => {
      db.prepare('DELETE FROM listing_attributes WHERE listing_id = ?').run([listingId]);

      const entries = Object.entries(attributes);
      if (entries.length > 0) {
        const insertStmt = db.prepare('INSERT INTO listing_attributes (listing_id, attribute_key, attribute_value) VALUES (?, ?, ?)');
        entries.forEach(([key, value]) => insertStmt.run([listingId, key, value]));
      }
    })();

    return true;
  }

  static async search(filters = {}, page = 1, limit = 20) {
    const Category = require('./Category');
    const listingPolicy = require('../config/listingPolicy');
    const listingBadges = require('../config/listingBadges');
    const db = getDb();
    let where = ' WHERE 1=1';
    const params = [];

    // Some trees put professional sellers first. Resolved from the requested
    // category rather than passed in by the caller, so every route that searches
    // — the listing page, the API, the landing pages — gets the same ordering.
    let corporateFirst = false;

    if (filters.status) {
      where += ' AND l.status = ?';
      params.push(filters.status);
    } else {
      where += " AND l.status = 'active'";
    }

    if (filters.category) {
      const category = await Category.getBySlug(filters.category);
      const categoryIds = category ? await Category.getCategoryAndSubcategoryIds(filters.category) : [];

      if (categoryIds.length > 0) {
        const placeholders = categoryIds.map(() => '?').join(',');
        where += ` AND l.category_id IN (${placeholders})`;
        params.push(...categoryIds);

        // A subcategory inherits its root's ordering: somebody browsing
        // "İnşaat Malzemeleri" is inside the supplier network just as much as
        // somebody browsing the whole tree.
        const rootSlug = category.parent_id ? await Category.getRootSlug(category.id) : category.slug;
        corporateFirst = listingPolicy.isCorporateFirst(rootSlug);
      } else {
        where += ' AND 1=0';
      }
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
    if (filters.listing_type || filters.type) {
      const targetType = filters.listing_type || filters.type;
      if (targetType === 'job') {
        where += " AND (l.listing_type = 'job' OR (l.listing_type = 'sale' AND (c.slug = 'is-ilanlari' OR c.parent_id = 3)))";
      } else if (targetType === 'service') {
        where += " AND (l.listing_type = 'service' OR (l.listing_type = 'sale' AND (c.slug = 'usta-hizmetler' OR c.parent_id = 4)))";
      } else {
        where += ' AND l.listing_type = ?';
        params.push(targetType);
      }
    }

    // The column name is looked up from the badge definitions rather than taken
    // from the query string: this is the one filter whose value would otherwise
    // reach the SQL text itself, and an unknown key must narrow nothing rather
    // than name a column.
    if (filters.badge) {
      const badge = listingBadges.byKey(String(filters.badge));
      if (badge) {
        where += ` AND l.${badge.column} = 1`;
        // "Negotiable" is only meaningful against a real number, and it is only
        // shown on such listings — so it must not match ones without a price.
        if (badge.requiresPrice) where += ' AND l.price > 0';
      } else {
        where += ' AND 1=0';
      }
    }

    const orderClauses = [];
    if (corporateFirst) {
      orderClauses.push("CASE WHEN u.role IN ('business', 'agent') THEN 0 ELSE 1 END");
    }
    if (filters.sort === 'price_asc') {
      orderClauses.push('l.price ASC');
    } else if (filters.sort === 'price_desc') {
      orderClauses.push('l.price DESC');
    } else {
      orderClauses.push('l.created_at DESC');
    }
    const orderBy = ' ORDER BY ' + orderClauses.join(', ');

    // The count is unaffected by ordering, so it never needs the seller join.
    const { total } = db.prepare(`SELECT COUNT(*) as total FROM listings l${where}`).get(params);

    // Joined only where the ordering reads it, so an ordinary search keeps the
    // query plan it had.
    const sellerJoin = corporateFirst ? ' LEFT JOIN users u ON l.user_id = u.id' : '';

    const offset = (page - 1) * limit;
    const data = db.prepare(`
      SELECT l.*, c.name_tr as category_name, c.name_en as category_name_en, c.name_el as category_name_el, c.name_ru as category_name_ru, c.name_fa as category_name_fa,
             (SELECT image_url FROM listing_images
               WHERE listing_id = l.id
               ORDER BY is_primary DESC, sort_order ASC LIMIT 1) as primary_image,
             (SELECT COUNT(*) FROM listing_images WHERE listing_id = l.id) as image_count
      FROM listings l
      LEFT JOIN categories c ON l.category_id = c.id${sellerJoin}
      ${where}${orderBy} LIMIT ? OFFSET ?
    `).all([...params, limit, offset]);

    return { data, total, pages: Math.ceil(total / limit) || 1 };
  }

  static async findAll(filters, page, limit) {
    return this.search(filters, page, limit);
  }

  static async suggestTitles(query, limit = 8) {
    if (!query || query.length < 2) return [];

    const db = getDb();
    return db.prepare(`
      SELECT title, slug FROM listings
      WHERE status = 'active' AND title LIKE ?
      ORDER BY is_premium DESC, views_count DESC, created_at DESC
      LIMIT ?
    `).all([`%${query}%`, limit]);
  }

  static async adminFindAll(filters = {}, page = 1, limit = 20) {
    const db = getDb();
    let where = ' WHERE 1=1';
    const params = [];

    if (filters.status) {
      where += ' AND l.status = ?';
      params.push(filters.status);
    }
    if (filters.q) {
      where += ' AND (l.title LIKE ? OR u.email LIKE ?)';
      params.push(`%${filters.q}%`, `%${filters.q}%`);
    }

    // The join only exists so the search term can match an owner's e-mail;
    // without a term there is nothing to join to for a count.
    const { total } = filters.q
      ? db.prepare(`SELECT COUNT(*) as total FROM listings l LEFT JOIN users u ON l.user_id = u.id${where}`).get(params)
      : db.prepare(`SELECT COUNT(*) as total FROM listings l${where}`).get(params);

    const offset = (page - 1) * limit;
    const data = db.prepare(`
      SELECT l.*, c.name_tr as category_name,
             u.full_name as owner_name, u.email as owner_email,
             (SELECT image_url FROM listing_images
               WHERE listing_id = l.id
               ORDER BY is_primary DESC, sort_order ASC LIMIT 1) as primary_image,
             (SELECT COUNT(*) FROM listing_images WHERE listing_id = l.id) as image_count
      FROM listings l
      LEFT JOIN categories c ON l.category_id = c.id
      LEFT JOIN users u ON l.user_id = u.id
      ${where} ORDER BY l.created_at DESC LIMIT ? OFFSET ?
    `).all([...params, limit, offset]);

    return { data, total, pages: Math.ceil(total / limit) || 1 };
  }

  static async updateStatus(id, status) {
    const allowed = ['pending', 'active', 'sold', 'expired', 'rejected', 'draft'];
    if (!allowed.includes(status)) {
      throw new Error(`Invalid status: ${status}`);
    }
    return this.update(id, { status });
  }

  static async countByUserInRootCategories(userId, rootSlugs) {
    if (!Array.isArray(rootSlugs) || rootSlugs.length === 0) return 0;

    const db = getDb();
    const placeholders = rootSlugs.map(() => '?').join(', ');
    const { count } = db.prepare(`
      SELECT COUNT(*) as count
      FROM listings l
      JOIN categories c ON l.category_id = c.id
      LEFT JOIN categories p ON c.parent_id = p.id
      WHERE l.user_id = ?
        AND l.status != 'rejected'
        AND COALESCE(p.slug, c.slug) IN (${placeholders})
    `).get([userId, ...rootSlugs]);

    return count;
  }

  // Listings created before expires_at was populated have it NULL and are left
  // alone: only listings that were given a deadline can miss one.
  static async expireOverdue() {
    const db = getDb();
    return db.prepare(`
      UPDATE listings SET status = 'expired', updated_at = CURRENT_TIMESTAMP
      WHERE status = 'active'
        AND expires_at IS NOT NULL
        AND expires_at < datetime('now')
    `).run().changes;
  }

  static async countByStatus() {
    const db = getDb();
    const counts = { total: 0 };

    db.prepare('SELECT status, COUNT(*) as count FROM listings GROUP BY status').all().forEach((row) => {
      counts[row.status] = row.count;
      counts.total += row.count;
    });

    return counts;
  }

  static async toggleFavorite(listingId, userId) {
    const db = getDb();
    const existing = db.prepare('SELECT id FROM favorites WHERE user_id = ? AND listing_id = ?').get([userId, listingId]);

    if (existing) {
      db.prepare('DELETE FROM favorites WHERE user_id = ? AND listing_id = ?').run([userId, listingId]);
      return { favorited: false };
    }

    db.prepare('INSERT INTO favorites (user_id, listing_id) VALUES (?, ?)').run([userId, listingId]);
    return { favorited: true };
  }

  static async findFavoritesByUser(userId, limit = 50, offset = 0) {
    if (!userId) return [];
    const db = getDb();
    return db.prepare(`
      SELECT l.*, c.name_tr as category_name, c.name_en as category_name_en, c.name_el as category_name_el, c.name_ru as category_name_ru, c.name_fa as category_name_fa,
             (SELECT image_url FROM listing_images
                WHERE listing_id = l.id
                ORDER BY is_primary DESC, sort_order ASC LIMIT 1) as primary_image,
             (SELECT COUNT(*) FROM listing_images WHERE listing_id = l.id) as image_count,
             f.created_at as favorited_at
      FROM favorites f
      JOIN listings l ON f.listing_id = l.id
      LEFT JOIN categories c ON l.category_id = c.id
      WHERE f.user_id = ? AND l.status = 'active'
      ORDER BY f.created_at DESC LIMIT ? OFFSET ?
    `).all([userId, limit, offset]);
  }

  static async getUserFavoriteIds(userId) {
    if (!userId) return [];
    const db = getDb();
    return db.prepare('SELECT listing_id FROM favorites WHERE user_id = ?')
      .all([userId])
      .map(row => row.listing_id);
  }

  static async countAll() {
    const db = getDb();
    const { total } = db.prepare("SELECT COUNT(*) as total FROM listings WHERE status = 'active'").get();
    return total;
  }

  static async getCompareListings(ids) {
    if (!Array.isArray(ids) || ids.length === 0) return [];
    const validIds = ids.map(id => parseInt(id, 10)).filter(id => Number.isInteger(id) && id > 0).slice(0, 4);
    if (validIds.length === 0) return [];

    const db = getDb();
    const placeholders = validIds.map(() => '?').join(',');
    const rows = db.prepare(`
      SELECT l.*, c.name_tr as category_name, c.name_en as category_name_en, c.name_el as category_name_el, c.name_ru as category_name_ru, c.name_fa as category_name_fa, c.slug as category_slug,
             u.full_name as seller_name, COALESCE(u.show_surname, 0) as seller_show_surname, u.role as seller_role, u.company_name as seller_company, u.avatar_url as seller_avatar, u.last_seen_at as seller_last_seen,
             (SELECT AVG(rating) FROM reviews WHERE reviewed_user_id = u.id) as seller_rating,
             (SELECT AVG(rating) FROM reviews WHERE reviewed_user_id = u.id) as seller_rating_avg,
             (SELECT COUNT(*) FROM reviews WHERE reviewed_user_id = u.id) as seller_rating_count,
             (SELECT image_url FROM listing_images WHERE listing_id = l.id ORDER BY is_primary DESC, sort_order ASC LIMIT 1) as primary_image
      FROM listings l
      LEFT JOIN categories c ON l.category_id = c.id
      LEFT JOIN users u ON l.user_id = u.id
      WHERE l.id IN (${placeholders}) AND l.status = 'active'
    `).all(validIds);

    for (const item of rows) {
      const attrs = db.prepare('SELECT attribute_key, attribute_value FROM listing_attributes WHERE listing_id = ?').all([item.id]);
      const attrMap = {};
      attrs.forEach(a => { attrMap[a.attribute_key] = a.attribute_value; });
      item.attributes = attrMap;
    }

    return rows;
  }
}

module.exports = Listing;
