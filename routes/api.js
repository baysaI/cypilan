const express = require('express');
const router = express.Router();
const Listing = require('../models/Listing');
const Category = require('../models/Category');
const listingController = require('../controllers/listingController');
const searchController = require('../controllers/searchController');
const { isAuthenticated } = require('../middlewares/auth');
const listingDraft = require('../utils/listingDraft');

const MAX_LIMIT = 100;

router.get('/listings', async (req, res) => {
    try {
        const page = parseInt(req.query.page, 10) || 1;
        const limit = Math.min(parseInt(req.query.limit, 10) || 20, MAX_LIMIT);

        const filters = {
            q: req.query.q ? String(req.query.q).trim() : undefined,
            category: req.query.category,
            city: req.query.city,
            minPrice: req.query.minPrice,
            maxPrice: req.query.maxPrice,
            sort: req.query.sort
        };

        const result = await Listing.search(filters, page, limit);
        res.json({ data: result.data, total: result.total, pages: result.pages, page });
    } catch (error) {
        console.error('API Listings Error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

router.get('/listings/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (!Number.isInteger(id)) {
            return res.status(400).json({ error: 'Invalid id' });
        }

        const listing = await Listing.findById(id);
        if (!listing || listing.status !== 'active') {
            return res.status(404).json({ error: 'Not found' });
        }

        listing.images = await Listing.getImages(listing.id);
        res.json(listing);
    } catch (error) {
        console.error('API Listing Detail Error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

router.get('/categories', async (req, res) => {
    try {
        const categories = await Category.getTree();
        res.json(categories);
    } catch (error) {
        console.error('API Categories Error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

router.get('/search/suggestions', searchController.suggestions);

// Composes a first draft of a listing description from the facts the seller has
// already typed. It never adds a feature that was not supplied, so the draft can
// be published as-is without describing something the item does not have.
router.post('/listing-draft', isAuthenticated, async (req, res) => {
    try {
        const rootSlug = String(req.body.rootSlug || '');
        const allowed = listingDraft.featuresFor(rootSlug);
        const features = Array.isArray(req.body.features)
            ? req.body.features.filter((feature) => allowed.includes(feature))
            : [];

        const text = listingDraft.build({
            rootSlug,
            categoryName: req.body.categoryName,
            cityName: req.body.cityName,
            district: req.body.district,
            rooms: req.body.rooms,
            size: req.body.size,
            floor: req.body.floor,
            buildYear: req.body.buildYear,
            year: req.body.year,
            brand: req.body.brand,
            model: req.body.model,
            km: req.body.km,
            fuel: req.body.fuel,
            features
        }, res.locals.t);

        res.json({ draft: text });
    } catch (error) {
        console.error('Listing Draft Error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

router.post('/listings/:id/favorite', isAuthenticated, listingController.toggleFavorite);

module.exports = router;
