const t = require('./helpers');

const Warning = require(t.rootDir + '/models/Warning');
const Stats = require(t.rootDir + '/models/Stats');
const Listing = require(t.rootDir + '/models/Listing');

t.run('Kademeli uyarı ve performans paneli', async (db) => {
  const admin = t.makeUser(db, 'admin@test.local', 'Admin', 'admin');
  const seller = t.makeUser(db, 'seller@test.local', 'Satıcı');
  const buyer = t.makeUser(db, 'buyer@test.local', 'Alıcı');

  // --- Kademeli uyari: ucuncude aski
  let result = await Warning.issue({ user_id: seller, issued_by: admin, reason: 'spam', note: 'İlk' });
  t.assert(!result.suspended, '1. uyarıda hesap açık kalıyor');

  result = await Warning.issue({ user_id: seller, issued_by: admin, reason: 'wrong_category' });
  t.assert(!result.suspended, '2. uyarıda hesap hâlâ açık');
  t.assertEqual(Warning.remainingBeforeSuspension(result.count), 1, 'Kalan uyarı hakkı doğru bildiriliyor');

  result = await Warning.issue({ user_id: seller, issued_by: admin, reason: 'fraud' });
  t.assert(result.suspended, '3. uyarıda hesap otomatik askıya alınıyor');

  let user = db.prepare('SELECT is_active FROM users WHERE id = ?').get([seller]);
  t.assertEqual(Number(user.is_active), 0, 'Askı veritabanına gerçekten yazılıyor');

  // --- Uyari kaldirilinca aski da kalkmali
  const warnings = await Warning.forUser(seller);
  await Warning.revoke(warnings[0].id);
  user = db.prepare('SELECT is_active FROM users WHERE id = ?').get([seller]);
  t.assertEqual(Number(user.is_active), 1, 'Uyarı kaldırılınca askı da kalkıyor (yanlış karar geri alınabiliyor)');
  t.assertEqual(await Warning.countActive(seller), 2, 'Aktif uyarı sayısı güncellendi');

  // --- Panel istatistikleri
  const listingA = await Listing.create({
    user_id: seller, category_id: 102, title: 'Daire', slug: 'daire-1',
    description: 'x', price: 30000, status: 'active', city: 'Girne'
  });
  const listingB = await Listing.create({
    user_id: seller, category_id: 101, title: 'Villa', slug: 'villa-1',
    description: 'x', price: 500000, status: 'sold', city: 'Girne'
  });

  db.prepare('UPDATE listings SET views_count = 300 WHERE id = ?').run([listingA.id]);
  db.prepare('UPDATE listings SET views_count = 120 WHERE id = ?').run([listingB.id]);
  db.prepare('INSERT INTO favorites (user_id, listing_id) VALUES (?, ?)').run([buyer, listingA.id]);
  db.prepare("INSERT INTO messages (sender_id, receiver_id, listing_id, content) VALUES (?, ?, ?, 'merhaba')")
    .run([buyer, seller, listingA.id]);

  const overview = await Stats.overview(seller);
  t.assertEqual(overview.listings.views, 420, 'Toplam görüntülenme doğru toplanıyor');
  t.assert(overview.listings.active === 1 && overview.listings.sold === 1, 'Durum sayaçları doğru');
  t.assertEqual(overview.favorites, 1, 'Favori sayısı doğru');
  t.assertEqual(overview.conversations, 1, 'İletişime geçen kişi sayısı doğru');

  // Az veriyle uydurma oran uretmemeli
  t.assertEqual(overview.winRate, null, '3 teklif altında kazanma oranı üretilmiyor');

  const perListing = await Stats.perListing(seller);
  t.assertEqual(perListing[0].views_count, 300, 'İlan bazında performans en çok görüntülenenden sıralı');
  t.assert(
    perListing[0].favorite_count === 1 && perListing[0].enquiry_count === 1,
    'İlan bazında favori ve iletişim sayaçları doğru'
  );

  const activity = await Stats.recentActivity(seller);
  t.assertEqual(activity.length, Stats.RECENT_WINDOW_DAYS, 'Aktivite serisi boşluksuz üretiliyor');

  const benchmark = await Stats.benchmark(seller);
  t.assertEqual(benchmark.mine, 300, 'Piyasa karşılaştırması hesaplanıyor');

  const emptyUser = t.makeUser(db, 'empty@test.local', 'Boş');
  const emptyBenchmark = await Stats.benchmark(emptyUser);
  t.assert(
    emptyBenchmark.difference === null || emptyBenchmark.market > 0,
    'Karşılaştıracak veri yokken yüzde uydurulmuyor'
  );

  // --- Sablonlar
  const panelHtml = await t.render('panel/index.ejs', {
    overview, listings: perListing, activity, activityPeak: 2, benchmark,
    rating: { total: 0, average: 0, distribution: {} },
    pendingBids: 0, pendingApplications: 0, isProfessional: false,
    windowDays: Stats.RECENT_WINDOW_DAYS, title: 'test',
    user: { id: seller, name: 'Satıcı' }
  });
  t.assert(panelHtml.includes('420'), 'panel/index.ejs toplam görüntülenmeyi basıyor');

  const activeWarnings = (await Warning.forUser(seller)).filter((w) => Number(w.is_active) === 1);
  const listingsHtml = await t.render('profile/listings.ejs', {
    listings: perListing, warnings: activeWarnings,
    warningsRemaining: Warning.remainingBeforeSuspension(activeWarnings.length),
    suspensionThreshold: Warning.SUSPENSION_THRESHOLD, title: 'test',
    user: { id: seller, name: 'Satıcı' }
  });
  t.assert(listingsHtml.includes('2/3 uyarı'), 'Kullanıcı kendi uyarı durumunu görüyor');

  const allLangs = ['tr', 'en', 'el', 'ru', 'fa'].every((lang) =>
    ['warnings.title', 'warnings.notify_suspended', 'panel.title', 'students.title']
      .every((key) => t.translate(key, lang) !== key)
  );
  t.assert(allLangs, 'warnings.* / panel.* / students.* 5 dilde çözülüyor');

  // --- Bildirimdeki gerekce etiketi
  // Uyari bildirimi 'reports.reason_*' anahtarini ariyordu; o namespace hic
  // olmadigi icin metin ham enum degerine dusuyor ve kullaniciya iceriginin
  // "other" gerekcesiyle uyari aldigi soyleniyordu.
  const reasonsResolve = ['wrong_category', 'spam', 'fraud', 'other', 'harassment'].every((reason) =>
    ['tr', 'en', 'el', 'ru', 'fa'].every((lang) =>
      t.translate('report_modal.reasons.' + reason, lang) !== 'report_modal.reasons.' + reason
    )
  );
  t.assert(reasonsResolve, 'Uyarı gerekçeleri 5 dilde çözülüyor');

  const warnMessage = t.translate('notifications.warning_message', 'tr', {
    reason: t.translate('report_modal.reasons.other', 'tr'),
    note: ' ' + t.translate('notifications.warning_note', 'tr', { note: 'deneme' }),
    remaining: 2
  });
  t.assert(
    warnMessage.includes('Diğer') && !warnMessage.includes('other'),
    'Bildirim metni çevrilmiş gerekçeyi taşıyor, ham enum değerini değil'
  );
  t.assert(warnMessage.includes('(Not: deneme)'), 'Yönetici notu çevrilebilir kalıpla ekleniyor');

  // --- Kalici silme: kaldirmadan farki gecmiste iz birakmamasi
  const standing = (await Warning.forUser(seller)).filter((w) => Number(w.is_active) === 1);
  const removed = await Warning.remove(standing[0].id);
  t.assert(removed && removed.id === standing[0].id, 'Warning.remove silinen kaydı döndürüyor (bildirim bunu kullanıyor)');
  t.assertEqual(await Warning.countActive(seller), 1, 'Kalıcı silme aktif uyarı sayısını düşürüyor');
  t.assertEqual(
    (await Warning.forUser(seller)).some((w) => w.id === standing[0].id),
    false,
    'Silinen kayıt geçmişte de görünmüyor'
  );
  t.assertEqual(await Warning.remove(999999), null, 'Olmayan uyarıyı silmek hata atmıyor');

  // Askiya sebep olan kayit silinince hesap da geri acilmali
  await Warning.issue({ user_id: seller, issued_by: admin, reason: 'spam' });
  const third = await Warning.issue({ user_id: seller, issued_by: admin, reason: 'inappropriate' });
  t.assert(third.suspended, 'Silme sonrası yeniden 3. uyarıda askı işliyor');

  const lastStanding = (await Warning.forUser(seller)).filter((w) => Number(w.is_active) === 1)[0];
  await Warning.remove(lastStanding.id);
  user = db.prepare('SELECT is_active FROM users WHERE id = ?').get([seller]);
  t.assertEqual(Number(user.is_active), 1, 'Askıya sebep olan kayıt silinince askı da kalkıyor');

  // --- Admin panelinde uyari gecmisi
  const history = await Warning.forUser(seller);
  const adminUsersHtml = await t.render('admin/users.ejs', {
    pagination: { page: 1, totalItems: 1, totalPages: 1 },
    filters: {},
    users: [{
      id: seller, email: 'seller@test.local', full_name: 'Satıcı', role: 'user',
      is_active: 1, is_verified: 1, created_at: '2026-08-01 10:00:00', listing_count: 2
    }],
    currentUser: { id: admin },
    warningCounts: { [seller]: history.filter((w) => Number(w.is_active) === 1).length },
    warningHistory: { [seller]: history },
    suspensionThreshold: Warning.SUSPENSION_THRESHOLD,
    reportReasons: ['wrong_category', 'spam', 'fraud', 'other'],
    pendingReports: 0
  });

  t.assert(adminUsersHtml.includes('Uyarı Geçmişi'), 'Admin paneli uyarı geçmişi bölümünü basıyor');
  t.assert(adminUsersHtml.includes('Admin'), 'Uyarıyı kimin verdiği görünüyor');
  t.assert(
    history.some((w) => adminUsersHtml.includes(`/admin/uyari/${w.id}/sil`)),
    'Her kayıt için kalıcı silme aksiyonu var'
  );
  t.assert(
    history.filter((w) => Number(w.is_active) === 1)
      .every((w) => adminUsersHtml.includes(`/admin/uyari/${w.id}/kaldir`)),
    'Aktif kayıtlar için kaldırma aksiyonu var'
  );
  t.assert(
    history.filter((w) => Number(w.is_active) === 0)
      .every((w) => !adminUsersHtml.includes(`/admin/uyari/${w.id}/kaldir`)),
    'Kaldırılmış kayıtta tekrar kaldırma butonu çıkmıyor'
  );
});
