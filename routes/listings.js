const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const listingController = require('../controllers/listingController');
const Listing = require('../models/Listing');
const { isAuthenticated, isOwner } = require('../middlewares/auth');
const { verifyCsrf } = require('../middlewares/csrf');
const { uploadListingImages, processImagesWithWatermark } = require('../middlewares/upload');

const fetchListingForOwnership = async (req, res, next) => {
    try {
        const listing = await Listing.findBySlug(req.params.slug);

        if (!listing) {
            req.flash('error', 'flash.listing_not_found');
            return res.redirect('/profile/listings');
        }

        req.listing = listing;
        next();
    } catch (error) {
        next(error);
    }
};

const phoneRevealLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => String(req.session.userId),
    handler: (req, res) => res.status(429).json({
        error: res.locals.t('flash.rate_limit_phone')
    })
});

router.get('/', listingController.index);

router.get('/create', isAuthenticated, requireVerifiedEmail, listingController.showCreate);

// Multipart bodies are parsed by multer, so the CSRF token is only readable
// after uploadListingImages has run — and images hit the disk only after it passes.
router.post(
    '/',
    isAuthenticated,
    requireVerifiedEmail,
    uploadListingImages,
    verifyCsrf,
    processImagesWithWatermark,
    listingController.create
);

router.get('/:slug', listingController.show);

router.get('/:slug/edit', isAuthenticated, fetchListingForOwnership, isOwner, listingController.showEdit);

// POST rather than the _method PUT override: the override reads req.body, which is
// not populated for multipart requests until multer runs inside this chain.
router.post(
    '/:slug/edit',
    isAuthenticated,
    fetchListingForOwnership,
    isOwner,
    uploadListingImages,
    verifyCsrf,
    processImagesWithWatermark,
    listingController.update
);

router.delete('/:slug', isAuthenticated, fetchListingForOwnership, isOwner, listingController.delete);

router.get('/:id/phone', isAuthenticated, phoneRevealLimiter, listingController.revealPhone);

router.post('/:id/favorite', isAuthenticated, listingController.toggleFavorite);

module.exports = router;
