const express = require('express');
const router = express.Router();
const careerController = require('../controllers/careerController');
const { isAuthenticated } = require('../middlewares/auth');

// Browsing openings is open to everyone; the match ordering simply needs a CV.
router.get('/', careerController.openings);

router.get('/cv', isAuthenticated, careerController.editProfile);
router.post('/cv', isAuthenticated, careerController.saveProfile);

router.get('/basvurularim', isAuthenticated, careerController.myApplications);
router.post('/basvuru/:listingId', isAuthenticated, careerController.apply);
router.post('/basvuru/:id/geri-cek', isAuthenticated, careerController.withdraw);

router.get('/basvurular', isAuthenticated, careerController.employerPanel);
router.post('/basvurular/:id/durum', isAuthenticated, careerController.setApplicationStatus);

module.exports = router;
