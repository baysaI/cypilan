const express = require('express');
const router = express.Router();
const bidController = require('../controllers/bidController');
const { isAuthenticated } = require('../middlewares/auth');

router.get('/', isAuthenticated, bidController.openRequests);
router.get('/verdiklerim', isAuthenticated, bidController.myBids);
router.post('/:listingId', isAuthenticated, bidController.submit);
router.post('/:id/geri-cek', isAuthenticated, bidController.withdraw);

module.exports = router;
