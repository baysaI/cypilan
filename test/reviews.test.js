const t = require('./helpers');

const Review = require(t.rootDir + '/models/Review');
const Message = require(t.rootDir + '/models/Message');

t.run('Puanlama sistemi', async (db) => {
  const seller = t.makeUser(db, 'seller@test.local', 'Satıcı Ali');
  const buyer = t.makeUser(db, 'buyer@test.local', 'Alıcı Veli');
  const stranger = t.makeUser(db, 'stranger@test.local', 'Yabancı Can');

  const listingId = Number(db.prepare(`
    INSERT INTO listings (user_id, category_id, title, slug, description, price, status, location_city)
    VALUES (?, 101, 'Test Daire', 'test-daire', 'açıklama', 100000, 'active', 'Girne')
  `).run([seller]).lastInsertRowid);

  // --- Puan vermek icin once mesajlasmis olmak gerekir
  t.assert(
    !(await Review.hasInteracted(buyer, seller)),
    'Mesajlaşma yokken puan verme kapalı'
  );

  await Message.create({ sender_id: buyer, receiver_id: seller, listing_id: listingId, content: 'Merhaba' });

  t.assert(
    await Review.hasInteracted(buyer, seller),
    'Mesajlaşma sonrası puan verme açılıyor'
  );

  t.assert(
    !(await Review.hasInteracted(stranger, seller)),
    'Hiç mesajlaşmamış kullanıcı için kapalı kalıyor'
  );

  // --- Puan yazma
  await Review.upsert({ reviewer_id: buyer, reviewed_user_id: seller, listing_id: listingId, rating: 5, comment: 'Harika' });
  let summary = await Review.getSummary(seller);
  t.assert(summary.total === 1 && summary.average === 5, 'İlk puan kaydedildi (5.0, 1 adet)');

  // --- Tekrar gonderim yeni satir DEGIL, guncelleme olmali
  await Review.upsert({ reviewer_id: buyer, reviewed_user_id: seller, listing_id: listingId, rating: 3, comment: 'Fikrim değişti' });
  summary = await Review.getSummary(seller);
  t.assertEqual(summary.total, 1, 'Tekrar gönderim yeni satır açmadı');
  t.assertEqual(summary.average, 3, 'Tekrar gönderim mevcut puanı güncelledi');

  // --- Modeli baypas eden ham INSERT de reddedilmeli
  let dbRejected = false;
  try {
    db.prepare('INSERT INTO reviews (reviewer_id, reviewed_user_id, rating) VALUES (?, ?, ?)').run([buyer, seller, 1]);
  } catch (error) {
    dbRejected = error.code === 'SQLITE_CONSTRAINT_UNIQUE';
  }
  t.assert(dbRejected, 'Veritabanı mükerrer puanı reddediyor (UNIQUE index)');

  // --- Ikinci kullanicidan puan -> ortalama
  await Message.create({ sender_id: stranger, receiver_id: seller, content: 'Selam' });
  await Review.upsert({ reviewer_id: stranger, reviewed_user_id: seller, rating: 4 });
  summary = await Review.getSummary(seller);
  t.assert(summary.total === 2 && summary.average === 3.5, 'İki puanın ortalaması doğru (3.5)');
  t.assert(
    summary.distribution[3] === 1 && summary.distribution[4] === 1,
    'Yıldız dağılımı doğru'
  );

  // --- Silme
  await Review.remove(stranger, seller);
  summary = await Review.getSummary(seller);
  t.assertEqual(summary.total, 1, 'Puan silme çalışıyor');

  // --- Gecersiz puanlar
  const invalid = [0, 6, 3.5, 'abc', null].every((value) => !Review.isValidRating(value));
  t.assert(invalid, 'Geçersiz puanlar (0, 6, 3.5, abc, null) reddediliyor');

  // --- Profil sablonu
  const reviews = await Review.getByUser(seller, 20);
  const html = await t.render('profile/show.ejs', {
    profileUser: {
      id: seller, full_name: 'Satıcı Ali', role: 'user', created_at: '2025-01-01 10:00:00',
      has_phone: false, bio: null, company_name: null, avatar_url: null
    },
    listings: [],
    stats: { listingsCount: 1, averageRating: 3, reviewCount: 1 },
    reviewSummary: summary,
    reviews,
    canReview: true,
    myReview: reviews[0],
    maxCommentLength: 600,
    title: 'test',
    user: { id: buyer, name: 'Alıcı Veli' }
  });

  t.assert(html.includes('Değerlendirmeler'), 'profile/show.ejs değerlendirme bölümünü basıyor');
  t.assert(html.includes('Fikrim değişti'), 'Yorum metni şablonda görünüyor');
  t.assert(html.includes('/reviews/user/' + seller), 'Puanlama formu doğru adrese gönderiyor');

  // --- Ceviriler
  const allLangs = ['tr', 'en', 'el', 'ru', 'fa'].every(
    (lang) => t.translate('reviews.requires_contact', lang) !== 'reviews.requires_contact'
  );
  t.assert(allLangs, 'reviews.* anahtarları 5 dilde çözülüyor');
  t.assertEqual(t.translate('reviews.count', 'tr', { count: 7 }), '7 değerlendirme', '{count} parametresi yerleşiyor');
});
