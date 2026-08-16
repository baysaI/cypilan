const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const messageController = require('../controllers/messageController');
const { isAuthenticated, requireVerifiedEmail } = require('../middlewares/auth');

const sendLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => String(req.session.userId),
    handler: (req, res) => {
        req.flash('error', 'flash.rate_limit_message');
        res.redirect('/messages');
    }
});

router.use(isAuthenticated);

router.get('/', messageController.inbox);
router.post('/', sendLimiter, requireVerifiedEmail, messageController.send);
router.get('/:userId', messageController.conversation);
router.post('/block/:userId', messageController.blockUser);
router.post('/unblock/:userId', messageController.unblockUser);

module.exports = router;
