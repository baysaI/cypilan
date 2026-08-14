const Stats = require('../models/Stats');
const Review = require('../models/Review');
const Bid = require('../models/Bid');
const Career = require('../models/Career');

// The professional panel is open to anyone who lists — a private seller gets the
// same numbers about their own listings. Estate agents and dealers additionally
// see the bidding figures, because only they can bid.
const PROFESSIONAL_ROLES = ['agent', 'business', 'admin'];

const roleOf = (req) => (req.session && req.session.userRole) || (req.user && req.user.role);

const index = async (req, res, next) => {
    try {
        const userId = req.session.userId;

        const [overview, listings, activity, benchmark, rating, pendingBids, pendingApplications] = await Promise.all([
            Stats.overview(userId),
            Stats.perListing(userId, 50),
            Stats.recentActivity(userId),
            Stats.benchmark(userId),
            Review.getSummary(userId),
            Bid.countPendingForOwner(userId),
            Career.countPendingForEmployer(userId)
        ]);

        const peak = activity.reduce((max, point) => Math.max(max, point.count), 0);

        res.locals.meta = res.locals.meta || {};
        res.locals.meta.title = res.locals.t('panel.title');
        res.locals.meta.robots = 'noindex, nofollow';

        res.render('panel/index', {
            overview,
            listings,
            activity,
            activityPeak: peak,
            benchmark,
            rating,
            pendingBids,
            pendingApplications,
            isProfessional: PROFESSIONAL_ROLES.includes(roleOf(req)),
            windowDays: Stats.RECENT_WINDOW_DAYS,
            title: res.locals.t('panel.title')
        });
    } catch (error) {
        console.error('Panel Error:', error);
        next(error);
    }
};

module.exports = {
    index,
    PROFESSIONAL_ROLES
};
