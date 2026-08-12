const { getDb } = require('../config/database');

class Review {
  static async create(reviewData) {
    const db = getDb();
    const { reviewer_id, reviewed_user_id, listing_id, rating, comment } = reviewData;

    const result = db.prepare(`
      INSERT INTO reviews (reviewer_id, reviewed_user_id, listing_id, rating, comment)
      VALUES (?, ?, ?, ?, ?)
    `).run([reviewer_id, reviewed_user_id, listing_id, rating, comment]);

    return Number(result.lastInsertRowid);
  }

  static async getByUser(userId, limit = 20, offset = 0) {
    const db = getDb();
    return db.prepare(`
      SELECT r.*, u.full_name as reviewer_name, u.avatar_url as reviewer_avatar
      FROM reviews r
      JOIN users u ON r.reviewer_id = u.id
      WHERE r.reviewed_user_id = ?
      ORDER BY r.created_at DESC
      LIMIT ? OFFSET ?
    `).all([userId, limit, offset]);
  }

  static async getByListing(listingId, limit = 20, offset = 0) {
    const db = getDb();
    return db.prepare(`
      SELECT r.*, u.full_name as reviewer_name, u.avatar_url as reviewer_avatar
      FROM reviews r
      JOIN users u ON r.reviewer_id = u.id
      WHERE r.listing_id = ?
      ORDER BY r.created_at DESC
      LIMIT ? OFFSET ?
    `).all([listingId, limit, offset]);
  }

  static async getAverageRating(userId) {
    const db = getDb();
    return db.prepare('SELECT AVG(rating) as avg_rating, COUNT(id) as total_reviews FROM reviews WHERE reviewed_user_id = ?')
      .get([userId]) || { avg_rating: 0, total_reviews: 0 };
  }
}

module.exports = Review;
