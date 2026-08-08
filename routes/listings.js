const express = require('express');
const router = express.Router();
const listingController = require('../controllers/listingController');
const { isAuthenticated, isOwner } = require('../middlewares/auth');
const { uploadListingImages, processImagesWithWatermark } = require('../middlewares/upload');

const fetchListingForOwnership = async (req, res, next) => {
    next();
};

router.get('/', listingController.index);

router.get('/create', isAuthenticated, listingController.showCreate);
router.post('/', isAuthenticated, uploadListingImages, processImagesWithWatermark, listingController.create);

router.get('/:slug', listingController.show);

router.get('/:slug/edit', isAuthenticated, fetchListingForOwnership, isOwner, listingController.showEdit);
router.put('/:slug', isAuthenticated, fetchListingForOwnership, isOwner, listingController.update);

router.delete('/:slug', isAuthenticated, fetchListingForOwnership, isOwner, listingController.delete);

router.post('/:id/favorite', isAuthenticated, listingController.toggleFavorite);

module.exports = router;
