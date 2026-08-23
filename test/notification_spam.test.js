const t = require('./helpers');

const Notification = require(t.rootDir + '/models/Notification');
const Bid = require(t.rootDir + '/models/Bid');
const Listing = require(t.rootDir + '/models/Listing');

t.run('Bildirim spam korumasi', async (db) => {
  const seller = t.makeUser(db, 'seller@test.local', 'Satıcı');
  const buyer = t.makeUser(db, 'buyer@test.local', 'Alıcı');
  const other = t.makeUser(db, 'other@test.local', 'Başkası');

  const listing = await Listing.create({
    user_id: seller, category_id: 101, title: 'Girne Villa', slug: 'girne-villa-spam',
    description: 'açıklama', price: 100000, currency: 'GBP', status: 'active', city: 'Girne'
  });

  const countFor = (userId) =>
    db.prepare('SELECT COUNT(*) AS count FROM notifications WHERE user_id = ?').get([userId]).count;

  // --- Ayni teklifi tekrar tekrar gondermek tek bildirim birakmali
  for (let i = 0; i < 10; i += 1) {
    await Bid.submitQuickOffer({ listing_id: listing.id, bidder_id: buyer, amount: 90000, currency: 'GBP' });
  }

  t.assertEqual(countFor(seller), 1, 'Aynı teklif on kez gönderilince tek bildirim kalıyor');
  t.assertEqual(
    db.prepare('SELECT COUNT(*) AS count FROM bids WHERE listing_id = ? AND bidder_id = ?').get([listing.id, buyer]).count,
    1,
    'Teklif tablosunda yine tek satır var'
  );

  // --- Tutari her seferinde degistirerek spam atmak da engellenmeli:
  // ayni gonderenden ayni turde gelen bildirim yeni satir acmiyor, var olani
  // guncelliyor. Bilgi kaybi yok - kalan bildirim en guncel tutari gosteriyor.
  for (let i = 0; i < 15; i += 1) {
    await Bid.submitQuickOffer({ listing_id: listing.id, bidder_id: buyer, amount: 90000 + i, currency: 'GBP' });
  }

  t.assertEqual(countFor(seller), 1, 'Tutarı değiştirerek on beş kez teklif verilse de tek bildirim kalıyor');

  const latest = db.prepare("SELECT message FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 1").get([seller]).message;
  t.assert(latest.includes('90.014'), 'Kalan bildirim en güncel tutarı gösteriyor');

  const unread = db.prepare("SELECT is_read FROM notifications WHERE user_id = ? LIMIT 1").get([seller]).is_read;
  t.assertEqual(Number(unread), 0, 'Güncellenen bildirim okunmamış işaretleniyor');

  // --- Tutar degisince yeni satir acilmiyor, var olan guncelleniyor
  await Bid.submitQuickOffer({ listing_id: listing.id, bidder_id: buyer, amount: 95000, currency: 'GBP' });
  t.assertEqual(countFor(seller), 1, 'Tutar değişince yeni satır açılmıyor, mevcut bildirim güncelleniyor');

  // --- Baska bir kullanicinin ayni tutarli teklifi ayri bir olay
  await Bid.submitQuickOffer({ listing_id: listing.id, bidder_id: other, amount: 95000, currency: 'GBP' });
  t.assertEqual(countFor(seller), 2, 'Farklı kullanıcının teklifi ayrı bildirim üretiyor');

  // --- Ayni metin farkli kisiye gidiyorsa engellenmemeli
  await Notification.create({
    user_id: buyer, actor_id: seller, type: 'system', title: 'Duyuru', message: 'Aynı metin'
  });
  await Notification.create({
    user_id: other, actor_id: seller, type: 'system', title: 'Duyuru', message: 'Aynı metin'
  });
  t.assertEqual(countFor(buyer), 1, 'Aynı metin başka alıcıya gidebiliyor');
  t.assertEqual(countFor(other), 1, 'İkinci alıcı da kendi bildirimini alıyor');

  // --- Tekrar engellenen cagri, var olan bildirimi geri dondurmeli
  const again = await Notification.create({
    user_id: buyer, actor_id: seller, type: 'system', title: 'Duyuru', message: 'Aynı metin'
  });
  t.assert(Boolean(again && again.id), 'Engellenen tekrar, mevcut bildirimi geri döndürüyor');
  t.assertEqual(countFor(buyer), 1, 'Tekrar yeni satır açmıyor');

  // --- Pencere disina dusen ayni bildirim tekrar yazilabilmeli
  db.prepare("UPDATE notifications SET created_at = datetime('now', '-3 hours') WHERE user_id = ?").run([buyer]);
  await Notification.create({
    user_id: buyer, actor_id: seller, type: 'system', title: 'Duyuru', message: 'Aynı metin'
  });
  t.assertEqual(countFor(buyer), 2, 'Pencere dışındaki aynı bildirim tekrar yazılabiliyor');
});
