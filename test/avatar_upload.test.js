const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const t = require('./helpers');
const User = require('../models/User');
const { processAvatarImage, removeAvatarByUrl } = require('../middlewares/upload');
const { setUserLocal } = require('../middlewares/auth');

t.run('Avatar Upload & Management Tests', async (db) => {
  const userId = t.makeUser(db, 'avatar_test@test.local', 'Avatar Test User', 'user');

  // 1. Generate a test image buffer using sharp
  const testImageBuffer = await sharp({
    create: {
      width: 600,
      height: 400,
      channels: 4,
      background: { r: 50, g: 150, b: 250, alpha: 1 }
    }
  }).png().toBuffer();

  const req = {
    file: {
      buffer: testImageBuffer,
      mimetype: 'image/png',
      originalname: 'test_photo.png'
    }
  };
  const res = {};

  let middlewareCalled = false;
  await processAvatarImage(req, res, (err) => {
    if (err) throw err;
    middlewareCalled = true;
  });

  t.assert(middlewareCalled, 'processAvatarImage completed without error');
  t.assert(Boolean(req.processedAvatar), 'req.processedAvatar is populated');
  t.assert(req.processedAvatar.startsWith('/uploads/avatars/avatar-') && req.processedAvatar.endsWith('.webp'), 'Avatar saved in webp format under /uploads/avatars/');

  // 2. Verify processed image dimensions & format on disk
  const absoluteAvatarPath = path.join(t.rootDir, 'public', req.processedAvatar);
  t.assert(fs.existsSync(absoluteAvatarPath), 'Avatar file exists on disk');

  const avatarBuffer = fs.readFileSync(absoluteAvatarPath);
  const metadata = await sharp(avatarBuffer).metadata();
  t.assertEqual(metadata.width, 300, 'Avatar width cropped and resized to 300px');
  t.assertEqual(metadata.height, 300, 'Avatar height cropped and resized to 300px');
  t.assertEqual(metadata.format, 'webp', 'Avatar format is webp');

  // 3. User update with avatar_url
  await User.update(userId, { avatar_url: req.processedAvatar });
  const userInDb = await User.findById(userId);
  t.assertEqual(userInDb.avatar_url, req.processedAvatar, 'User avatar_url persisted in database');

  // 4. setUserLocal populates avatar_url in res.locals
  const authReq = {
    session: { userId, userRole: 'user', userEmail: 'avatar_test@test.local', userName: 'Avatar Test User', userAvatar: req.processedAvatar, userIsVerified: true }
  };
  const authRes = { locals: {} };
  await setUserLocal(authReq, authRes, () => {});
  t.assertEqual(authRes.locals.user.avatar_url, req.processedAvatar, 'setUserLocal sets user.avatar_url on res.locals');

  // 5. Template rendering tests
  const editHtml = await t.render('profile/edit.ejs', {
    user: userInDb,
    title: 'Profili Düzenle'
  });
  t.assert(editHtml.includes(req.processedAvatar), 'profile/edit.ejs renders user avatar image');
  t.assert(editHtml.includes('name="avatar"'), 'profile/edit.ejs has avatar file input');
  t.assert(editHtml.includes('id="removeAvatarBtn"'), 'profile/edit.ejs has remove avatar button');

  // 6. Header rendering tests
  const headerHtml = await t.render('partials/header.ejs', {
    user: authRes.locals.user,
    currentUser: authRes.locals.user,
    categories: [],
    currency: 'TRY',
    lang: 'tr',
    theme: 'light'
  });
  t.assert(headerHtml.includes(req.processedAvatar), 'header.ejs displays user avatar image');

  // 7. Cleanup & remove avatar file
  await removeAvatarByUrl(req.processedAvatar);
  t.assert(!fs.existsSync(absoluteAvatarPath), 'removeAvatarByUrl removes avatar file from disk');

  // 8. Safe path handling in removeAvatarByUrl
  await removeAvatarByUrl('https://example.com/avatar.jpg');
  await removeAvatarByUrl('../../../etc/passwd');
  await removeAvatarByUrl(null);
  t.ok('removeAvatarByUrl safely ignores non-local/invalid paths without throwing');
});
