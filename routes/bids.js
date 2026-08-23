const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const bidController = require('../controllers/bidController');
const { isAuthenticated } = require('../middlewares/auth');

// Teklif tablosunda kisi basina ilan basina tek satir tutuluyor, yani tekrar
// gonderim veri cogaltmiyordu - ama her gonderim ilan sahibine bir bildirim
// birakiyordu. Pazarlik sirasinda birkac kez fiyat guncellemek normal, otuz
// kez basmak degil.
const bidLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => String(req.session.userId),
    handler: (req, res) => {
        req.flash('error', 'flash.rate_limit_bid');
        res.redirect(req.get('referer') || '/teklifler');
    }
});


router.get('/', isAuthenticated, bidController.openRequests);
router.get('/verdiklerim', isAuthenticated, bidController.myBids);
router.post('/:listingId', isAuthenticated, bidLimiter, bidController.submit);
router.post('/:id/geri-cek', isAuthenticated, bidController.withdraw);

module.exports = router;
