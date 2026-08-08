const express = require('express');
const router = express.Router();
const homeController = require('../controllers/homeController');
const searchController = require('../controllers/searchController');
const { isAuthenticated } = require('../middlewares/auth');

const authRoutes = require('./auth');
const listingsRoutes = require('./listings');
const apiRoutes = require('./api');
const adminRoutes = require('./admin');
const profileRoutes = require('./profile');

router.get('/', homeController.index);

router.get('/search', searchController.search);

router.use('/auth', authRoutes);
router.use('/listings', listingsRoutes);
router.use('/api', apiRoutes);
router.use('/admin', adminRoutes);

const profileController = require('../controllers/profileController');
router.get('/profile/edit', isAuthenticated, profileController.edit);
router.put('/profile', isAuthenticated, profileController.update);
router.get('/profile/listings', isAuthenticated, profileController.myListings);
router.get('/profile/favorites', isAuthenticated, profileController.myFavorites);
router.get('/profile/messages', isAuthenticated, profileController.myMessages);
router.get('/profile/:id', profileController.show);


module.exports = router;
