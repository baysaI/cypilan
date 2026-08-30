const t = require('./helpers');

const UserBadge = require(t.rootDir + '/models/UserBadge');
const catalog = require(t.rootDir + '/config/userBadges');

const PAST = '2020-01-01 00:00:00';

t.run('Kullanıcı rozetleri', async (db) => {
  const admin = t.makeUser(db, 'admin@test.local', 'Admin', 'admin');
  const seller = t.makeUser(db, 'satici@test.local', 'Ayşe Satıcı');
  const agent = t.makeUser(db, 'emlakci@test.local', 'Mehmet Emlakçı', 'agent');

  // --- Katalog tutarli olmali
  const keys = catalog.BADGES.map((b) => b.key);
  t.assertEqual(new Set(keys).size, keys.length, 'Katalogda tekrar eden rozet anahtarı yok');
  t.assert(catalog.isKnownKey('verified_seller'), 'Bilinen anahtar tanınıyor');
  t.assert(!catalog.isKnownKey('uydurma_rozet'), 'Bilinmeyen anahtar tanınmıyor');
  t.assert(
    catalog.BADGES.every((b) => b.icon && b.variant),
    'Her rozetin ikonu ve rengi tanımlı'
  );

  // --- Verme
  t.assert(UserBadge.forUser(seller).length === 0, 'Yeni üyenin rozeti yok');

  const granted = UserBadge.grant(seller, 'verified_seller', { grantedBy: admin, note: 'Kimlik doğrulandı' });
  t.assert(granted && granted.isNew, 'İlk verişte yeni rozet olarak işaretleniyor');

  const sellerBadges = UserBadge.forUser(seller);
  t.assertEqual(sellerBadges.length, 1, 'Rozet üyenin üzerinde görünüyor');
  t.assertEqual(sellerBadges[0].badge_key, 'verified_seller', 'Doğru rozet verildi');
  t.assertEqual(sellerBadges[0].note, 'Kimlik doğrulandı', 'Yönetici notu saklanıyor');
  t.assertEqual(sellerBadges[0].expires_at, null, 'Doğrulama rozeti kalıcı, bitiş tarihi yok');

  // --- Bilinmeyen anahtar yazilmamali
  const bogus = UserBadge.grant(seller, 'uydurma_rozet', { grantedBy: admin });
  t.assertEqual(bogus, null, 'Bilinmeyen rozet reddediliyor');
  t.assertEqual(UserBadge.forUser(seller).length, 1, 'Reddedilen rozet veritabanına yazılmıyor');

  // --- Donemsel unvan kendiliginden dusmeli
  const monthly = UserBadge.grant(agent, 'agent_of_month', { grantedBy: admin });
  t.assert(monthly.expiresAt, 'Dönemsel unvana varsayılan bitiş tarihi konuyor');
  t.assertEqual(UserBadge.forUser(agent).length, 1, 'Unvan şu an görünüyor');

  const days = Math.round(
    (Date.parse(monthly.expiresAt.replace(' ', 'T') + 'Z') - Date.now()) / 86400000
  );
  t.assertEqual(days, 30, 'Ayın Emlakçısı varsayılan olarak 30 gün sürüyor');

  // --- Ayni rozeti tekrar vermek uzatma, kopyalama degil
  const again = UserBadge.grant(agent, 'agent_of_month', { grantedBy: admin, note: 'Şubat ayı' });
  t.assert(!again.isNew, 'İkinci veriş uzatma olarak işaretleniyor');
  t.assertEqual(UserBadge.forUser(agent).length, 1, 'Profilde iki aynı etiket oluşmuyor');
  t.assertEqual(UserBadge.forUser(agent)[0].note, 'Şubat ayı', 'Not güncelleniyor');

  // --- Suresi dolan rozet ziyaretciye gorunmemeli
  UserBadge.grant(seller, 'seller_of_month', { grantedBy: admin, expiresAt: PAST });
  const visible = UserBadge.forUser(seller).map((b) => b.badge_key);
  t.assert(!visible.includes('seller_of_month'), 'Süresi dolan unvan ziyaretçiye görünmüyor');
  t.assert(visible.includes('verified_seller'), 'Kalıcı rozet yerinde duruyor');

  // Yonetici ekraninda ise gorunmeli: bir sonraki kazanana vermek icin
  // yoneticinin bakacagi yer tam da orasi.
  const adminRows = UserBadge.adminListForUser(seller);
  const expiredRow = adminRows.find((r) => r.badge_key === 'seller_of_month');
  t.assert(Boolean(expiredRow), 'Süresi dolan unvan yönetici ekranında duruyor');
  t.assertEqual(expiredRow.is_expired, 1, 'Süresi dolduğu işaretli');
  t.assertEqual(adminRows[0].is_expired, 0, 'Geçerli rozetler listenin başında');
  t.assertEqual(
    adminRows.find((r) => r.badge_key === 'verified_seller').granted_by_name, 'Admin',
    'Rozeti kimin verdiği kaydediliyor'
  );

  // --- Acikca kalici verilebilmeli
  UserBadge.grant(agent, 'top_rated', { grantedBy: admin, expiresAt: null });
  const topRated = UserBadge.forUser(agent).find((b) => b.badge_key === 'top_rated');
  t.assertEqual(topRated.expires_at, null, 'Süresiz verilmek istenen rozete tarih konmuyor');

  // --- Toplu okuma
  const many = UserBadge.forUsers([seller, agent]);
  t.assertEqual(many.get(seller).length, 1, 'Toplu okuma süresi dolanları getirmiyor');
  t.assertEqual(many.get(agent).length, 2, 'Toplu okuma her üyenin rozetlerini ayırıyor');
  t.assertEqual(UserBadge.forUsers([]).size, 0, 'Boş liste sorgu üretmiyor (IN () sözdizimi hatası)');
  t.assertEqual(UserBadge.forUsers([99999]).size, 0, 'Olmayan üye boş dönüyor');

  // --- Unvani su an kim tasiyor
  const holders = UserBadge.holdersOf('agent_of_month');
  t.assertEqual(holders.length, 1, 'Dönemsel unvanı taşıyan bulunuyor');
  t.assertEqual(holders[0].user_id, agent, 'Doğru üye taşıyor');
  t.assertEqual(UserBadge.holdersOf('seller_of_month').length, 0, 'Süresi dolan unvanın taşıyıcısı yok');

  // --- Geri alma
  t.assert(UserBadge.revoke(agent, 'top_rated'), 'Rozet kaldırılıyor');
  t.assert(!UserBadge.revoke(agent, 'top_rated'), 'Olmayan rozeti kaldırmak false dönüyor');
  t.assertEqual(UserBadge.countActive(agent), 1, 'Kaldırma sonrası sayı doğru');

  // --- Sablonlar
  const badgeHtml = await t.render('partials/userBadges.ejs', {
    badges: UserBadge.forUser(seller)
  });
  t.assert(badgeHtml.includes('Onaylı Satıcı'), 'Rozet adı basılıyor');
  t.assert(!badgeHtml.includes('Ayın Satıcısı'), 'Süresi dolan rozet basılmıyor');

  const emptyHtml = await t.render('partials/userBadges.ejs', { badges: [] });
  t.assertEqual(emptyHtml.trim(), '', 'Rozeti olmayan üyede hiçbir şey basılmıyor');

  // Katalogdan cikarilmis bir anahtar profili dusurmemeli
  const strayHtml = await t.render('partials/userBadges.ejs', {
    badges: [{ badge_key: 'kaldirilmis_rozet', note: null }]
  });
  t.assert(strayHtml.includes('badge'), 'Tanınmayan anahtar sayfayı düşürmüyor, nötr basılıyor');

  const adminHtml = await t.render('admin/userBadges.ejs', {
    targetUser: { id: seller, full_name: 'Ayşe Satıcı', company_name: null, email: 'satici@test.local' },
    badgeRows: UserBadge.adminListForUser(seller),
    catalog: catalog.BADGES,
    holders: { agent_of_month: UserBadge.holdersOf('agent_of_month') },
    title: 'test'
  });
  t.assert(adminHtml.includes('/admin/users/' + seller + '/rozetler'), 'Yönetici ekranında form var');
  t.assert(adminHtml.includes('Onaylı Satıcı'), 'Rozet seçeneği listeleniyor');
  t.assert(adminHtml.includes('Süresi doldu'), 'Süresi dolan rozet yöneticiye belli ediliyor');
  t.assert(adminHtml.includes('Mehmet Emlakçı'), 'Dönemsel unvanı şu an kimin taşıdığı görünüyor');

  // --- Diller
  const allLangs = ['tr', 'en', 'el', 'ru', 'fa'].every((lang) =>
    catalog.BADGES.every((b) => t.translate(catalog.translationKey(b.key), lang) !== catalog.translationKey(b.key))
  );
  t.assert(allLangs, 'Her rozetin adı 5 dilde çözülüyor');

  const notifLangs = ['tr', 'en', 'el', 'ru', 'fa'].every((lang) =>
    ['notifications.badge_granted_title', 'notifications.badge_granted_msg', 'notifications.badge_extended_msg']
      .every((key) => t.translate(key, lang) !== key)
  );
  t.assert(notifLangs, 'Bildirim metinleri 5 dilde çözülüyor');

  const msg = t.translate('notifications.badge_granted_msg', 'tr', { badge: 'Onaylı Satıcı' });
  t.assert(msg.includes('Onaylı Satıcı') && !msg.includes('{badge}'), 'Bildirimde rozet adı yerine geçiyor');
});
