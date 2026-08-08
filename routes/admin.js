const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { isAuthenticated, isAdmin } = require('../middlewares/auth');

// All admin routes require authentication and admin role
router.use(isAuthenticated, isAdmin);

router.get('/', adminController.dashboard);
router.get('/users', adminController.users);
router.get('/listings', adminController.listings);
router.get('/reports', adminController.reports);

// Status toggles (AJAX endpoints)
router.put('/listings/:id/status', adminController.toggleListingStatus);
router.put('/users/:id/status', adminController.toggleUserStatus);

module.exports = router;
