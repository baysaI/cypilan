const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const reviewController = require('../controllers/reviewController');
const { isAuthenticated } = require('../middlewares/auth');

// Bir kullaniciya birden fazla degerlendirme yazilamiyor, ama farkli
// kullanicilara arka arkaya yazip her birine bildirim birakmak mumkundu.
// Saatte on, gercek kullanimin cok uzerinde.
const reviewLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => String(req.session.userId),
    handler: (req, res) => {
        req.flash('error', 'flash.rate_limit_review');
        res.redirect(req.get('referer') || '/');
    }
});


router.post('/user/:userId', isAuthenticated, reviewLimiter, reviewController.submit);
router.post('/user/:userId/delete', isAuthenticated, reviewController.remove);

module.exports = router;
