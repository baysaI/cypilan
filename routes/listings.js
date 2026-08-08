const express = require('express');
const router = express.Router();
const listingController = require('../controllers/listingController');
const { isAuthenticated, isOwner } = require('../middlewares/auth');
const { uploadListingImages } = require('../middlewares/upload');

// Fetch listing param to attach to req for isOwner middleware (Mock middleware)
const fetchListingForOwnership = async (req, res, next) => {
    // const Listing = require('../models/Listing');
    // const listing = await Listing.findBySlug(req.params.slug);
    // req.listing = listing;
    next();
};

router.get('/', listingController.index);

// Create
router.get('/create', isAuthenticated, listingController.showCreate);
router.post('/', isAuthenticated, uploadListingImages, listingController.create);

// Show single
router.get('/:slug', listingController.show);

// Edit
router.get('/:slug/edit', isAuthenticated, fetchListingForOwnership, isOwner, listingController.showEdit);
router.put('/:slug', isAuthenticated, fetchListingForOwnership, isOwner, listingController.update);

// Delete
router.delete('/:slug', isAuthenticated, fetchListingForOwnership, isOwner, listingController.delete);

// AJAX Favorite
router.post('/:id/favorite', isAuthenticated, listingController.toggleFavorite);

module.exports = router;
