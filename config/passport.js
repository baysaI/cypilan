const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/User');
const googleSignup = require('../utils/googleSignup');

const clientID = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
const callbackURL = process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3000/auth/google/callback';

if (clientID && clientSecret) {
  passport.use(new GoogleStrategy({
      clientID,
      clientSecret,
      callbackURL,
      proxy: true
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const result = await googleSignup.resolve(profile);

        if (result.error) {
          return done(null, false, { message: result.error });
        }

        // Hesap burada acilmiyor. Yeni gelen, once yas ve kullanim kosullari
        // onay sayfasina gidiyor; hesap o sayfa gonderilince aciliyor
        // (authController.completeGoogleSignup). Vazgecen olursa ortada
        // onaysiz bir hesap kalmiyor.
        if (result.pending) {
          return done(null, false, { pendingGoogle: result.pending });
        }

        return done(null, result.user);
      } catch (err) {
        console.error('Google Auth Strategy Error:', err);
        return done(err, null);
      }
    }
  ));
}

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (err) {
    done(err, null);
  }
});

module.exports = passport;
