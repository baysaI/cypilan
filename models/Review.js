const { getDb, saveDb } = require('../config/database');

class Review {
  static async create(reviewData) {
    const db = await getDb();
    const { reviewer_id, reviewed_user_id, listing_id, rating, comment } = reviewData;
    
    const stmt = db.prepare(`
      INSERT INTO reviews (reviewer_id, reviewed_user_id, listing_id, rating, comment)
      VALUES (?, ?, ?, ?, ?)
    `);
    
    stmt.run([reviewer_id, reviewed_user_id, listing_id, rating, comment]);
    stmt.free();
    
    const idRes = db.exec("SELECT last_insert_rowid() as id");
    const lastId = idRes[0].values[0][0];
    saveDb();
    return lastId;
  }

  static async getByUser(userId, limit = 20, offset = 0) {
    const db = await getDb();
    const stmt = db.prepare(`
      SELECT r.*, u.full_name as reviewer_name, u.avatar_url as reviewer_avatar 
      FROM reviews r 
      JOIN users u ON r.reviewer_id = u.id 
      WHERE r.reviewed_user_id = ? 
      ORDER BY r.created_at DESC 
      LIMIT ? OFFSET ?
    `);
    stmt.bind([userId, limit, offset]);
    const results = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
  }

  static async getByListing(listingId, limit = 20, offset = 0) {
    const db = await getDb();
    const stmt = db.prepare(`
      SELECT r.*, u.full_name as reviewer_name, u.avatar_url as reviewer_avatar 
      FROM reviews r 
      JOIN users u ON r.reviewer_id = u.id 
      WHERE r.listing_id = ? 
      ORDER BY r.created_at DESC 
      LIMIT ? OFFSET ?
    `);
    stmt.bind([listingId, limit, offset]);
    const results = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
  }

  static async getAverageRating(userId) {
    const db = await getDb();
    const stmt = db.prepare('SELECT AVG(rating) as avg_rating, COUNT(id) as total_reviews FROM reviews WHERE reviewed_user_id = ?');
    stmt.bind([userId]);
    let row = { avg_rating: 0, total_reviews: 0 };
    if (stmt.step()) {
      row = stmt.getAsObject();
    }
    stmt.free();
    return row;
  }
}

module.exports = Review;
