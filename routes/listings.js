const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const listingController = require('../controllers/listingController');
const Listing = require('../models/Listing');
const { isAuthenticated, isOwner, requireVerifiedEmail } = require('../middlewares/auth');
const { verifyCsrf } = require('../middlewares/csrf');
const { uploadListingImages, processImagesWithWatermark } = require('../middlewares/upload');

// Ilan sayfasindaki hizli teklif kutusu da ayni bildirimi uretiyor, dolayisiyla
// ayni siniri hak ediyor.
const offerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => String(req.session.userId),
    handler: (req, res) => {
        req.flash('error', 'flash.rate_limit_bid');
        res.redirect(req.get('referer') || '/listings');
    }
});


// Favorilemek ucuz bir islem ve gezinirken cok kez yapilabiliyor, bu yuzden
// sinir yuksek. Yine de sinirsiz degil: favoriden cikarip tekrar eklemek ilan
// sahibine her seferinde bildirim gonderiyordu.
const favoriteLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => String(req.session.userId),
    handler: (req, res) => {
        req.flash('error', 'flash.rate_limit_favorite');
        res.redirect(req.get('referer') || '/listings');
    }
});


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

router.get('/compare', listingController.compare);

// '/:slug'tan once duruyor: asagidaki slug yolu bu adresi "harita" adli bir
// ilan sanip yakalardi.
router.get('/harita', listingController.map);

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

router.post('/:id/favorite', isAuthenticated, favoriteLimiter, listingController.toggleFavorite);

router.post('/:id/price-alert', isAuthenticated, listingController.togglePriceAlert);

router.post('/:id/quick-offer', isAuthenticated, offerLimiter, listingController.quickOffer);

// Haftalik hak zaten modelde sayiliyor; buradaki sinir yalnizca ard arda
// gonderilen isteklerin bosuna sorgu uretmesini kesiyor.
router.post('/:id/boost', isAuthenticated, offerLimiter, listingController.boost);

module.exports = router;
