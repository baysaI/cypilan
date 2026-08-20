const Listing = require('../models/Listing');
const Category = require('../models/Category');
const User = require('../models/User');
const Setting = require('../models/Setting');

const index = async (req, res) => {
    try {
        const featuredListings = await Listing.getFeatured(24);
        const recentListings = await Listing.getRecent(24);
        const showRecentListings = Setting.getBool(Setting.KEYS.SHOW_RECENT_LISTINGS, false);
        const categories = await Category.getMainCategoriesWithCount();

        const totalListings = await Listing.countAll();
        const totalUsers = await User.countAll();
        const stats = { totalListings, totalUsers, totalCities: 5 };

        let userFavoriteIds = [];
        if (req.session && req.session.userId) {
            userFavoriteIds = await Listing.getUserFavoriteIds(req.session.userId);
        }

        res.locals.meta = res.locals.meta || {};
        res.locals.meta.title = 'CYPILAN.COM - Kıbrıs\'ın En Büyük Ücretsiz İlan Sitesi';
        res.locals.meta.description = 'Kuzey Kıbrıs Türk Cumhuriyeti (KKTC) genelinde satılık ve kiralık emlak, vasıta, ikinci el eşya, iş ilanları ve usta hizmetleri. Hemen ücretsiz ilan verin!';

        res.render('home', {
            featuredListings,
            recentListings,
            showRecentListings,
            categories,
            stats,
            userFavoriteIds,
            title: 'Anasayfa'
        });
    } catch (error) {
        console.error('Home Controller Error:', error);
        res.render('home', {
            featuredListings: [],
            recentListings: [],
            categories: [],
            stats: { totalListings: 0, totalUsers: 0, totalCities: 5 },
            title: 'Anasayfa'
        });
    }
};

module.exports = {
    index
};
