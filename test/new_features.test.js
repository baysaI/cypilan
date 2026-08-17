const t = require('./helpers');

const cities = require(t.rootDir + '/config/cities');
const Listing = require(t.rootDir + '/models/Listing');
const PriceAlert = require(t.rootDir + '/models/PriceAlert');
const Bid = require(t.rootDir + '/models/Bid');
const Notification = require(t.rootDir + '/models/Notification');

t.run('Yeni Özellikler (Harita, Paylaşım, Talep/Arıyorum, Hızlı Teklif, Fiyat Alarmı, Karşılaştırma)', async (db) => {
  const seller = t.makeUser(db, 'seller_features@test.local', 'Satıcı Test');
  const buyer = t.makeUser(db, 'buyer_features@test.local', 'Alıcı Test');

  // -------------------------------------------------------------
  // 1. Harita & Şehir Koordinatları
  // -------------------------------------------------------------
  const girneCoords = cities.getCoordinates('girne');
  t.assert(girneCoords.lat > 35 && girneCoords.lat < 36, 'Girne enlemi doğru aralıkta');
  t.assert(girneCoords.lng > 33 && girneCoords.lng < 34, 'Girne boylamı doğru aralıkta');
  t.assertEqual(girneCoords.zoom, 13, 'Girne zoom 13 olarak ayarlanır');

  const customCoords = cities.getCoordinates('ozel_bolge', 35.45, 33.95);
  t.assertEqual(customCoords.lat, 35.45, 'Özel enlem doğru okunur');
  t.assertEqual(customCoords.lng, 33.95, 'Özel boylam doğru okunur');
  t.assert(customCoords.isExact === true, 'Özel koordinat isExact true işaretlenir');

  const fallback = cities.getCoordinates('bilinmeyen_yer');
  t.assert(fallback.isExact === false, 'Bilinmeyen şehir için fallback isExact false');
  t.assertEqual(fallback.zoom, 10, 'Fallback zoom 10 olarak ayarlanır');

  // -------------------------------------------------------------
  // 2. "Acil İhtiyacım Var" (Tersine İlan / Talep Modülü)
  // -------------------------------------------------------------
  const wantedListing = await Listing.create({
    user_id: buyer,
    category_id: 101, // Emlak alt kategori
    title: 'Girne Merkezde 2+1 Daire Arıyorum',
    slug: 'girne-daire-ariyorum',
    description: 'Temiz kiralık veya satılık daire arıyorum.',
    price: 15000,
    currency: 'TRY',
    listing_type: 'wanted',
    city: 'Girne',
    status: 'active'
  });

  t.assert(wantedListing.id > 0, 'Talep türündeki ilan veritabanına eklendi');
  t.assertEqual(wantedListing.listing_type, 'wanted', 'listing_type wanted olarak kaydedildi');

  const searchWanted = await Listing.search({ listing_type: 'wanted' }, 1, 20);
  t.assert(searchWanted.data.some((l) => l.id === wantedListing.id), 'Talep ilanı wanted filtresiyle aranabiliyor');

  // -------------------------------------------------------------
  // 3. Fiyat Alarmı & Fiyat Düşüş Bildirimi
  // -------------------------------------------------------------
  const carListing = await Listing.create({
    user_id: seller,
    category_id: 201, // Vasıta alt kategori
    title: '2020 Honda Civic Otomatik',
    slug: 'honda-civic-2020',
    description: 'Kazasız tertemiz servis bakımlı araç.',
    price: 500000,
    currency: 'TRY',
    listing_type: 'sale',
    city: 'Lefkoşa',
    status: 'active'
  });

  // Alıcı fiyat alarmı kurar
  const alert = await PriceAlert.create({
    user_id: buyer,
    listing_id: carListing.id,
    target_price: 480000
  });

  t.assert(alert.id > 0, 'Fiyat alarmı oluşturuldu');

  const pairAlert = await PriceAlert.findByPair(buyer, carListing.id);
  t.assert(pairAlert !== null, 'Fiyat alarmı findByPair ile bulundu');
  t.assertEqual(pairAlert.listing_id, carListing.id, 'Alarm doğru ilanla eşleşiyor');

  const buyerAlerts = await PriceAlert.getUserAlerts(buyer);
  t.assertEqual(buyerAlerts.length, 1, 'Kullanıcının 1 aktif fiyat alarmı listelendi');
  t.assertEqual(buyerAlerts[0].title, '2020 Honda Civic Otomatik', 'Alarm ilan detayını içeriyor');

  // Satıcı fiyatı 500.000 TL'den 460.000 TL'ye düşürür
  await Listing.update(carListing.id, { price: 460000 });

  const buyerNotifs = await Notification.getByUserId(buyer, { limit: 10 });
  const priceDropNotif = buyerNotifs.find((n) => n.type === 'price_drop');
  t.assert(priceDropNotif !== undefined, 'Fiyat düştüğünde aboneye price_drop bildirimi gönderildi');
  t.assert(priceDropNotif.message.includes('460.000'), 'Bildirim mesajı yeni indirimli fiyatı içeriyor');

  // -------------------------------------------------------------
  // 4. Hızlı Teklif / Pazarlık Teklifi
  // -------------------------------------------------------------
  const quickOffer = await Bid.submitQuickOffer({
    listing_id: carListing.id,
    bidder_id: buyer,
    amount: 440000,
    currency: 'TRY',
    message: 'Nakit hemen alabilirim.'
  });

  t.assert(quickOffer.id > 0, 'Hızlı teklif başarıyla kaydedildi');
  t.assertEqual(Number(quickOffer.amount), 440000, 'Teklif tutarı doğru kaydedildi');

  const sellerNotifs = await Notification.getByUserId(seller, { limit: 10 });
  const bidNotif = sellerNotifs.find((n) => n.type === 'bid');
  t.assert(bidNotif !== undefined, 'Satıcıya teklif bildirimi ulaştı');
  t.assert(bidNotif.message.includes('440.000'), 'Teklif bildiriminde teklif tutarı yer alıyor');

  // -------------------------------------------------------------
  // 5. İlan Karşılaştırma
  // -------------------------------------------------------------
  const compareList = await Listing.getCompareListings([carListing.id, wantedListing.id]);
  t.assertEqual(compareList.length, 2, 'Karşılaştırma için 2 ilan yüklendi');
  t.assert(compareList.some((l) => l.id === carListing.id), 'İlk ilan karşılaştırma listesinde');
  t.assert(compareList.some((l) => l.id === wantedListing.id), 'İkinci ilan karşılaştırma listesinde');

  // -------------------------------------------------------------
  // 6. Şablonların Render Edilmesi
  // -------------------------------------------------------------
  const cardHtml = await t.render('partials/listingCard.ejs', {
    listing: await Listing.findBySlug('girne-daire-ariyorum')
  });
  t.assert(cardHtml.includes('TALEP'), 'Talep ilanının kartında TALEP rozeti basılıyor');
  t.assert(cardHtml.includes('compare-toggle-btn'), 'İlan kartında karşılaştır butonu basılıyor');

  const compareHtml = await t.render('listings/compare.ejs', {
    listings: compareList,
    compareIds: [carListing.id, wantedListing.id]
  });
  t.assert(compareHtml.includes('İlan Karşılaştırma'), 'Karşılaştırma sayfası render ediliyor');
  t.assert(compareHtml.includes('2020 Honda Civic Otomatik'), 'Karşılaştırma tablosunda ilan başlığı var');

  const alertsHtml = await t.render('profile/alerts.ejs', {
    alerts: buyerAlerts
  });
  t.assert(alertsHtml.includes('Fiyat Alarmlarım'), 'Fiyat alarmları sayfası render ediliyor');
});
