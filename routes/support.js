const express = require('express');
const router = express.Router();
const supportController = require('../controllers/supportController');

// Public endpoints for visitor / logged-in user chat
router.post('/init', supportController.initChat);
router.post('/send', supportController.sendMessage);
router.get('/poll', supportController.pollMessages);
router.post('/rate', supportController.rateChat);
router.post('/close', supportController.closeChat);

module.exports = router;
