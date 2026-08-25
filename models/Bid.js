const { getDb } = require('../config/database');

// Who is allowed to bid. The promise on the marketing material is that
// professionals compete for the seller's business, so a private user cannot bid
// on another private user's listing.
const BIDDER_ROLES = ['agent', 'business', 'admin'];

const canBid = (role) => BIDDER_ROLES.includes(role);

class Bid {
  static async findById(id) {
    const db = getDb();
    return db.prepare('SELECT * FROM bids WHERE id = ?').get([id]) || null;
  }

  static async findByPair(listingId, bidderId) {
    const db = getDb();
    return db.prepare('SELECT * FROM bids WHERE listing_id = ? AND bidder_id = ?')
      .get([listingId, bidderId]) || null;
  }

  // Revising an offer overwrites the previous one (idx_bids_pair). A withdrawn
  // or rejected offer becomes pending again when the bidder submits a new
  // number, which is what "revise my offer" has to mean.
  static async upsert({ listing_id, bidder_id, amount, currency = 'GBP', message = null }) {
    const db = getDb();

    db.prepare(`
      INSERT INTO bids (listing_id, bidder_id, amount, currency, message, status)
      VALUES (?, ?, ?, ?, ?, 'pending')
      ON CONFLICT(listing_id, bidder_id) DO UPDATE SET
        amount = excluded.amount,
        currency = excluded.currency,
        message = excluded.message,
        status = 'pending',
        created_at = CURRENT_TIMESTAMP
    `).run([listing_id, bidder_id, amount, currency, message]);

    return this.findByPair(listing_id, bidder_id);
  }

  /**
   * Submits a fast bargaining offer from any buyer to the listing seller and notifies the seller.
   */
  static async submitQuickOffer({ listing_id, bidder_id, amount, currency = 'GBP', message = null }) {
    const db = getDb();
    const listing = db.prepare('SELECT * FROM listings WHERE id = ?').get([listing_id]);
    if (!listing) throw new Error('İlan bulunamadı.');
    if (listing.user_id === bidder_id) throw new Error('Kendi ilanınıza teklif veremezsiniz.');

    const bid = await this.upsert({
      listing_id,
      bidder_id,
      amount,
      currency: currency || listing.currency || 'GBP',
      message
    });

    const bidder = db.prepare('SELECT full_name FROM users WHERE id = ?').get([bidder_id]);
    const bidderName = bidder ? bidder.full_name : 'Bir kullanıcı';
    const Notification = require('./Notification');

    const formattedAmount = `${Number(amount).toLocaleString('tr-TR')} ${currency || listing.currency || 'GBP'}`;
    try {
      await Notification.create({
        user_id: listing.user_id,
        actor_id: bidder_id,
        type: 'bid',
        title: 'Yeni Pazarlık Teklifi 🤝',
        message: `${bidderName}, "${listing.title}" ilanınız için ${formattedAmount} teklif verdi.`,
        link_url: `/profile/teklifler`
      });
    } catch (err) {
      console.error('Notification for quick offer failed:', err);
    }

    return bid;
  }

  // Accepting one offer settles the whole listing in a single transaction:
  // the winner is accepted, every other standing offer is rejected, and the
  // listing leaves the market. Doing this in steps would leave a window where
  // two offers look accepted at once.
  static async accept(bidId, ownerId) {
    const db = getDb();

    const settle = db.transaction(() => {
      const bid = db.prepare(`
        SELECT b.* FROM bids b
        JOIN listings l ON b.listing_id = l.id
        WHERE b.id = ? AND l.user_id = ?
      `).get([bidId, ownerId]);

      if (!bid) return null;

      db.prepare("UPDATE bids SET status = 'accepted' WHERE id = ?").run([bidId]);
      db.prepare(`
        UPDATE bids SET status = 'rejected'
        WHERE listing_id = ? AND id != ? AND status = 'pending'
      `).run([bid.listing_id, bidId]);
      // Teklif kabul edilince ilan eskiden satildi sayilip yayindan
      // kaldiriliyordu. Bu yalnizca tek parca bir esya icin dogru: bir usta
      // hizmeti, tedarikci ilani ya da kiralik bir daire tek musteriyle
      // tukenmiyor - o ilanlar kapandiginda saticinin gorunurlugu de bitiyordu.
      //
      // Ilan artik acik kaliyor. Gercekten tukenen bir sey satildiysa sahibi
      // durumu duzenleme ekranindan kendisi degistirebiliyor; karar onun.

      return bid;
    });

    return settle();
  }

  static async reject(bidId, ownerId) {
    const db = getDb();
    return db.prepare(`
      UPDATE bids SET status = 'rejected'
      WHERE id = ?
        AND status = 'pending'
        AND listing_id IN (SELECT id FROM listings WHERE user_id = ?)
    `).run([bidId, ownerId]).changes > 0;
  }

  static async withdraw(bidId, bidderId) {
    const db = getDb();
    return db.prepare(`
      UPDATE bids SET status = 'withdrawn'
      WHERE id = ? AND bidder_id = ? AND status = 'pending'
    `).run([bidId, bidderId]).changes > 0;
  }

  // Everything the owner needs to compare offers side by side, including who is
  // behind each one and how that professional is rated by other members.
  static async findForListing(listingId) {
    const db = getDb();
    return db.prepare(`
      SELECT b.*,
             u.full_name as bidder_name,
             COALESCE(u.show_surname, 0) as bidder_show_surname,
             u.company_name as bidder_company,
             u.avatar_url as bidder_avatar,
             u.role as bidder_role,
             (SELECT AVG(rating) FROM reviews WHERE reviewed_user_id = u.id) as bidder_rating,
             (SELECT COUNT(*) FROM reviews WHERE reviewed_user_id = u.id) as bidder_review_count
      FROM bids b
      JOIN users u ON b.bidder_id = u.id
      WHERE b.listing_id = ?
      ORDER BY
        CASE b.status WHEN 'accepted' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END,
        b.amount DESC
    `).all([listingId]);
  }

  // Every offer across all of this owner's listings, grouped per listing by the
  // caller. A single query keeps the page to one round trip.
  static async findForOwner(ownerId) {
    const db = getDb();
    return db.prepare(`
      SELECT b.*,
             l.title as listing_title,
             l.slug as listing_slug,
             l.status as listing_status,
             u.full_name as bidder_name,
             COALESCE(u.show_surname, 0) as bidder_show_surname,
             u.company_name as bidder_company,
             u.avatar_url as bidder_avatar,
             u.role as bidder_role,
             (SELECT AVG(rating) FROM reviews WHERE reviewed_user_id = u.id) as bidder_rating,
             (SELECT COUNT(*) FROM reviews WHERE reviewed_user_id = u.id) as bidder_review_count
      FROM bids b
      JOIN listings l ON b.listing_id = l.id
      JOIN users u ON b.bidder_id = u.id
      WHERE l.user_id = ?
      ORDER BY
        CASE b.status WHEN 'pending' THEN 0 WHEN 'accepted' THEN 1 ELSE 2 END,
        b.created_at DESC
    `).all([ownerId]);
  }

  static async findByBidder(bidderId) {
    const db = getDb();
    return db.prepare(`
      SELECT b.*,
             l.title as listing_title,
             l.slug as listing_slug,
             l.status as listing_status,
             l.location_city as listing_city,
             (SELECT image_url FROM listing_images
               WHERE listing_id = l.id
               ORDER BY is_primary DESC, sort_order ASC LIMIT 1) as primary_image
      FROM bids b
      JOIN listings l ON b.listing_id = l.id
      WHERE b.bidder_id = ?
      ORDER BY b.created_at DESC
    `).all([bidderId]);
  }

  // Listings whose owner asked professionals to compete. Bid amounts are never
  // exposed here: a bidder must not be able to undercut a rival by a lira, so
  // only the count of competing offers is shown.
  static async openRequests({ city, category } = {}, page = 1, limit = 20) {
    const db = getDb();
    let where = " WHERE l.listing_type = 'bid_request' AND l.status = 'active'";
    const params = [];

    if (city) {
      where += ' AND l.location_city = ?';
      params.push(city);
    }
    if (category) {
      where += ' AND COALESCE(p.slug, c.slug) = ?';
      params.push(category);
    }

    const { total } = db.prepare(`
      SELECT COUNT(*) as total FROM listings l
      LEFT JOIN categories c ON l.category_id = c.id
      LEFT JOIN categories p ON c.parent_id = p.id
      ${where}
    `).get(params);

    const offset = (page - 1) * limit;
    const data = db.prepare(`
      SELECT l.*,
             c.name_tr as category_name, c.name_en as category_name_en, c.name_el as category_name_el,
             c.name_ru as category_name_ru, c.name_fa as category_name_fa,
             (SELECT image_url FROM listing_images
               WHERE listing_id = l.id
               ORDER BY is_primary DESC, sort_order ASC LIMIT 1) as primary_image,
             (SELECT COUNT(*) FROM bids WHERE listing_id = l.id AND status = 'pending') as bid_count
      FROM listings l
      LEFT JOIN categories c ON l.category_id = c.id
      LEFT JOIN categories p ON c.parent_id = p.id
      ${where}
      ORDER BY l.created_at DESC
      LIMIT ? OFFSET ?
    `).all([...params, limit, offset]);

    return { data, total, pages: Math.ceil(total / limit) || 1 };
  }

  static async countPendingForOwner(ownerId) {
    const db = getDb();
    const { count } = db.prepare(`
      SELECT COUNT(*) as count FROM bids b
      JOIN listings l ON b.listing_id = l.id
      WHERE l.user_id = ? AND b.status = 'pending'
    `).get([ownerId]);
    return count;
  }

  static async summaryForListing(listingId) {
    const db = getDb();
    return db.prepare(`
      SELECT COUNT(*) as total,
             MAX(CASE WHEN status = 'pending' THEN amount END) as best_amount
      FROM bids WHERE listing_id = ? AND status = 'pending'
    `).get([listingId]) || { total: 0, best_amount: null };
  }
}

Bid.BIDDER_ROLES = BIDDER_ROLES;
Bid.canBid = canBid;

module.exports = Bid;
