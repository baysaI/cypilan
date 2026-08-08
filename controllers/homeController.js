const Listing = require('../models/Listing');
const Category = require('../models/Category');

const index = async (req, res) => {
    try {
        const featuredListings = await Listing.getFeatured(8);
        const recentListings = await Listing.getRecent(12);
        const categories = await Category.getMainCategoriesWithCount();
        
        // Count total listings in SQL DB
        const totalListings = (recentListings && recentListings.length) || 0;
        const stats = { totalListings, totalUsers: 1, totalCities: 5 };

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
            stats: { totalListings: 0, totalUsers: 0, totalCities: 5 },
            title: 'Anasayfa'
        });
    }
};

module.exports = {
    index
};
