const express = require('express');
const router = express.Router();
const reviewController = require('../controllers/reviewController');
const { isAuthenticated } = require('../middlewares/auth');

router.post('/user/:userId', isAuthenticated, reviewController.submit);
router.post('/user/:userId/delete', isAuthenticated, reviewController.remove);

module.exports = router;
