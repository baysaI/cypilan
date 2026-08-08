const express = require('express');
const router = express.Router();
const passport = require('../config/passport');
const authController = require('../controllers/authController');

router.get('/login', authController.showLogin);
router.post('/login', authController.login);

router.get('/register', authController.showRegister);
router.post('/register', authController.register);

router.get('/logout', authController.logout);

// Google OAuth Routes
router.get('/google', (req, res, next) => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    req.flash('error', 'Google ile giriş yapabilmek için .env dosyasına GOOGLE_CLIENT_ID ve GOOGLE_CLIENT_SECRET eklenmelidir.');
    return res.redirect('/auth/login');
  }
  passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next);
});

router.get('/google/callback', 
  passport.authenticate('google', { failureRedirect: '/auth/login', failureFlash: true }),
  (req, res) => {
    req.session.userId = req.user.id;
    req.session.userRole = req.user.role;
    req.session.userEmail = req.user.email;
    req.session.userName = req.user.full_name;
    req.flash('success', 'Google ile başarıyla giriş yaptınız.');
    res.redirect('/');
  }
);

module.exports = router;
