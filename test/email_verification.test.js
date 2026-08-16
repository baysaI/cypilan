const t = require('./helpers');
const User = require('../models/User');

t.run('Email Verification Tests', async (db) => {
  // 1. Create a user with is_verified = 0
  const userId = t.makeUser(db, 'unverified@test.local', 'Doğrulanmamış Kullanıcı');
  let user = await User.findById(userId);
  t.assertEqual(Number(user.is_verified), 0, 'New user is unverified by default');

  // 2. Set verification token
  const crypto = require('crypto');
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  await User.setVerificationToken(userId, token, expiresAt);

  // 3. Find user by verification token
  const foundUser = await User.findByVerificationToken(token);
  t.assert(foundUser && foundUser.id === userId, 'Find user by valid verification token');

  // 4. Verify email
  await User.verifyEmail(userId);
  user = await User.findById(userId);
  t.assertEqual(Number(user.is_verified), 1, 'User is_verified is updated to 1');
  t.assert(!user.email_verification_token, 'Token is cleared after verification');
});
