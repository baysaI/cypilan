const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const reportController = require('../controllers/reportController');
const { isAuthenticated } = require('../middlewares/auth');

const reportLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => String(req.session.userId),
    handler: (req, res) => {
        req.flash('error', 'Saatlik şikayet sınırına ulaştınız. Lütfen daha sonra tekrar deneyin.');
        res.redirect(req.get('referer') || '/');
    }
});

router.use(isAuthenticated);

router.post('/listings/:id', reportLimiter, reportController.reportListing);
router.post('/users/:userId', reportLimiter, reportController.reportUser);

module.exports = router;
