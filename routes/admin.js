const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const serviceController = require('../controllers/serviceController');
const maintenanceController = require('../controllers/maintenanceController');
const supportController = require('../controllers/supportController');
const { isAuthenticated, isAdmin } = require('../middlewares/auth');

router.use(isAuthenticated, isAdmin);

// The sidebar badge is on every admin page, so the count is resolved once here
// rather than being remembered in each controller action.
router.use(async (req, res, next) => {
    try {
        const ServiceRequest = require('../models/ServiceRequest');
        const Support = require('../models/Support');
        const Feedback = require('../models/Feedback');
        const Setting = require('../models/Setting');
        const [pendingServices, pendingSupport, pendingFeedback] = await Promise.all([
            ServiceRequest.countPending(),
            Support.countWaiting(),
            Feedback.countNew()
        ]);
        res.locals.pendingServices = pendingServices;
        res.locals.pendingSupport = pendingSupport;
        res.locals.pendingFeedback = pendingFeedback;
        res.locals.maintenanceOn = Setting.getBool(Setting.KEYS.MAINTENANCE_ENABLED, false);
        res.locals.unlimitedOn = Setting.getBool(Setting.KEYS.UNLIMITED_LISTINGS_MODE, false);
    } catch (error) {
        console.error('Pending admin badge error:', error);
        res.locals.pendingServices = 0;
        res.locals.pendingSupport = 0;
        res.locals.pendingFeedback = 0;
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
router.post('/listings/:id/ikaz', adminController.sendListingNotice);
router.delete('/listings/:id', adminController.deleteListing);
router.put('/users/:id/status', adminController.toggleUserStatus);
router.put('/users/:id', adminController.updateUser);
router.post('/users/:id/duzenle', adminController.updateUser);
router.put('/reports/:id', adminController.resolveReport);

router.post('/users/:id/uyari', adminController.issueWarning);
router.post('/uyari/:id/kaldir', adminController.revokeWarning);
router.post('/uyari/:id/sil', adminController.deleteWarning);

router.get('/bakim', maintenanceController.show);
router.post('/bakim', maintenanceController.update);
router.post('/sinirsiz-ilan', maintenanceController.updateUnlimited);

const broadcastController = require('../controllers/broadcastController');
router.get('/duyuru', broadcastController.compose);
router.post('/duyuru', broadcastController.send);

const feedbackController = require('../controllers/feedbackController');
router.get('/geri-bildirim', feedbackController.adminQueue);
router.post('/geri-bildirim/:id/durum', feedbackController.adminSetStatus);
router.post('/geri-bildirim/:id/sil', feedbackController.adminDelete);

router.get('/hizmet-talepleri', serviceController.adminQueue);
router.post('/hizmet-talepleri/:id/durum', serviceController.adminSetStatus);

router.get('/canli-destek', supportController.adminPanel);
router.get('/canli-destek/conversations', supportController.adminListConversations);
router.get('/canli-destek/messages/:id', supportController.adminGetMessages);
router.post('/canli-destek/reply/:id', supportController.adminReply);
router.post('/canli-destek/status/:id', supportController.adminSetStatus);
router.delete('/canli-destek/:id', supportController.adminDeleteConversation);
router.post('/canli-destek/sil/:id', supportController.adminDeleteConversation);

module.exports = router;
