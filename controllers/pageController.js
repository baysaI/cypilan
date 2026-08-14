const listingPolicy = require('../config/listingPolicy');
const appConfig = require('../config/app');
const { ROADMAP_GROUPS, countByStatus } = require('../config/roadmap');
const cities = require('../config/cities');
const Listing = require('../models/Listing');

const faq = (req, res) => {
    res.locals.meta = res.locals.meta || {};
    res.locals.meta.title = `${res.locals.t('footer.faq')} | CYPILAN.COM`;
    res.render('pages/faq', { title: res.locals.t('footer.faq') });
};

const howToPost = (req, res) => {
    res.locals.meta = res.locals.meta || {};
    res.locals.meta.title = `${res.locals.t('footer.how_to_post')} | CYPILAN.COM`;
    res.render('pages/how-to-post', { title: res.locals.t('footer.how_to_post') });
};

const safety = (req, res) => {
    res.locals.meta = res.locals.meta || {};
    res.locals.meta.title = `${res.locals.t('footer.safety_tips')} | CYPILAN.COM`;
    res.render('pages/safety-tips', { title: res.locals.t('footer.safety_tips') });
};

const corporate = (req, res) => {
    res.locals.meta = res.locals.meta || {};
    res.locals.meta.title = `${res.locals.t('footer.corporate_membership')} | CYPILAN.COM`;
    res.render('pages/corporate', { title: res.locals.t('footer.corporate_membership') });
};

const advertise = (req, res) => {
    res.locals.meta = res.locals.meta || {};
    res.locals.meta.title = `${res.locals.t('footer.advertise')} | CYPILAN.COM`;
    res.render('pages/advertise', { title: res.locals.t('footer.advertise') });
};

const privacy = (req, res) => {
    res.locals.meta = res.locals.meta || {};
    res.locals.meta.title = `${res.locals.t('footer.privacy')} | CYPILAN.COM`;
    res.render('pages/privacy', { title: res.locals.t('footer.privacy') });
};

const terms = (req, res) => {
    res.locals.meta = res.locals.meta || {};
    res.locals.meta.title = `${res.locals.t('footer.terms')} | CYPILAN.COM`;
    res.render('pages/terms', { title: res.locals.t('footer.terms') });
};

// Student life pulls together the four things a student actually needs at the
// start and end of term. It is a real query over live listings rather than a
// brochure: an empty section says so instead of showing a placeholder.
const students = async (req, res, next) => {
    try {
        const city = cities.isKnown(req.query.city) ? req.query.city : undefined;

        const [roommates, housing, secondHand, partTime] = await Promise.all([
            Listing.search({ category: 'ev-arkadasi', city }, 1, 8),
            Listing.search({ category: 'ogrenci-evi', city }, 1, 8),
            Listing.search({ category: 'ikinci-el', city }, 1, 8),
            Listing.search({ category: 'yari-zamanli', city }, 1, 8)
        ]);

        res.locals.meta = res.locals.meta || {};
        res.locals.meta.title = `${res.locals.t('students.title')} | CYPILAN.COM`;
        res.locals.meta.description = res.locals.t('students.subtitle');

        res.render('pages/students', {
            sections: [
                { key: 'roommates', category: 'ev-arkadasi', icon: 'fa-user-group', listings: roommates.data, total: roommates.total },
                { key: 'housing', category: 'ogrenci-evi', icon: 'fa-house-chimney', listings: housing.data, total: housing.total },
                { key: 'second_hand', category: 'ikinci-el', icon: 'fa-couch', listings: secondHand.data, total: secondHand.total },
                { key: 'part_time', category: 'yari-zamanli', icon: 'fa-briefcase', listings: partTime.data, total: partTime.total }
            ],
            selectedCity: city || '',
            title: res.locals.t('students.title')
        });
    } catch (error) {
        console.error('Students Page Error:', error);
        next(error);
    }
};

const soon = (req, res) => {
    res.locals.meta = res.locals.meta || {};
    res.locals.meta.title = `${res.locals.t('footer.soon')} | CYPILAN.COM`;
    res.locals.meta.description = res.locals.t('pages.soon.subtitle');

    res.render('pages/soon', {
        roadmapGroups: ROADMAP_GROUPS,
        liveCount: countByStatus('live'),
        soonCount: countByStatus('soon'),
        title: res.locals.t('footer.soon')
    });
};

const cookiePolicy = (req, res) => {
    res.locals.meta = res.locals.meta || {};
    res.locals.meta.title = `${res.locals.t('footer.cookie_policy')} | CYPILAN.COM`;
    res.render('pages/cookie-policy', { title: res.locals.t('footer.cookie_policy') });
};

const pricing = async (req, res, next) => {
    try {
        res.locals.meta = res.locals.meta || {};
        res.locals.meta.title = res.locals.t('footer.pricing');

        // Users are sent here when they run out of free listings, so the page has
        // to know whether that is why they arrived — otherwise its call to action
        // sends them straight back to the form that rejected them.
        let quota = null;
        if (req.session && req.session.userId) {
            const used = await Listing.countByUserInRootCategories(
                req.session.userId,
                listingPolicy.QUOTA_CATEGORIES
            );
            quota = {
                limit: listingPolicy.FREE_LISTING_QUOTA,
                used,
                remaining: Math.max(0, listingPolicy.FREE_LISTING_QUOTA - used)
            };
        }

        res.render('pages/pricing', {
            packages: listingPolicy.PACKAGES,
            freeQuota: listingPolicy.FREE_LISTING_QUOTA,
            paidTiersLive: listingPolicy.PAID_TIERS_LIVE,
            supportEmail: appConfig.app.supportEmail,
            quota,
            title: res.locals.t('footer.pricing')
        });
    } catch (error) {
        console.error('Pricing Page Error:', error);
        next(error);
    }
};

module.exports = {
    faq,
    howToPost,
    pricing,
    safety,
    corporate,
    advertise,
    privacy,
    terms,
    cookiePolicy,
    soon,
    students
};
