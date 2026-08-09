const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const listingController = require('../controllers/listingController');
const { isAuthenticated, isOwner } = require('../middlewares/auth');
const { uploadListingImages, processImagesWithWatermark } = require('../middlewares/upload');

const fetchListingForOwnership = async (req, res, next) => {
    next();
};

const phoneRevealLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => String(req.session.userId),
    handler: (req, res) => res.status(429).json({
        error: 'Saatlik numara görüntüleme sınırına ulaştınız. Lütfen daha sonra tekrar deneyin.'
    })
});

router.get('/', listingController.index);

router.get('/create', isAuthenticated, listingController.showCreate);
router.post('/', isAuthenticated, uploadListingImages, processImagesWithWatermark, listingController.create);

router.get('/:slug', listingController.show);

router.get('/:slug/edit', isAuthenticated, fetchListingForOwnership, isOwner, listingController.showEdit);
router.put('/:slug', isAuthenticated, fetchListingForOwnership, isOwner, listingController.update);

router.delete('/:slug', isAuthenticated, fetchListingForOwnership, isOwner, listingController.delete);

router.get('/:id/phone', isAuthenticated, phoneRevealLimiter, listingController.revealPhone);

router.post('/:id/favorite', isAuthenticated, listingController.toggleFavorite);

module.exports = router;
