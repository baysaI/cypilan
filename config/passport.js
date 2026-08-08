const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/User');

const clientID = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
const callbackURL = process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3000/auth/google/callback';

if (clientID && clientSecret) {
  passport.use(new GoogleStrategy({
      clientID,
      clientSecret,
      callbackURL
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails && profile.emails[0] ? profile.emails[0].value : null;
        if (!email) return done(null, false, { message: 'Google hesabı e-postası alınamadı.' });

        let user = await User.findByEmail(email);
        if (!user) {
          const userId = await User.create({
            email,
            password: Math.random().toString(36).slice(-10),
            full_name: profile.displayName || 'Google User',
            phone: '',
            role: 'user'
          });
          user = await User.findById(userId);
        }
        return done(null, user);
      } catch (err) {
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
