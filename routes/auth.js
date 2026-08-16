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

// Google is told where to send the visitor back to, and that address is baked
// into the strategy from GOOGLE_CALLBACK_URL — which points at localhost. A
// phone opening the site over the LAN therefore finished the sign-in at
// http://localhost:3000, meaning *the phone itself*, and got a connection
// error. In development the address is taken from the request instead, so the
// visitor comes back to the host they started on. Production keeps the
// configured value, which is the one registered with Google.
//
// Note that Google only accepts redirect URIs registered in the project's
// credentials, so a LAN address has to be added there before Google sign-in
// works from a phone. E-mail registration needs none of this.
const googleCallbackUrl = (req) => {
  if (process.env.NODE_ENV === 'production') return undefined;

  const host = req.get('host');
  return host ? `${req.protocol}://${host}/auth/google/callback` : undefined;
};

router.get('/google', (req, res, next) => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    req.flash('error', 'flash.google_not_configured');
    return res.redirect('/auth/login');
  }
  passport.authenticate('google', {
    scope: ['profile', 'email'],
    callbackURL: googleCallbackUrl(req)
  })(req, res, next);
});

const resendVerificationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => String(req.session.userId || req.ip),
  handler: (req, res) => {
    req.flash('error', 'flash.rate_limit_verification');
    res.redirect(req.get('referer') || '/profile');
  }
});

router.get('/verify-email/:token', authController.verifyEmail);
router.post('/resend-verification', resendVerificationLimiter, authController.resendVerification);

router.get('/google/callback', (req, res, next) => {
  // The same address has to be presented again when the code is exchanged.
  passport.authenticate('google', { callbackURL: googleCallbackUrl(req) }, async (err, user, info) => {
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

    const User = require('../models/User');
    if (!user.is_verified) {
      await User.verifyEmail(user.id);
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
      req.session.userIsVerified = true;

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
