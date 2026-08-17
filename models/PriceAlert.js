const { getDb } = require('../config/database');
const Notification = require('./Notification');

class PriceAlert {
  static ensureTable(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS price_alerts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
        target_price REAL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, listing_id)
      );
      CREATE INDEX IF NOT EXISTS idx_price_alerts_user ON price_alerts(user_id);
      CREATE INDEX IF NOT EXISTS idx_price_alerts_listing ON price_alerts(listing_id);
    `);
  }

  static async findByPair(userId, listingId) {
    if (!userId || !listingId) return null;
    const db = getDb();
    this.ensureTable(db);
    return db.prepare('SELECT * FROM price_alerts WHERE user_id = ? AND listing_id = ?').get([userId, listingId]) || null;
  }

  static async create({ user_id, listing_id, target_price = null }) {
    const db = getDb();
    this.ensureTable(db);
    db.prepare(`
      INSERT INTO price_alerts (user_id, listing_id, target_price, created_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id, listing_id) DO UPDATE SET
        target_price = excluded.target_price,
        created_at = CURRENT_TIMESTAMP
    `).run([user_id, listing_id, target_price]);

    return this.findByPair(user_id, listing_id);
  }

  static async delete(userId, listingId) {
    const db = getDb();
    this.ensureTable(db);
    return db.prepare('DELETE FROM price_alerts WHERE user_id = ? AND listing_id = ?').run([userId, listingId]).changes > 0;
  }

  static async getUserAlerts(userId) {
    if (!userId) return [];
    const db = getDb();
    this.ensureTable(db);
    return db.prepare(`
      SELECT pa.*, l.title, l.slug, l.price as current_price, l.currency, l.status, l.location_city,
             (SELECT image_url FROM listing_images WHERE listing_id = l.id ORDER BY is_primary DESC, sort_order ASC LIMIT 1) as primary_image
      FROM price_alerts pa
      JOIN listings l ON pa.listing_id = l.id
      WHERE pa.user_id = ?
      ORDER BY pa.created_at DESC
    `).all([userId]);
  }

  static async getUserAlertListingIds(userId) {
    if (!userId) return [];
    const db = getDb();
    this.ensureTable(db);
    const rows = db.prepare('SELECT listing_id FROM price_alerts WHERE user_id = ?').all([userId]);
    return rows.map((r) => r.listing_id);
  }

  static async getSubscribersForPriceDrop(listingId, newPrice) {
    const db = getDb();
    this.ensureTable(db);
    return db.prepare(`
      SELECT pa.*, u.email, u.full_name, u.language_pref
      FROM price_alerts pa
      JOIN users u ON pa.user_id = u.id
      WHERE pa.listing_id = ?
        AND (pa.target_price IS NULL OR pa.target_price >= ?)
    `).all([listingId, newPrice]);
  }

  /**
   * When a listing price drops, notifies all active price alert subscribers.
   */
  static async triggerPriceDropNotifications(listing, oldPrice, newPrice) {
    if (!listing || !oldPrice || !newPrice || Number(newPrice) >= Number(oldPrice)) {
      return 0;
    }

    const subscribers = await this.getSubscribersForPriceDrop(listing.id, newPrice);
    if (!subscribers || subscribers.length === 0) return 0;

    let count = 0;
    for (const sub of subscribers) {
      if (sub.user_id === listing.user_id) continue; // Don't notify owner

      const oldFormatted = `${Number(oldPrice).toLocaleString('tr-TR')} ${listing.currency || 'TRY'}`;
      const newFormatted = `${Number(newPrice).toLocaleString('tr-TR')} ${listing.currency || 'TRY'}`;

      try {
        await Notification.create({
          user_id: sub.user_id,
          actor_id: listing.user_id,
          type: 'price_drop',
          title: 'Fiyat Düştü! 🎉',
          message: `Takip ettiğiniz "${listing.title}" ilanının fiyatı ${oldFormatted} yerine artık ${newFormatted}!`,
          link_url: `/listings/${listing.slug}`
        });
        count++;
      } catch (err) {
        console.error('Failed to create price drop notification for user', sub.user_id, err);
      }
    }

    return count;
  }
}

module.exports = PriceAlert;
