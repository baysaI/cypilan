const express = require('express');
const router = express.Router();
const profileController = require('../controllers/profileController');
const { isAuthenticated } = require('../middlewares/auth');

router.get('/:id', profileController.show);

router.get('/edit', isAuthenticated, profileController.edit);
router.put('/', isAuthenticated, profileController.update);
router.get('/listings', isAuthenticated, profileController.myListings);
router.get('/favorites', isAuthenticated, profileController.myFavorites);
router.get('/messages', isAuthenticated, profileController.myMessages);

module.exports = router;
