const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const passport = require('../config/passport');
const authController = require('../controllers/authController');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    req.flash('error', 'flash.rate_limit_login');
    res.redirect('/auth/login');
  }
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    req.flash('error', 'flash.rate_limit_login');
    res.redirect('/auth/register');
  }
});

router.get('/login', authController.showLogin);
router.post('/login', loginLimiter, authController.login);

router.get('/register', authController.showRegister);
router.post('/register', registerLimiter, authController.register);

const passwordResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    req.flash('error', 'flash.rate_limit_login');
    res.redirect('/auth/forgot-password');
  }
});

router.get('/forgot-password', authController.showForgotPassword);
router.post('/forgot-password', passwordResetLimiter, authController.forgotPassword);

router.get('/reset-password', authController.showResetPassword);
router.post('/reset-password', passwordResetLimiter, authController.resetPassword);

// POST only: a GET logout can be triggered by any third-party page embedding
// the URL, signing the visitor out without their intent.
router.post('/logout', authController.logout);

router.get('/google', (req, res, next) => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    req.flash('error', 'flash.google_not_configured');
    return res.redirect('/auth/login');
  }
  passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next);
});

router.get('/google/callback', (req, res, next) => {
  passport.authenticate('google', (err, user, info) => {
    if (err || !user) {
      console.error('Google OAuth callback error:', err || info);
      req.flash('error', (info && info.message) || 'flash.google_login_failed');
      return res.redirect('/auth/login');
    }

    const Setting = require('../models/Setting');
    if (Setting.getBool(Setting.KEYS.MAINTENANCE_ENABLED, false) && user.role !== 'admin') {
      req.flash('error', 'flash.maintenance_no_user_login');
      return res.redirect('/auth/login');
    }

    req.logIn(user, (loginErr) => {
      if (loginErr) {
        console.error('Login error:', loginErr);
        req.flash('error', 'flash.session_open_failed');
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
        req.flash('success', 'flash.google_login_success');
        res.redirect('/');
      });
    });
  })(req, res, next);
});

module.exports = router;
