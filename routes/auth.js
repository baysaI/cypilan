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

router.get('/google/callback', (req, res, next) => {
  passport.authenticate('google', (err, user, info) => {
    if (err || !user) {
      console.error('Google OAuth callback error:', err || info);
      req.flash('error', (info && info.message) || 'Google ile giriş yapılırken bir hata oluştu.');
      return res.redirect('/auth/login');
    }

    req.logIn(user, (loginErr) => {
      if (loginErr) {
        console.error('Login error:', loginErr);
        req.flash('error', 'Oturum açılırken hata oluştu.');
        return res.redirect('/auth/login');
      }

      req.session.userId = user.id;
      req.session.userRole = user.role;
      req.session.userEmail = user.email;
      req.session.userName = user.full_name;

      req.session.save((saveErr) => {
        if (saveErr) {
          console.error('Session save error:', saveErr);
        }
        req.flash('success', 'Google ile başarıyla giriş yaptınız.');
        res.redirect('/');
      });
    });
  })(req, res, next);
});

module.exports = router;
