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
    const db = await getDb();
    const stmt = db.prepare('SELECT * FROM categories WHERE slug = ?');
    stmt.bind([slug]);
    let row = null;
    if (stmt.step()) {
      row = stmt.getAsObject();
    }
    stmt.free();
    return row;
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
