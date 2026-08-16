const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const serviceController = require('../controllers/serviceController');
const maintenanceController = require('../controllers/maintenanceController');
const { isAuthenticated, isAdmin } = require('../middlewares/auth');

router.use(isAuthenticated, isAdmin);

// The sidebar badge is on every admin page, so the count is resolved once here
// rather than being remembered in each controller action.
router.use(async (req, res, next) => {
    try {
        const ServiceRequest = require('../models/ServiceRequest');
        const Setting = require('../models/Setting');
        res.locals.pendingServices = await ServiceRequest.countPending();
        res.locals.maintenanceOn = Setting.getBool(Setting.KEYS.MAINTENANCE_ENABLED, false);
        res.locals.unlimitedOn = Setting.getBool(Setting.KEYS.UNLIMITED_LISTINGS_MODE, false);
    } catch (error) {
        console.error('Pending service count error:', error);
        res.locals.pendingServices = 0;
    }
    next();
});

router.get('/', adminController.dashboard);
router.get('/analytics', adminController.analytics);
router.get('/users', adminController.users);
router.get('/listings', adminController.listings);
router.get('/reports', adminController.reports);
router.get('/reports/:id/conversation', adminController.reportConversation);

router.put('/listings/:id/status', adminController.toggleListingStatus);
router.delete('/listings/:id', adminController.deleteListing);
router.put('/users/:id/status', adminController.toggleUserStatus);
router.put('/users/:id', adminController.updateUser);
router.post('/users/:id/duzenle', adminController.updateUser);
router.put('/reports/:id', adminController.resolveReport);

router.post('/users/:id/uyari', adminController.issueWarning);
router.post('/uyari/:id/kaldir', adminController.revokeWarning);

router.get('/bakim', maintenanceController.show);
router.post('/bakim', maintenanceController.update);
router.post('/sinirsiz-ilan', maintenanceController.updateUnlimited);

router.get('/hizmet-talepleri', serviceController.adminQueue);
router.post('/hizmet-talepleri/:id/durum', serviceController.adminSetStatus);

module.exports = router;
