// Mocking models since they should be in the models directory
// const Listing = require('../models/Listing');
// const Category = require('../models/Category');

const index = async (req, res) => {
    try {
        // In a real app, you would fetch these from DB:
        // const featuredListings = await Listing.getFeatured(8);
        // const recentListings = await Listing.getRecent(12);
        // const categoryStats = await Category.getStats();
        // const stats = await Listing.getGlobalStats();

        const featuredListings = [];
        const recentListings = [];
        const categoryStats = [];
        const stats = { users: 0, listings: 0, sold: 0 };

        // SEO Override
        res.locals.meta.title = 'CYPILAN.COM - Kıbrıs\'ın En Kapsamlı İlan Platformu';

        res.render('home/index', {
            featuredListings,
            recentListings,
            categoryStats,
            stats,
            title: 'Ana Sayfa'
        });
    } catch (error) {
        console.error('Home Controller Error:', error);
        req.flash('error', 'Bir hata oluştu, lütfen daha sonra tekrar deneyin.');
        res.status(500).render('errors/500');
    }
};

module.exports = {
    index
};
