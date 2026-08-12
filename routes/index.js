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

router.get('/', homeController.index);

router.get('/search', searchController.search);

router.use('/auth', authRoutes);
router.use('/listings', listingsRoutes);
router.use('/api', apiRoutes);
router.use('/admin', adminRoutes);
router.use('/messages', messagesRoutes);
router.use('/report', reportsRoutes);

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

module.exports = router;
