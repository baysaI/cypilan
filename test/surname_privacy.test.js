const t = require('./helpers');
const Listing = require(t.rootDir + '/models/Listing');
const Review = require(t.rootDir + '/models/Review');
const User = require(t.rootDir + '/models/User');

t.run('Soyadı gizleme ve görünürlük sistemi', async (db) => {
  // 1. formatDisplayName birim testleri
  t.assert(t.helpers.formatDisplayName('Ahmet Yılmaz', false) === 'Ahmet Y.', 'İki kelimeli isimde soyadı gizleniyor (Ahmet Y.)');
  t.assert(t.helpers.formatDisplayName('Mehmet Ali Kaya', false) === 'Mehmet Ali K.', 'Üç kelimeli isimde soyadı gizleniyor (Mehmet Ali K.)');
  t.assert(t.helpers.formatDisplayName('Ayşe', false) === 'Ayşe', 'Tek kelimeli isim doğrudan dönüyor (Ayşe)');
  t.assert(t.helpers.formatDisplayName('Ahmet Yılmaz', true) === 'Ahmet Yılmaz', 'showSurname true iken tam isim dönüyor');
  t.assert(t.helpers.formatDisplayName('Ahmet Yılmaz', 1) === 'Ahmet Yılmaz', 'showSurname 1 iken tam isim dönüyor');
  t.assert(t.helpers.formatDisplayName('Ahmet Yılmaz', 0) === 'Ahmet Y.', 'showSurname 0 iken soyadı gizleniyor');
  t.assert(t.helpers.formatDisplayName('', false) === '', 'Boş isim boş dönüyor');
  t.assert(t.helpers.formatDisplayName(null, false) === '', 'null isim boş dönüyor');

  // 2. Veritabanı ve model testleri
  const user1 = t.makeUser(db, 'user1@test.local', 'Hasan Hüseyin Çelik');
  const user2 = t.makeUser(db, 'user2@test.local', 'Fatma Demir');

  // Varsayılan olarak show_surname 0 (gizli) olmalı
  const u1 = await User.findById(user1);
  t.assert(Number(u1.show_surname) === 0, 'Yeni kullanıcıda show_surname varsayılan olarak 0 (gizli)');

  // Kullanıcı ayarı 1 (tam gösterim) olarak güncelleyebilmeli
  await User.update(user1, { show_surname: 1 });
  const u1Updated = await User.findById(user1);
  t.assert(Number(u1Updated.show_surname) === 1, 'Kullanıcı show_surname ayarını 1 yapabiliyor');

  // İlan detayında seller_show_surname çekilmeli
  const listingId = Number(db.prepare(`
    INSERT INTO listings (user_id, category_id, title, slug, description, price, status, location_city)
    VALUES (?, 101, 'Satılık Villa', 'satilik-villa-test', 'lüks villa', 500000, 'active', 'Girne')
  `).run([user2]).lastInsertRowid);

  const listingDetail = await Listing.findDetailBySlug('satilik-villa-test');
  t.assert(Number(listingDetail.seller_show_surname) === 0, 'İlan detayında seller_show_surname 0 olarak geliyor');
  t.assert(
    t.helpers.formatDisplayName(listingDetail.seller_name, listingDetail.seller_show_surname) === 'Fatma D.',
    'İlan sahibinin adı ilanda "Fatma D." olarak maskeleniyor'
  );

  // Değerlendirmelerde reviewer_show_surname çekilmeli
  await Review.upsert({ reviewer_id: user2, reviewed_user_id: user1, listing_id: listingId, rating: 5, comment: 'Süper satıcı' });
  const reviews = await Review.getByUser(user1);
  t.assert(reviews.length === 1, 'Yorum kaydedildi');
  t.assert(Number(reviews[0].reviewer_show_surname) === 0, 'Yorumda reviewer_show_surname 0 olarak geliyor');
  t.assert(
    t.helpers.formatDisplayName(reviews[0].reviewer_name, reviews[0].reviewer_show_surname) === 'Fatma D.',
    'Yorum yazarının adı "Fatma D." olarak maskeleniyor'
  );

  // Şablon render testleri
  const profileEditHtml = await t.render('profile/edit.ejs', {
    user: u1,
    title: 'Profil Düzenle',
    csrfToken: 'test'
  });
  t.assert(profileEditHtml.includes('name="hide_surname"'), 'profile/edit.ejs soyadı gizleme onay kutusunu basıyor');

  const createHtml = await t.render('listings/create.ejs', {
    categories: [],
    categoryTree: [],
    draftFeatureMap: {},
    draftFeatureLabels: {},
    formData: {},
    userPhone: '05331234567',
    hidePhone: false,
    hideSurname: true,
    quota: { limit: 5, used: 0, remaining: 5, isUnlimited: false, isCorporate: false, categories: [], freeCategories: [] },
    listingBadges: { BADGES: [] }
  });
  t.assert(createHtml.includes('name="hide_surname"'), 'create.ejs telefon ayarının altında soyadı gizleme onay kutusunu basıyor');
  t.assert(createHtml.includes('Soyadımı sitede ve ilanlarımda gizle'), 'create.ejs soyadı gizleme etiketini basıyor');
});
