const t = require('./helpers');
const User = require('../models/User');
const Listing = require('../models/Listing');
const Career = require('../models/Career');
const Message = require('../models/Message');
const Review = require('../models/Review');
const Warning = require('../models/Warning');
const Notification = require('../models/Notification');
const profileController = require('../controllers/profileController');
const adminController = require('../controllers/adminController');

t.run('Kullanıcı Hesabı & Profilini Tamamen Silme Sistemi', async (db) => {
  // 1. Kullanıcı ve ilişkili verilerin oluşturulması
  const user1Id = await User.create({
    email: 'silinecek1@test.com',
    password: 'Password123!',
    full_name: 'Silinecek Kullanıcı',
    has_password: 1
  });

  const user2Id = await User.create({
    email: 'diger@test.com',
    password: 'Password123!',
    full_name: 'Diğer Kullanıcı',
    has_password: 1
  });

  // User 1 için ilan oluşturma
  const listing = await Listing.create({
    user_id: user1Id,
    category_id: 101,
    title: 'Silinecek İlan',
    slug: 'silinecek-ilan-' + Date.now(),
    price: 5000,
    currency: 'TRY',
    images: ['/uploads/listings/test-del-1.webp']
  });

  // User 1 için favori, mesaj, bildirim, CV oluşturma
  await Listing.toggleFavorite(listing.id, user2Id);
  await Message.create({
    sender_id: user1Id,
    receiver_id: user2Id,
    listing_id: listing.id,
    content: 'Merhaba satılık mı?'
  });
  await Notification.create({
    user_id: user1Id,
    type: 'system',
    title: 'Test Bildirimi',
    message: 'Test Mesajı'
  });
  await Career.saveProfile(user1Id, {
    headline: 'Yazılım Uzmanı',
    summary: 'Deneyimli geliştirici özgeçmiş bilgisi'
  });

  // 2. Yanlış şifre ile silme denemesi (Engellenmeli)
  let flashMessages = [];
  let redirectedTo = null;
  const mockReqWrongPass = {
    session: { userId: user1Id, userRole: 'user' },
    body: { current_password: 'YanlisSifre' },
    flash: (type, msg) => { flashMessages.push({ type, msg }); }
  };
  const mockRes = {
    locals: { t: (k) => k, meta: {} },
    redirect: (url) => { redirectedTo = url; }
  };

  await profileController.deleteAccount(mockReqWrongPass, mockRes);
  t.assertEqual(redirectedTo, '/profile/edit', 'Hatalı şifrede profil düzenlemeye yönlendirildi');
  t.assert(flashMessages.some(f => f.msg === 'flash.password_wrong'), 'Hatalı şifre uyarısı verildi');

  // Kullanıcı hala mevcut olmalı
  let checkUser = await User.findById(user1Id);
  t.assert(Boolean(checkUser), 'Hatalı şifre sonrası kullanıcı silinmedi');

  // 3. Doğru şifre ile kullanıcının kendi hesabını silmesi
  let sessionDestroyed = false;
  let cookieCleared = null;
  const mockReqSuccess = {
    session: {
      userId: user1Id,
      userRole: 'user',
      destroy: (cb) => {
        sessionDestroyed = true;
        if (cb) cb(null);
      }
    },
    body: { current_password: 'Password123!' },
    flash: (type, msg) => { flashMessages.push({ type, msg }); }
  };
  const mockResSuccess = {
    locals: { t: (k) => k, meta: {} },
    clearCookie: (name) => { cookieCleared = name; },
    redirect: (url) => { redirectedTo = url; }
  };

  await profileController.deleteAccount(mockReqSuccess, mockResSuccess);
  t.assert(sessionDestroyed, 'Kullanıcı silindiğinde session sonlandırıldı');
  t.assertEqual(cookieCleared, 'connect.sid', 'Oturum çerezi temizlendi');
  t.assert(redirectedTo.includes('account_deleted=1'), 'Ana sayfaya yönlendirildi');

  // 4. Veritabanından tam temizlik kontrolü (Cascade & Data Clean)
  checkUser = await User.findById(user1Id);
  t.assertEqual(checkUser, null, 'Kullanıcı veritabanından tamamen silindi');

  const checkListing = await Listing.findById(listing.id);
  t.assertEqual(checkListing, null, 'Kullanıcının ilanı da veritabanından silindi');

  const checkCv = await Career.getProfile(user1Id);
  t.assertEqual(checkCv, null, 'Kullanıcının CV profili de silindi');

  const checkNotifications = await Notification.getByUserId(user1Id);
  t.assertEqual(checkNotifications.length, 0, 'Kullanıcının bildirimleri silindi');

  // 5. Şifresiz (Google/OAuth) hesap silme testi
  const oauthUserId = await User.create({
    email: 'oauth@test.com',
    password_hash: '$2a$10$social_auth_dummy_hash_for_test',
    full_name: 'Google Kullanıcısı',
    has_password: 0
  });

  // Onaysız silme denemesi
  flashMessages = [];
  const mockOAuthReqFail = {
    session: { userId: oauthUserId },
    body: { confirmation: 'HAYIR' },
    flash: (type, msg) => { flashMessages.push({ type, msg }); }
  };
  await profileController.deleteAccount(mockOAuthReqFail, mockRes);
  t.assert(flashMessages.some(f => f.msg === 'flash.delete_confirmation_required'), 'SIL yazılmadığında engellendi');

  // SIL onayı ile silme
  const mockOAuthReqSuccess = {
    session: {
      userId: oauthUserId,
      destroy: (cb) => { if (cb) cb(null); }
    },
    body: { confirmation: 'SIL' },
    flash: () => {}
  };
  await profileController.deleteAccount(mockOAuthReqSuccess, mockResSuccess);
  const checkOAuthUser = await User.findById(oauthUserId);
  t.assertEqual(checkOAuthUser, null, 'OAuth kullanıcısı SIL onayı ile başarıyla silindi');

  // 6. Admin Panelinden Kullanıcı Silme Testi
  const victimUserId = await User.create({
    email: 'admin_tarafindan_silinecek@test.com',
    password: 'Password123!',
    full_name: 'Kurban Kullanıcı'
  });

  // Admin kendisini silmeyi denerse engellenmeli
  flashMessages = [];
  const adminReqSelf = {
    params: { id: user2Id },
    session: { userId: user2Id, userRole: 'admin' },
    flash: (type, msg) => { flashMessages.push({ type, msg }); }
  };
  await adminController.deleteUser(adminReqSelf, mockRes);
  t.assert(flashMessages.some(f => f.msg === 'flash.cannot_delete_self'), 'Admin kendi hesabını panelden silemez');

  // Admin başka bir kullanıcıyı siler
  flashMessages = [];
  const adminReqTarget = {
    params: { id: victimUserId },
    session: { userId: user2Id, userRole: 'admin' },
    flash: (type, msg) => { flashMessages.push({ type, msg }); },
    get: () => '/admin/users'
  };
  await adminController.deleteUser(adminReqTarget, mockRes);
  t.assert(flashMessages.some(f => f.msg === 'flash.user_deleted_success'), 'Admin silme başarılı flash mesajı verdi');

  const checkVictim = await User.findById(victimUserId);
  t.assertEqual(checkVictim, null, 'Admin tarafından silinen kullanıcı tamamen yok edildi');

  // 7. Profile edit görünümünde silme kartı render testi
  const editPageHtml = await t.render('profile/edit.ejs', {
    user: { id: user2Id, full_name: 'Test User', email: 'test@test.com', has_password: 1 },
    hasPassword: true,
    csrfToken: 'test-csrf-token',
    lang: 'tr'
  });
  t.assert(editPageHtml.includes('deleteAccountModal'), 'Hesap silme modalı edit.ejs içinde render edildi');
  t.assert(editPageHtml.includes('/profile/delete'), 'Form hedefi /profile/delete olarak ayarlandı');
});
