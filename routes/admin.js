const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { isAuthenticated, isAdmin } = require('../middlewares/auth');

router.use(isAuthenticated, isAdmin);

router.get('/', adminController.dashboard);
router.get('/users', adminController.users);
router.get('/listings', adminController.listings);
router.get('/reports', adminController.reports);
router.get('/reports/:id/conversation', adminController.reportConversation);

router.put('/listings/:id/status', adminController.toggleListingStatus);
router.delete('/listings/:id', adminController.deleteListing);
router.put('/users/:id/status', adminController.toggleUserStatus);
router.put('/reports/:id', adminController.resolveReport);

router.post('/users/:id/uyari', adminController.issueWarning);
router.post('/uyari/:id/kaldir', adminController.revokeWarning);

module.exports = router;
