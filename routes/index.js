const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const homeController = require('../controllers/homeController');
const searchController = require('../controllers/searchController');
const listingController = require('../controllers/listingController');
const { isAuthenticated } = require('../middlewares/auth');

const authRoutes = require('./auth');
const listingsRoutes = require('./listings');
const apiRoutes = require('./api');
const adminRoutes = require('./admin');
const messagesRoutes = require('./messages');
const reportsRoutes = require('./reports');
const reviewsRoutes = require('./reviews');
const bidsRoutes = require('./bids');
const careerRoutes = require('./career');
const notificationsRoutes = require('./notifications');
const supportRoutes = require('./support');

const seoController = require('../controllers/seoController');
const guideController = require('../controllers/guideController');

// Harita bir sure /harita adresinde durdu. Paylasilmis ya da yer imine
// eklenmis baglantilar kirilmasin diye eski adres yenisine yonlendiriliyor;
// 301 ile, cunku tasima kalici.
router.get('/harita', (req, res) => res.redirect(301, '/listings/harita'));
router.get('/sitemap.xml', seoController.sitemap);
router.get('/robots.txt', seoController.robots);

router.get('/rehber', guideController.index);
router.get('/rehber/:slug', guideController.show);

router.get('/', homeController.index);

router.get('/search', searchController.search);

router.use('/auth', authRoutes);
router.use('/listings', listingsRoutes);
router.use('/api', apiRoutes);
router.use('/api/support', supportRoutes);
router.use('/admin', adminRoutes);
router.use('/messages', messagesRoutes);
router.use('/notifications', notificationsRoutes);
router.use('/report', reportsRoutes);
router.use('/reviews', reviewsRoutes);
router.use('/teklifler', bidsRoutes);
router.use('/kariyer', careerRoutes);

const { uploadAvatar, processAvatarImage } = require('../middlewares/upload');
const { verifyCsrf } = require('../middlewares/csrf');
const profileController = require('../controllers/profileController');
router.get('/profile', isAuthenticated, profileController.index);
router.get('/favorites', isAuthenticated, (req, res) => res.redirect('/profile/favorites'));
router.get('/profile/edit', isAuthenticated, profileController.edit);
router.post('/profile', isAuthenticated, uploadAvatar, verifyCsrf, processAvatarImage, profileController.update);
router.post('/profile/password', isAuthenticated, profileController.changePassword);
router.post('/profile/email', isAuthenticated, profileController.changeEmail);
router.post('/profile/delete', isAuthenticated, profileController.deleteAccount);
router.post('/profile/sil', isAuthenticated, profileController.deleteAccount);
router.delete('/profile', isAuthenticated, profileController.deleteAccount);
router.get('/profile/listings', isAuthenticated, profileController.myListings);
router.get('/profile/favorites', isAuthenticated, profileController.myFavorites);
router.get('/profile/alarmlar', isAuthenticated, profileController.myPriceAlerts);
router.get('/profile/messages', isAuthenticated, (req, res) => res.redirect('/messages'));
router.get('/profile/notifications', isAuthenticated, (req, res) => res.redirect('/notifications'));

const panelController = require('../controllers/panelController');
router.get('/panel', isAuthenticated, panelController.index);

const serviceController = require('../controllers/serviceController');

// Hizmet talebi yonetici kuyruguna dusuyor; sinirsiz birakmak kuyrugu
// doldurmanin serbest olmasi demekti.
const serviceLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => String(req.session.userId),
    handler: (req, res) => {
        req.flash('error', 'flash.rate_limit_service');
        res.redirect(req.get('referer') || '/profile/taleplerim');
    }
});

router.get('/profile/taleplerim', isAuthenticated, serviceController.myRequests);
router.post('/hizmet/:type/:listingId', isAuthenticated, serviceLimiter, serviceController.request);

const bidController = require('../controllers/bidController');
router.get('/profile/teklifler', isAuthenticated, bidController.received);
router.post('/profile/teklifler/:id/kabul', isAuthenticated, bidController.accept);
router.post('/profile/teklifler/:id/reddet', isAuthenticated, bidController.reject);

router.get('/profile/:id', profileController.show);


// Open to visitors, because the people most likely to notice a broken page are
// the ones who have not signed up. Capped per address so the box cannot be used
// as a firehose; CSRF is already enforced upstream for non-multipart posts.
const feedbackLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    req.flash('error', 'flash.feedback_rate_limited');
    res.redirect(req.get('referer') || '/');
  }
});

const feedbackController = require('../controllers/feedbackController');
router.post('/geri-bildirim', feedbackLimiter, feedbackController.submit);

const pageController = require('../controllers/pageController');

router.get('/sss', pageController.faq);
router.get('/nasil-ilan-verilir', pageController.howToPost);
router.get('/ilan-paketleri', pageController.pricing);
router.get('/guvenlik', pageController.safety);
router.get('/kurumsal', pageController.corporate);
router.get('/reklam', pageController.advertise);
router.get('/gizlilik-politikasi', pageController.privacy);
router.get('/kullanim-kosullari', pageController.terms);
router.get('/cerez-politikasi', pageController.cookiePolicy);
router.get('/yakinda', pageController.soon);
router.get('/ogrenci', pageController.students);
router.get('/yatirimci', pageController.investors);

module.exports = router;
