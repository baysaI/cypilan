const { getDb } = require('../config/database');

// Performance numbers for a seller's own listings. Everything here is scoped by
// user_id inside the statement rather than filtered afterwards, so a caller can
// never be handed another account's figures by passing the wrong id.

const RECENT_WINDOW_DAYS = 30;

class Stats {
  // Headline totals for the top of the panel.
  static async overview(userId) {
    const db = getDb();

    const listings = db.prepare(`
      SELECT
        COUNT(*) as total,
        COALESCE(SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END), 0) as active,
        COALESCE(SUM(CASE WHEN status = 'sold' THEN 1 ELSE 0 END), 0) as sold,
        COALESCE(SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END), 0) as pending,
        COALESCE(SUM(CASE WHEN status = 'expired' THEN 1 ELSE 0 END), 0) as expired,
        COALESCE(SUM(views_count), 0) as views,
        COALESCE(SUM(CASE WHEN is_premium = 1 OR is_featured = 1 THEN 1 ELSE 0 END), 0) as promoted
      FROM listings WHERE user_id = ?
    `).get([userId]);

    const { favorites } = db.prepare(`
      SELECT COUNT(*) as favorites FROM favorites f
      JOIN listings l ON f.listing_id = l.id
      WHERE l.user_id = ?
    `).get([userId]);

    const { conversations } = db.prepare(`
      SELECT COUNT(DISTINCT sender_id) as conversations
      FROM messages WHERE receiver_id = ?
    `).get([userId]);

    const { offers_received } = db.prepare(`
      SELECT COUNT(*) as offers_received FROM bids b
      JOIN listings l ON b.listing_id = l.id
      WHERE l.user_id = ?
    `).get([userId]);

    const offersMade = db.prepare(`
      SELECT
        COUNT(*) as total,
        COALESCE(SUM(CASE WHEN status = 'accepted' THEN 1 ELSE 0 END), 0) as won
      FROM bids WHERE bidder_id = ?
    `).get([userId]);

    const { applications } = db.prepare(`
      SELECT COUNT(*) as applications FROM job_applications a
      JOIN listings l ON a.listing_id = l.id
      WHERE l.user_id = ? AND a.status != 'withdrawn'
    `).get([userId]);

    return {
      listings,
      favorites,
      conversations,
      offersReceived: offers_received,
      offersMade: offersMade.total,
      offersWon: offersMade.won,
      applications,
      // A win rate over a handful of offers is noise, so it is only reported
      // once there is enough to divide by.
      winRate: offersMade.total >= 3 ? Math.round((offersMade.won / offersMade.total) * 100) : null
    };
  }

  // Per-listing performance, so a seller can tell which advert is doing the work.
  static async perListing(userId, limit = 50) {
    const db = getDb();
    return db.prepare(`
      SELECT l.id, l.title, l.slug, l.status, l.price, l.currency,
             l.views_count, l.is_premium, l.is_featured, l.created_at,
             (SELECT image_url FROM listing_images
               WHERE listing_id = l.id
               ORDER BY is_primary DESC, sort_order ASC LIMIT 1) as primary_image,
             (SELECT COUNT(*) FROM favorites WHERE listing_id = l.id) as favorite_count,
             (SELECT COUNT(*) FROM bids WHERE listing_id = l.id AND status != 'withdrawn') as bid_count,
             (SELECT COUNT(DISTINCT sender_id) FROM messages WHERE listing_id = l.id AND receiver_id = l.user_id) as enquiry_count,
             (SELECT COUNT(*) FROM job_applications WHERE listing_id = l.id AND status != 'withdrawn') as application_count
      FROM listings l
      WHERE l.user_id = ?
      ORDER BY l.views_count DESC, l.created_at DESC
      LIMIT ?
    `).all([userId, limit]);
  }

  // How many listings this seller published in each of the last N days. Used for
  // the small activity bar strip; a gap-free series is built by the caller.
  static async recentActivity(userId, days = RECENT_WINDOW_DAYS) {
    const db = getDb();
    const rows = db.prepare(`
      SELECT DATE(created_at) as day, COUNT(*) as count
      FROM listings
      WHERE user_id = ? AND created_at >= datetime('now', ?)
      GROUP BY DATE(created_at)
      ORDER BY day ASC
    `).all([userId, `-${days} days`]);

    const byDay = new Map(rows.map((row) => [row.day, row.count]));
    const series = [];

    for (let offset = days - 1; offset >= 0; offset -= 1) {
      const date = new Date(Date.now() - offset * 86400000);
      const key = date.toISOString().slice(0, 10);
      series.push({ day: key, count: byDay.get(key) || 0 });
    }

    return series;
  }

  // Where this seller's views sit against everyone else's active listings, so a
  // number like "312 views" has something to mean.
  static async benchmark(userId) {
    const db = getDb();

    const mine = db.prepare(`
      SELECT COALESCE(AVG(views_count), 0) as avg_views
      FROM listings WHERE user_id = ? AND status = 'active'
    `).get([userId]);

    const overall = db.prepare(`
      SELECT COALESCE(AVG(views_count), 0) as avg_views
      FROM listings WHERE status = 'active'
    `).get();

    const mineAvg = Number(mine.avg_views) || 0;
    const marketAvg = Number(overall.avg_views) || 0;

    return {
      mine: Math.round(mineAvg),
      market: Math.round(marketAvg),
      // Null rather than a fabricated 0% when there is nothing to compare to.
      difference: marketAvg > 0 ? Math.round(((mineAvg - marketAvg) / marketAvg) * 100) : null
    };
  }
}

Stats.RECENT_WINDOW_DAYS = RECENT_WINDOW_DAYS;

module.exports = Stats;
