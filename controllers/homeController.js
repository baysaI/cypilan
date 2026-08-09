const Listing = require('../models/Listing');
const Category = require('../models/Category');
const User = require('../models/User');

const index = async (req, res) => {
    try {
        const featuredListings = await Listing.getFeatured(8);
        const recentListings = await Listing.getRecent(12);
        const categories = await Category.getMainCategoriesWithCount();

        const totalListings = await Listing.countAll();
        const totalUsers = await User.countAll();
        const stats = { totalListings, totalUsers, totalCities: 5 };

        let userFavoriteIds = [];
        if (req.session && req.session.userId) {
            userFavoriteIds = await Listing.getUserFavoriteIds(req.session.userId);
        }

        res.locals.meta = res.locals.meta || {};
        res.locals.meta.title = 'CYPILAN.COM - Kıbrıs\'ın İlan Sitesi';

        res.render('home', {
            featuredListings,
            recentListings,
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
