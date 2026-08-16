const t = require('./helpers');
const Notification = require(t.rootDir + '/models/Notification');
const Listing = require(t.rootDir + '/models/Listing');
const User = require(t.rootDir + '/models/User');
const Warning = require(t.rootDir + '/models/Warning');
const adminController = require(t.rootDir + '/controllers/adminController');
const listingController = require(t.rootDir + '/controllers/listingController');

const makeReq = (options = {}) => ({
  params: {},
  body: {},
  query: {},
  session: {},
  headers: {},
  get: () => '',
  flash: () => {},
  ...options
});

const makeRes = () => {
  const res = {
    _status: 200,
    _json: null,
    _redirect: null,
    locals: t.baseLocals(),
    status(code) { this._status = code; return this; },
    json(data) { this._json = data; return this; },
    redirect(url) { this._redirect = url; return this; }
  };
  return res;
};

t.run('Bildirim Sistemi & Favori/Uyarı Bildirimleri', async (db) => {
  const seller = t.makeUser(db, 'seller_notif@test.local', 'İlan Sahibi');
  const buyer = t.makeUser(db, 'buyer_notif@test.local', 'Alıcı Kullanıcı');
  const admin = t.makeUser(db, 'admin_notif@test.local', 'Yönetici', 'admin');

  const listing = await Listing.create({
    user_id: seller,
    category_id: 101,
    title: 'Girne Merkezde Lüks Villa',
    slug: 'girne-merkezde-luks-villa-notif',
    description: 'Deniz manzaralı harika bir villa satışta.',
    price: 350000,
    currency: 'GBP',
    city: 'Girne',
    district: 'Merkez',
    status: 'active'
  });

  // 1. Favorileme Bildirimi
  const initialUnread = await Notification.getUnreadCount(seller);
  t.assertEqual(initialUnread, 0, 'Başlangıçta okunmamış bildirim sayısı 0');

  // Buyer favorites seller's listing via listingController.toggleFavorite
  const favReq = makeReq({
    session: { userId: buyer },
    params: { id: String(listing.id) }
  });
  const favRes = makeRes();

  await listingController.toggleFavorite(favReq, favRes);
  t.assertEqual(favRes._json.success, true, 'Favori işlemi başarılı');
  t.assertEqual(favRes._json.favorited, true, 'İlan favoriye eklendi');

  // Check seller's notifications
  const sellerUnread = await Notification.getUnreadCount(seller);
  t.assertEqual(sellerUnread, 1, 'İlan sahibine 1 okunmamış bildirim ulaştı');

  const sellerNotifications = await Notification.getByUserId(seller);
  t.assertEqual(sellerNotifications.length, 1, 'İlan sahibinin 1 bildirimi var');
  t.assertEqual(sellerNotifications[0].type, 'favorite', 'Bildirim türü favorite');
  t.assert(sellerNotifications[0].message.includes('Girne Merkezde Lüks Villa'), 'Bildirim mesajı ilan başlığını içeriyor');
  t.assertEqual(sellerNotifications[0].link_url, `/listings/${listing.slug}`, 'Bildirim linki ilan URL\'ine yönlendiriyor');
  t.assertEqual(sellerNotifications[0].is_read, 0, 'Bildirim henüz okunmadı');

  // Self-favoriting should not create a notification
  const selfFavReq = makeReq({
    session: { userId: seller },
    params: { id: String(listing.id) }
  });
  const selfFavRes = makeRes();
  await listingController.toggleFavorite(selfFavReq, selfFavRes);
  const sellerUnreadAfterSelf = await Notification.getUnreadCount(seller);
  t.assertEqual(sellerUnreadAfterSelf, 1, 'Kendi ilanını favorileyince yeni bildirim oluşmadı');

  // 2. Sistem / Moderasyon Uyarı Bildirimi
  const warnReq = makeReq({
    session: { userId: admin },
    params: { id: String(buyer) },
    body: {
      reason: 'inappropriate',
      note: 'İlan açıklamasında uygunsuz kelimeler tespit edildi.'
    },
    get: () => '/admin/users'
  });
  const warnRes = makeRes();

  await adminController.issueWarning(warnReq, warnRes);

  const buyerUnread = await Notification.getUnreadCount(buyer);
  t.assertEqual(buyerUnread, 1, 'Uyarı alan kullanıcıya sistem bildirimi ulaştı');

  const buyerNotifications = await Notification.getByUserId(buyer);
  t.assertEqual(buyerNotifications.length, 1, 'Kullanıcının 1 bildirimi var');
  t.assertEqual(buyerNotifications[0].type, 'warning', 'Bildirim türü warning');
  t.assert(buyerNotifications[0].message.includes('Uygunsuz İçerik') || buyerNotifications[0].message.includes('inappropriate'), 'Bildirimde uyarı gerekçesi belirtildi');
  t.assert(buyerNotifications[0].message.includes('uygunsuz kelimeler'), 'Bildirimde yönetici notu yer alıyor');
  t.assert(buyerNotifications[0].message.includes('2'), 'Askıya alınmaya kalan hak (2) bildirildi');

  // 3. Bildirimi Okundu İşaretleme & Yönlendirme
  const notifId = sellerNotifications[0].id;
  await Notification.markAsRead(notifId, seller);
  const sellerUnreadAfterRead = await Notification.getUnreadCount(seller);
  t.assertEqual(sellerUnreadAfterRead, 0, 'Okundu işaretlendikten sonra okunmamış bildirim 0 oldu');

  // 4. Tümünü Okundu İşaretleme
  await Notification.create({
    user_id: seller,
    type: 'system',
    title: 'Sistem Duyurusu 1',
    message: 'Test mesajı 1'
  });
  await Notification.create({
    user_id: seller,
    type: 'system',
    title: 'Sistem Duyurusu 2',
    message: 'Test mesajı 2'
  });
  t.assertEqual(await Notification.getUnreadCount(seller), 2, '2 yeni okunmamış bildirim var');

  await Notification.markAllAsRead(seller);
  t.assertEqual(await Notification.getUnreadCount(seller), 0, 'Tümünü okundu işaretleyince okunmamış 0 oldu');

  // 5. Bildirim Silme
  const sellerAll = await Notification.getByUserId(seller);
  t.assertEqual(sellerAll.length, 3, 'İlan sahibinin toplam 3 bildirimi var');
  await Notification.delete(sellerAll[0].id, seller);
  const sellerRemaining = await Notification.getByUserId(seller);
  t.assertEqual(sellerRemaining.length, 2, '1 bildirim silindikten sonra 2 bildirim kaldı');

  // 6. İlan Sayfası Üzerinden Doğrudan İlan Uyarısı / Düzeltme Bildirimi
  const listingNoticeReq = makeReq({
    session: { userId: admin },
    params: { id: String(listing.id) },
    body: {
      title: 'Hatalı Fiyat Bildirimi',
      message: 'Fiyat bilgisi yıllık olarak girilmiş, lütfen aylık olarak güncelleyiniz.'
    },
    headers: { accept: 'application/json' },
    xhr: true
  });
  const listingNoticeRes = makeRes();

  await adminController.sendListingNotice(listingNoticeReq, listingNoticeRes);
  t.assertEqual(listingNoticeRes._json.success, true, 'İlan düzeltme bildirimi isteği başarılı');

  const sellerLatestNotifs = await Notification.getByUserId(seller);
  const directNotice = sellerLatestNotifs[0];
  t.assertEqual(directNotice.title, 'Hatalı Fiyat Bildirimi', 'Bildirim başlığı doğru');
  t.assert(directNotice.message.includes('yıllık olarak girilmiş'), 'Bildirimde yönetici düzeltme notu yer alıyor');
  t.assertEqual(directNotice.link_url, `/listings/${listing.slug}/edit`, 'Bildirim ilan düzenleme sayfasına yönlendiriyor');

  // 7. View Rendering
  const renderedHtml = await t.render('notifications/index.ejs', {
    notifications: sellerLatestNotifs,
    filter: 'all',
    unreadCount: 1,
    pagination: { page: 1, totalItems: sellerLatestNotifs.length, totalPages: 1 },
    title: 'Bildirimler'
  });

  t.assert(renderedHtml.includes('Bildirimler'), 'notifications/index.ejs başlığı render ediyor');
  t.assert(renderedHtml.includes('Hatalı Fiyat Bildirimi'), 'Bildirim listesi kartları render ediyor');
  t.assert(renderedHtml.includes('Tümü'), 'Tümü sekmesi render ediliyor');
});
