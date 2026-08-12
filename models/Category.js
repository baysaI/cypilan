const { getDb } = require('../config/database');

class Category {
  static async getAll() {
    const db = getDb();
    return db.prepare('SELECT * FROM categories ORDER BY sort_order ASC').all();
  }

  static async getBySlug(slug) {
    if (!slug) return null;
    const db = getDb();
    const isNum = typeof slug === 'number' || /^\d+$/.test(slug);
    const numId = isNum ? parseInt(slug, 10) : -1;

    return db.prepare(`
      SELECT * FROM categories
      WHERE slug = ?
         OR (slug = 'usta-hizmetler' AND ? = 'ustalar')
         OR (id = ? AND ? = 1)
    `).get([String(slug), String(slug), numId, isNum ? 1 : 0]) || null;
  }

  static async getRootSlug(categoryId) {
    const db = getDb();
    const stmt = db.prepare('SELECT id, slug, parent_id FROM categories WHERE id = ?');
    let currentId = categoryId;

    for (let depth = 0; depth < 10; depth++) {
      const row = stmt.get([currentId]);

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

    const db = getDb();
    return db.prepare('SELECT id FROM categories WHERE id = ? OR parent_id = ?')
      .all([cat.id, cat.id])
      .map(row => row.id);
  }

  static async getMainCategoriesWithCount() {
    const db = getDb();
    return db.prepare(`
      SELECT c.*, COUNT(l.id) as listing_count
      FROM categories c
      LEFT JOIN listings l ON (l.category_id = c.id OR l.category_id IN (SELECT id FROM categories WHERE parent_id = c.id)) AND l.status = 'active'
      WHERE c.parent_id IS NULL AND c.is_active = 1
      GROUP BY c.id
      ORDER BY c.sort_order ASC
    `).all();
  }

  static async getMainCategories() {
    const db = getDb();
    return db.prepare('SELECT * FROM categories WHERE parent_id IS NULL AND is_active = 1 ORDER BY sort_order ASC').all();
  }

  static async getSubcategories(parentId) {
    const db = getDb();
    return db.prepare('SELECT * FROM categories WHERE parent_id = ? AND is_active = 1 ORDER BY sort_order ASC').all([parentId]);
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
