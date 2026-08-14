const Bid = require('../models/Bid');
const Listing = require('../models/Listing');
const Category = require('../models/Category');
const Message = require('../models/Message');

const MAX_MESSAGE_LENGTH = 500;
const ALLOWED_CURRENCIES = ['TRY', 'GBP'];

const roleOf = (req) => (req.session && req.session.userRole) || (req.user && req.user.role);

// The marketplace of listings whose owners asked professionals to compete.
const openRequests = async (req, res, next) => {
    try {
        if (!Bid.canBid(roleOf(req))) {
            req.flash('error', 'flash.bid_professionals_only');
            return res.redirect('/');
        }

        const page = parseInt(req.query.page, 10) || 1;
        const filters = { city: req.query.city, category: req.query.category };

        const [result, categories] = await Promise.all([
            Bid.openRequests(filters, page, 20),
            Category.getMainCategoriesWithCount()
        ]);

        // Which of these the professional has already bid on, so the list can say
        // "offer sent" instead of inviting a duplicate.
        const myBids = await Bid.findByBidder(req.session.userId);
        const myBidListingIds = myBids
            .filter((bid) => bid.status === 'pending')
            .map((bid) => bid.listing_id);

        res.locals.meta = res.locals.meta || {};
        res.locals.meta.title = res.locals.t('bids.open_requests');
        res.locals.meta.robots = 'noindex, nofollow';

        res.render('bids/open', {
            requests: result.data,
            pagination: { currentPage: page, totalPages: result.pages, totalItems: result.total },
            categories,
            filters,
            myBidListingIds,
            title: res.locals.t('bids.open_requests')
        });
    } catch (error) {
        console.error('Open Bid Requests Error:', error);
        next(error);
    }
};

const submit = async (req, res) => {
    const listingId = parseInt(req.params.listingId, 10);
    const backTo = req.get('referer') || '/teklifler';

    try {
        if (!Bid.canBid(roleOf(req))) {
            req.flash('error', 'flash.bid_professionals_only');
            return res.redirect('/');
        }

        if (!Number.isInteger(listingId)) {
            req.flash('error', 'flash.listing_not_found');
            return res.redirect('/teklifler');
        }

        const listing = await Listing.findById(listingId);

        if (!listing || listing.status !== 'active' || listing.listing_type !== 'bid_request') {
            req.flash('error', 'flash.bid_listing_closed');
            return res.redirect('/teklifler');
        }

        if (listing.user_id === req.session.userId) {
            req.flash('error', 'flash.bid_cannot_bid_own');
            return res.redirect(backTo);
        }

        const amount = parseFloat(req.body.amount);
        if (!Number.isFinite(amount) || amount <= 0) {
            req.flash('error', 'flash.bid_amount_required');
            return res.redirect(backTo);
        }

        const currency = ALLOWED_CURRENCIES.includes(req.body.currency) ? req.body.currency : listing.currency;
        const message = String(req.body.message || '').trim().slice(0, MAX_MESSAGE_LENGTH);
        const existing = await Bid.findByPair(listingId, req.session.userId);

        await Bid.upsert({
            listing_id: listingId,
            bidder_id: req.session.userId,
            amount,
            currency,
            message: message || null
        });

        // The owner should not have to poll a page to learn an offer arrived, and
        // the platform already has a delivery channel that both sides can read.
        if (!existing) {
            try {
                await Message.create({
                    sender_id: req.session.userId,
                    receiver_id: listing.user_id,
                    listing_id: listingId,
                    content: res.locals.t('bids.notify_owner', { title: listing.title })
                });
            } catch (notifyError) {
                console.error('Bid notification failed:', notifyError);
            }
        }

        req.flash('success', existing ? 'flash.bid_updated' : 'flash.bid_sent');
        res.redirect('/teklifler/verdiklerim');
    } catch (error) {
        console.error('Submit Bid Error:', error);
        req.flash('error', 'flash.bid_failed');
        res.redirect(backTo);
    }
};

const myBids = async (req, res, next) => {
    try {
        if (!Bid.canBid(roleOf(req))) {
            req.flash('error', 'flash.bid_professionals_only');
            return res.redirect('/');
        }

        const bids = await Bid.findByBidder(req.session.userId);

        res.locals.meta = res.locals.meta || {};
        res.locals.meta.title = res.locals.t('bids.my_bids');
        res.locals.meta.robots = 'noindex, nofollow';

        res.render('bids/mine', { bids, title: res.locals.t('bids.my_bids') });
    } catch (error) {
        console.error('My Bids Error:', error);
        next(error);
    }
};

const withdraw = async (req, res) => {
    try {
        const bidId = parseInt(req.params.id, 10);
        const done = Number.isInteger(bidId) && await Bid.withdraw(bidId, req.session.userId);

        req.flash(done ? 'success' : 'error', done ? 'flash.bid_withdrawn' : 'flash.bid_not_found');
        res.redirect('/teklifler/verdiklerim');
    } catch (error) {
        console.error('Withdraw Bid Error:', error);
        req.flash('error', 'flash.bid_failed');
        res.redirect('/teklifler/verdiklerim');
    }
};

// The owner's side: every offer across every listing they own.
const received = async (req, res, next) => {
    try {
        const bids = await Bid.findForOwner(req.session.userId);

        // Grouped per listing so the owner compares offers for one property
        // against each other rather than reading a flat feed.
        const groups = [];
        const indexBySlug = new Map();

        bids.forEach((bid) => {
            if (!indexBySlug.has(bid.listing_slug)) {
                indexBySlug.set(bid.listing_slug, groups.length);
                groups.push({
                    listingTitle: bid.listing_title,
                    listingSlug: bid.listing_slug,
                    listingStatus: bid.listing_status,
                    bids: []
                });
            }
            groups[indexBySlug.get(bid.listing_slug)].bids.push(bid);
        });

        res.locals.meta = res.locals.meta || {};
        res.locals.meta.title = res.locals.t('bids.received');
        res.locals.meta.robots = 'noindex, nofollow';

        res.render('bids/received', { groups, title: res.locals.t('bids.received') });
    } catch (error) {
        console.error('Received Bids Error:', error);
        next(error);
    }
};

const accept = async (req, res) => {
    try {
        const bidId = parseInt(req.params.id, 10);
        const bid = Number.isInteger(bidId) ? await Bid.accept(bidId, req.session.userId) : null;

        if (!bid) {
            req.flash('error', 'flash.bid_not_found');
            return res.redirect('/profile/teklifler');
        }

        try {
            const listing = await Listing.findById(bid.listing_id);
            await Message.create({
                sender_id: req.session.userId,
                receiver_id: bid.bidder_id,
                listing_id: bid.listing_id,
                content: res.locals.t('bids.notify_accepted', { title: listing ? listing.title : '' })
            });
        } catch (notifyError) {
            console.error('Bid accept notification failed:', notifyError);
        }

        req.flash('success', 'flash.bid_accepted');
        res.redirect('/profile/teklifler');
    } catch (error) {
        console.error('Accept Bid Error:', error);
        req.flash('error', 'flash.bid_failed');
        res.redirect('/profile/teklifler');
    }
};

const reject = async (req, res) => {
    try {
        const bidId = parseInt(req.params.id, 10);
        const done = Number.isInteger(bidId) && await Bid.reject(bidId, req.session.userId);

        req.flash(done ? 'success' : 'error', done ? 'flash.bid_rejected' : 'flash.bid_not_found');
        res.redirect('/profile/teklifler');
    } catch (error) {
        console.error('Reject Bid Error:', error);
        req.flash('error', 'flash.bid_failed');
        res.redirect('/profile/teklifler');
    }
};

module.exports = {
    openRequests,
    submit,
    myBids,
    withdraw,
    received,
    accept,
    reject,
    MAX_MESSAGE_LENGTH
};
