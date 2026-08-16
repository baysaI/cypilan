const express = require('express');
const router = express.Router();
const careerController = require('../controllers/careerController');
const { isAuthenticated } = require('../middlewares/auth');
const { uploadCv, processCvUploads } = require('../middlewares/upload');

// Browsing openings is open to everyone; the match ordering simply needs a CV.
router.get('/', careerController.openings);

router.get('/cv', isAuthenticated, careerController.editProfile);
router.post('/cv', isAuthenticated, uploadCv, processCvUploads, careerController.saveProfile);

router.get('/cv/pdf', isAuthenticated, careerController.downloadCypilanPdf);
router.get('/cv/pdf/:userId', isAuthenticated, careerController.downloadCypilanPdf);
router.get('/cv/custom', isAuthenticated, careerController.downloadCustomCv);
router.get('/cv/custom/:userId', isAuthenticated, careerController.downloadCustomCv);
router.post('/cv/custom/delete', isAuthenticated, careerController.removeCustomCv);
router.post('/cv/photo/delete', isAuthenticated, careerController.removePhoto);
router.post('/cv/sifirla', isAuthenticated, careerController.resetProfile);

router.get('/basvurularim', isAuthenticated, careerController.myApplications);
router.post('/basvuru/:listingId', isAuthenticated, careerController.apply);
router.post('/basvuru/:id/geri-cek', isAuthenticated, careerController.withdraw);

router.get('/basvurular', isAuthenticated, careerController.employerPanel);
router.post('/basvurular/:id/durum', isAuthenticated, careerController.setApplicationStatus);

module.exports = router;
