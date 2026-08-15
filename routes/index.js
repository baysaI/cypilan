const express = require('express');
const router = express.Router();
const homeController = require('../controllers/homeController');
const searchController = require('../controllers/searchController');
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

router.get('/', homeController.index);

router.get('/search', searchController.search);

router.use('/auth', authRoutes);
router.use('/listings', listingsRoutes);
router.use('/api', apiRoutes);
router.use('/admin', adminRoutes);
router.use('/messages', messagesRoutes);
router.use('/report', reportsRoutes);
router.use('/reviews', reviewsRoutes);
router.use('/teklifler', bidsRoutes);
router.use('/kariyer', careerRoutes);

const profileController = require('../controllers/profileController');
router.get('/profile', isAuthenticated, profileController.index);
router.get('/favorites', isAuthenticated, (req, res) => res.redirect('/profile/favorites'));
router.get('/profile/edit', isAuthenticated, profileController.edit);
router.put('/profile', isAuthenticated, profileController.update);
router.post('/profile/password', isAuthenticated, profileController.changePassword);
router.post('/profile/email', isAuthenticated, profileController.changeEmail);
router.get('/profile/listings', isAuthenticated, profileController.myListings);
router.get('/profile/favorites', isAuthenticated, profileController.myFavorites);
router.get('/profile/messages', isAuthenticated, (req, res) => res.redirect('/messages'));

const panelController = require('../controllers/panelController');
router.get('/panel', isAuthenticated, panelController.index);

const serviceController = require('../controllers/serviceController');
router.get('/profile/taleplerim', isAuthenticated, serviceController.myRequests);
router.post('/hizmet/:type/:listingId', isAuthenticated, serviceController.request);

const bidController = require('../controllers/bidController');
router.get('/profile/teklifler', isAuthenticated, bidController.received);
router.post('/profile/teklifler/:id/kabul', isAuthenticated, bidController.accept);
router.post('/profile/teklifler/:id/reddet', isAuthenticated, bidController.reject);

router.get('/profile/:id', profileController.show);


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

module.exports = router;
