const { getDb } = require('../config/database');

const MIN_RATING = 1;
const MAX_RATING = 5;

class Review {
  // A score is only meaningful if the two people actually dealt with each other.
  // A message in either direction is the cheapest proof the platform holds, and
  // it is what stops a competitor from opening accounts to bury a seller.
  static async hasInteracted(userId, otherUserId) {
    const db = getDb();
    const { count } = db.prepare(`
      SELECT COUNT(*) as count FROM messages
      WHERE (sender_id = ? AND receiver_id = ?)
         OR (sender_id = ? AND receiver_id = ?)
    `).get([userId, otherUserId, otherUserId, userId]);

    return count > 0;
  }

  static async findByPair(reviewerId, reviewedUserId) {
    const db = getDb();
    return db.prepare(
      'SELECT * FROM reviews WHERE reviewer_id = ? AND reviewed_user_id = ?'
    ).get([reviewerId, reviewedUserId]) || null;
  }

  // Editing a score rather than adding a second one, so the average always
  // reflects one opinion per person. idx_reviews_pair enforces this in the
  // database as well, in case a future caller forgets to come through here.
  static async upsert({ reviewer_id, reviewed_user_id, listing_id = null, rating, comment = null }) {
    const db = getDb();

    db.prepare(`
      INSERT INTO reviews (reviewer_id, reviewed_user_id, listing_id, rating, comment)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(reviewer_id, reviewed_user_id) DO UPDATE SET
        rating = excluded.rating,
        comment = excluded.comment,
        listing_id = COALESCE(excluded.listing_id, reviews.listing_id),
        created_at = CURRENT_TIMESTAMP
    `).run([reviewer_id, reviewed_user_id, listing_id, rating, comment]);

    return this.findByPair(reviewer_id, reviewed_user_id);
  }

  static async remove(reviewerId, reviewedUserId) {
    const db = getDb();
    return db.prepare('DELETE FROM reviews WHERE reviewer_id = ? AND reviewed_user_id = ?')
      .run([reviewerId, reviewedUserId]).changes > 0;
  }

  static async create(reviewData) {
    return this.upsert(reviewData);
  }

  static async getByUser(userId, limit = 20, offset = 0) {
    const db = getDb();
    return db.prepare(`
      SELECT r.*, u.full_name as reviewer_name, u.avatar_url as reviewer_avatar,
             u.company_name as reviewer_company, COALESCE(u.show_surname, 0) as reviewer_show_surname,
             l.title as listing_title, l.slug as listing_slug
      FROM reviews r
      JOIN users u ON r.reviewer_id = u.id
      LEFT JOIN listings l ON r.listing_id = l.id
      WHERE r.reviewed_user_id = ?
      ORDER BY r.created_at DESC
      LIMIT ? OFFSET ?
    `).all([userId, limit, offset]);
  }

  static async getByListing(listingId, limit = 20, offset = 0) {
    const db = getDb();
    return db.prepare(`
      SELECT r.*, u.full_name as reviewer_name, u.avatar_url as reviewer_avatar,
             u.company_name as reviewer_company, COALESCE(u.show_surname, 0) as reviewer_show_surname
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

  // Average plus the star breakdown the profile page draws as bars. A single
  // pass, because the two were otherwise read as two separate scans.
  static async getSummary(userId) {
    const db = getDb();
    const rows = db.prepare(
      'SELECT rating, COUNT(*) as count FROM reviews WHERE reviewed_user_id = ? GROUP BY rating'
    ).all([userId]);

    const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let total = 0;
    let sum = 0;

    rows.forEach(({ rating, count }) => {
      if (distribution[rating] === undefined) return;
      distribution[rating] = count;
      total += count;
      sum += rating * count;
    });

    return {
      total,
      average: total > 0 ? sum / total : 0,
      distribution
    };
  }

  static isValidRating(value) {
    const rating = Number(value);
    return Number.isInteger(rating) && rating >= MIN_RATING && rating <= MAX_RATING;
  }
}

Review.MIN_RATING = MIN_RATING;
Review.MAX_RATING = MAX_RATING;

module.exports = Review;
