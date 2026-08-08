const Listing = require('../models/Listing');
const Category = require('../models/Category');

const index = async (req, res) => {
    try {
        const featuredListings = await Listing.getFeatured(8);
        const recentListings = await Listing.getRecent(12);
        const categories = await Category.getAll();
        const stats = { totalListings: 50000, totalUsers: 120000, totalCities: 5 };

        res.locals.meta = res.locals.meta || {};
        res.locals.meta.title = 'CYPILAN.COM - Kıbrıs\'ın İlan Sitesi';

        res.render('home', {
            featuredListings,
            recentListings,
            categories,
            stats,
            title: 'Anasayfa'
        });
    } catch (error) {
        console.error('Home Controller Error:', error);
        res.render('home', {
            featuredListings: [],
            recentListings: [],
            categories: [],
            stats: { totalListings: 50000, totalUsers: 120000, totalCities: 5 },
            title: 'Anasayfa'
        });
    }
};

module.exports = {
    index
};
