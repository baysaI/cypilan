const express = require('express');
const router = express.Router();
const searchController = require('../controllers/searchController');
const { isAuthenticated } = require('../middlewares/auth');

// Mock Models
const Listing = {
    findAll: async () => ({ data: [], total: 0 }),
    findById: async (id) => ({ id, title: 'Mock' }),
    toggleFavorite: async () => ({ favorited: true })
};
const Category = {
    findAll: async () => []
};

// Listings API
router.get('/listings', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const result = await Listing.findAll({}, page, 20);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

router.get('/listings/:id', async (req, res) => {
    try {
        const listing = await Listing.findById(req.params.id);
        if (!listing) return res.status(404).json({ error: 'Not found' });
        res.json(listing);
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Categories API
router.get('/categories', async (req, res) => {
    try {
        const categories = await Category.findAll();
        res.json(categories);
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Search API
router.get('/search/suggestions', searchController.suggestions);

// Favorite toggle API
router.post('/listings/:id/favorite', isAuthenticated, async (req, res) => {
    try {
        const listingId = req.params.id;
        const result = await Listing.toggleFavorite(listingId, req.session.userId);
        res.json({ success: true, favorited: result.favorited });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
