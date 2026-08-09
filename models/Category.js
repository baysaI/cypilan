const { getDb } = require('../config/database');

class Category {
  static async getAll() {
    const db = await getDb();
    const stmt = db.prepare('SELECT * FROM categories ORDER BY sort_order ASC');
    const results = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
  }

  static async getBySlug(slug) {
    if (!slug) return null;
    const db = await getDb();
    const isNum = typeof slug === 'number' || /^\d+$/.test(slug);
    const numId = isNum ? parseInt(slug, 10) : -1;
    const stmt = db.prepare(`
      SELECT * FROM categories
      WHERE slug = ?
         OR (slug = 'usta-hizmetler' AND ? = 'ustalar')
         OR (id = ? AND ? = 1)
    `);
    stmt.bind([String(slug), String(slug), numId, isNum ? 1 : 0]);
    let row = null;
    if (stmt.step()) {
      row = stmt.getAsObject();
    }
    stmt.free();
    return row;
  }

  static async getRootSlug(categoryId) {
    const db = await getDb();
    let currentId = categoryId;

    for (let depth = 0; depth < 10; depth++) {
      const stmt = db.prepare('SELECT id, slug, parent_id FROM categories WHERE id = ?');
      stmt.bind([currentId]);
      let row = null;
      if (stmt.step()) {
        row = stmt.getAsObject();
      }
      stmt.free();

      if (!row) return null;
      if (row.parent_id == null) return row.slug;
      currentId = row.parent_id;
    }

    return null;
  }

  static async getCategoryAndSubcategoryIds(categoryIdentifier) {
    if (!categoryIdentifier) return [];
    const cat = await this.getBySlug(categoryIdentifier);
    if (!cat) return [];

    const db = await getDb();
    const stmt = db.prepare('SELECT id FROM categories WHERE id = ? OR parent_id = ?');
    stmt.bind([cat.id, cat.id]);
    const ids = [];
    while (stmt.step()) {
      ids.push(stmt.getAsObject().id);
    }
    stmt.free();
    return ids;
  }

  static async getMainCategoriesWithCount() {
    const db = await getDb();
    const stmt = db.prepare(`
      SELECT c.*, COUNT(l.id) as listing_count
      FROM categories c
      LEFT JOIN listings l ON (l.category_id = c.id OR l.category_id IN (SELECT id FROM categories WHERE parent_id = c.id)) AND l.status = 'active'
      WHERE c.parent_id IS NULL AND c.is_active = 1
      GROUP BY c.id
      ORDER BY c.sort_order ASC
    `);
    const results = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
  }

  static async getMainCategories() {
    const db = await getDb();
    const stmt = db.prepare('SELECT * FROM categories WHERE parent_id IS NULL AND is_active = 1 ORDER BY sort_order ASC');
    const results = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
  }

  static async getSubcategories(parentId) {
    const db = await getDb();
    const stmt = db.prepare('SELECT * FROM categories WHERE parent_id = ? AND is_active = 1 ORDER BY sort_order ASC');
    stmt.bind([parentId]);
    const results = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
  }

  static async getTree() {
    const allCategories = await this.getAll();
    const categoryMap = {};
    const tree = [];

    allCategories.forEach(cat => {
      categoryMap[cat.id] = { ...cat, children: [] };
    });

    allCategories.forEach(cat => {
      if (cat.parent_id) {
        if (categoryMap[cat.parent_id]) {
          categoryMap[cat.parent_id].children.push(categoryMap[cat.id]);
        }
      } else {
        tree.push(categoryMap[cat.id]);
      }
    });

    return tree;
  }
}

module.exports = Category;
