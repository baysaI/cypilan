const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const { isAuthenticated } = require('../middlewares/auth');

router.use(isAuthenticated);

router.get('/', notificationController.index);
router.get('/:id/read', notificationController.readAndRedirect);
router.post('/:id/read', notificationController.readAndRedirect);
router.post('/mark-all-read', notificationController.markAllRead);
router.post('/:id/delete', notificationController.deleteNotification);

module.exports = router;
