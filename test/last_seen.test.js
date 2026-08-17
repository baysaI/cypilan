const t = require('./helpers');

const User = require(t.rootDir + '/models/User');
const Listing = require(t.rootDir + '/models/Listing');
const { setUserLocal, LAST_SEEN_TOUCH_INTERVAL_MS } = require(t.rootDir + '/middlewares/auth');

// Minutes ago, written the way SQLite's CURRENT_TIMESTAMP writes it (UTC, no
// zone marker) so the helpers parse it exactly as they parse a real row.
const minutesAgo = (minutes) =>
  new Date(Date.now() - minutes * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');

t.run('Son aktiflik durumu', async (db) => {
  const seller = t.makeUser(db, 'seller@test.local', 'Satıcı');
  const buyer = t.makeUser(db, 'buyer@test.local', 'Alıcı');

  // --- Migrasyon
  const userColumns = db.pragma('table_info(users)').map((column) => column.name);
  t.assert(userColumns.includes('last_seen_at'), 'users.last_seen_at kolonu şemada mevcut');

  // --- Yazma: browsing hesap duzenlemesi degil, updated_at kaymamali
  const before = db.prepare('SELECT last_seen_at, updated_at FROM users WHERE id = ?').get([seller]);
  t.assertEqual(before.last_seen_at, null, 'Yeni hesapta son aktiflik boş');

  db.prepare("UPDATE users SET updated_at = '2020-01-01 00:00:00' WHERE id = ?").run([seller]);
  await User.touchLastSeen(seller);

  const after = db.prepare('SELECT last_seen_at, updated_at FROM users WHERE id = ?').get([seller]);
  t.assert(Boolean(after.last_seen_at), 'touchLastSeen zaman damgasını yazıyor');
  t.assertEqual(after.updated_at, '2020-01-01 00:00:00', 'touchLastSeen updated_at alanına dokunmuyor');

  // --- Kovalar
  const unknown = t.helpers.lastSeenState(null);
  t.assert(!unknown.known && !unknown.online, 'Kaydı olmayan hesap "bilinmiyor" olarak sınıflanıyor');
  t.assert(!t.helpers.lastSeenState('bozuk-tarih').known, 'Geçersiz tarih "bilinmiyor" sayılıyor');

  const justNow = t.helpers.lastSeenState(minutesAgo(1));
  t.assert(justNow.online && justNow.today, '1 dakika önce = çevrimiçi');

  const edge = t.helpers.lastSeenState(minutesAgo(t.helpers.ONLINE_WINDOW_MINUTES + 1));
  t.assert(!edge.online && edge.today, 'Çevrimiçi penceresi dışında ama aynı gün içinde');

  const yesterday = t.helpers.lastSeenState(minutesAgo(30 * 60));
  t.assert(yesterday.known && !yesterday.online && !yesterday.today, '30 saat önce = bugün değil');

  // Etiketi yazan pencere ile damgayi yazan aralik ayni olmali, yoksa "cevrimici"
  // kendi cozunurlugunden daha eski bir gercegi anlatir.
  t.assertEqual(
    t.helpers.ONLINE_WINDOW_MINUTES * 60 * 1000,
    LAST_SEEN_TOUCH_INTERVAL_MS,
    'Çevrimiçi penceresi ile yazma aralığı aynı'
  );

  // --- Middleware kisitlamasi: her istekte UPDATE atmamali
  const session = { userId: buyer };
  const callMiddleware = () => new Promise((resolve, reject) => {
    setUserLocal({ session, headers: {}, xhr: false }, { locals: {} }, (error) => (error ? reject(error) : resolve()));
  });

  await callMiddleware();
  const firstTouch = db.prepare('SELECT last_seen_at FROM users WHERE id = ?').get([buyer]).last_seen_at;
  t.assert(Boolean(firstTouch), 'İlk istek son aktifliği kaydediyor');
  t.assert(Boolean(session.lastSeenTouchedAt), 'Yazma zamanı oturumda tutuluyor');

  db.prepare("UPDATE users SET last_seen_at = '2021-05-05 05:05:05' WHERE id = ?").run([buyer]);
  await callMiddleware();
  t.assertEqual(
    db.prepare('SELECT last_seen_at FROM users WHERE id = ?').get([buyer]).last_seen_at,
    '2021-05-05 05:05:05',
    'Aralık dolmadan ikinci istek tekrar yazmıyor'
  );

  session.lastSeenTouchedAt = Date.now() - LAST_SEEN_TOUCH_INTERVAL_MS - 1000;
  await callMiddleware();
  t.assert(
    db.prepare('SELECT last_seen_at FROM users WHERE id = ?').get([buyer]).last_seen_at !== '2021-05-05 05:05:05',
    'Aralık dolduğunda yeniden yazıyor'
  );

  // --- Ilan detayinda saticinin durumu
  db.prepare('UPDATE users SET last_seen_at = ? WHERE id = ?').run([minutesAgo(2), seller]);

  await Listing.create({
    user_id: seller, category_id: 102, title: 'Kiralık Daire', slug: 'kiralik-daire-son-aktiflik',
    description: 'Deniz manzaralı geniş daire.', price: 15000, status: 'active', city: 'Girne'
  });

  const detail = await Listing.findDetailBySlug('kiralik-daire-son-aktiflik');
  t.assert(Boolean(detail.seller_last_seen), 'findDetailBySlug satıcının son aktifliğini taşıyor');

  const showLocals = {
    listing: detail,
    isFavorited: false,
    sellerRating: { total: 0, average: 0, distribution: {} },
    bidSummary: { total: 0, best_amount: null },
    openServiceRequests: {},
    offeredServices: ['assurance']
  };

  const onlineHtml = await t.render('listings/show.ejs', showLocals);
  t.assert(onlineHtml.includes('Şu anda çevrimiçi'), 'İlan sayfası satıcıyı çevrimiçi gösteriyor');

  db.prepare('UPDATE users SET last_seen_at = ? WHERE id = ?').run([minutesAgo(4 * 24 * 60), seller]);
  showLocals.listing = await Listing.findDetailBySlug('kiralik-daire-son-aktiflik');
  const staleHtml = await t.render('listings/show.ejs', showLocals);
  t.assert(staleHtml.includes('4 gün önce aktif oldu'), 'İlan sayfası kaba geçmiş zamanı gösteriyor');
  t.assert(!staleHtml.includes('Şu anda çevrimiçi'), 'Eski aktiflik çevrimiçi gibi görünmüyor');

  // Kesin dakika ziyaretciye sizmamali
  t.assert(
    !staleHtml.includes(String(detail.seller_last_seen)),
    'Tam zaman damgası ilan sayfasına basılmıyor'
  );

  // --- Admin tablosu tam zamani gosteriyor
  const adminUsers = await User.findAll(1, 20, {});
  t.assert(
    adminUsers.data.every((row) => Object.prototype.hasOwnProperty.call(row, 'last_seen_at')),
    'User.findAll son aktifliği seçiyor'
  );

  const adminHtml = await t.render('admin/users.ejs', {
    pagination: { page: 1, totalItems: adminUsers.total, totalPages: adminUsers.pages },
    filters: {},
    users: adminUsers.data,
    currentUser: { id: 0 },
    warningCounts: {},
    warningHistory: {},
    suspensionThreshold: 3,
    reportReasons: ['spam', 'other'],
    pendingReports: 0
  });

  t.assert(adminHtml.includes('Son Aktiflik'), 'Admin tablosunda Son Aktiflik kolonu var');
  t.assert(
    adminHtml.includes(t.helpers.formatDateTime(minutesAgo(4 * 24 * 60), 'tr')),
    'Admin tablosu tam tarih-saati (tooltip) basıyor'
  );

  const langsResolve = ['tr', 'en', 'el', 'ru', 'fa'].every((lang) =>
    ['user.last_seen_online', 'user.last_seen_today', 'user.last_seen_ago']
      .every((key) => t.translate(key, lang) !== key)
  );
  t.assert(langsResolve, 'user.last_seen_* anahtarları 5 dilde çözülüyor');
});
