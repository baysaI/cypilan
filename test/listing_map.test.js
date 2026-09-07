const t = require('./helpers');

const Listing = require(t.rootDir + '/models/Listing');
const { buildMapPoints, median, coarsen, GRID } = require(t.rootDir + '/utils/listingMap');
const cities = require(t.rootDir + '/config/cities');

t.run('Emlak haritası', async (db) => {
  const seller = t.makeUser(db, 'satici@test.local', 'Satıcı');
  const emlakId = Number(db.prepare("SELECT id FROM categories WHERE slug = 'satilik-daire'").get().id);
  const vasitaId = Number(db.prepare("SELECT id FROM categories WHERE slug = 'otomobil'").get().id);

  let n = 0;
  const listing = (categoryId, city, price, { lat = null, lng = null, status = 'active', currency = 'GBP' } = {}) => {
    n += 1;
    return Number(db.prepare(`
      INSERT INTO listings (user_id, category_id, title, slug, description, status, price, currency, location_city, location_lat, location_lng)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run([seller, categoryId, 'İlan ' + n, 'ilan-' + n, 'açıklama', status, price, currency, city, lat, lng]).lastInsertRowid);
  };

  // --- Ortanca: tek bir villa sonucu bukmemeli
  t.assertEqual(median([]), null, 'Boş listede ortanca yok');
  t.assertEqual(median([1, 2, 3]), 2, 'Tek sayıda eleman');
  t.assertEqual(median([1, 2, 3, 4]), 3, 'Çift sayıda eleman ortalaması');
  t.assertEqual(median([100, 110, 120, 5000]), 115, 'Tek aşırı değer ortancayı bozmuyor');

  // --- Bos site
  t.assertEqual((await Listing.mapListings({ rootSlug: 'emlak' })).length, 0, 'İlan yokken harita boş');

  listing(emlakId, 'Girne', 100000);
  listing(emlakId, 'Girne', 200000);
  listing(emlakId, 'Girne', 300000);
  listing(emlakId, 'Lefkoşa', 150000);
  listing(emlakId, 'Girne', 999000, { lat: 35.3400, lng: 33.3200 });
  listing(vasitaId, 'Girne', 25000);
  listing(emlakId, 'Girne', 500000, { status: 'pending' });
  listing(emlakId, 'Atlantis', 400000);

  // --- Sorgu
  const rows = await Listing.mapListings({ rootSlug: 'emlak' });
  t.assertEqual(rows.length, 6, 'Yalnızca yayındaki emlak ilanları geliyor');
  t.assert(!rows.some((r) => r.category_slug === 'otomobil'), 'Vasıta ilanı emlak haritasına girmiyor');

  // --- Noktalar
  const points = buildMapPoints(rows, { currency: 'GBP' });

  // Koordinati olan ilan kendi yerinde; olmayan sehrinde toplaniyor. Ayrim
  // verinin kendisinden geliyor, tahminden degil.
  t.assertEqual(points.exact.length, 1, 'Koordinatı olan ilan tek başına duruyor');
  t.assertEqual(points.exact[0].price, 999000, 'Tekil ilanın fiyatı taşınıyor');

  const girne = points.cities.find((c) => c.city === 'Girne');
  t.assertEqual(girne.total, 3, 'Şehir sayımı koordinatlı ilanı iki kez saymıyor');
  t.assertEqual(girne.medianPrice, 200000, 'Şehrin ortanca fiyatı');
  t.assert(Math.abs(girne.lat - 35.3364) < 0.001, 'Şehir koordinatı katalogdan geliyor');

  // Taninmayan sehir Kibris'in ortasina dusuyordu; oraya isaret koymak
  // ilanlarin orada oldugunu soylemek olurdu.
  t.assert(!points.cities.some((c) => c.city === 'Atlantis'), 'Tanınmayan şehir haritaya girmiyor');

  // --- Bozuk veri harita cizimini bozmamali
  const bozuk = buildMapPoints([
    { id: 1, city: 'Girne', price: null, currency: 'GBP', lat: null, lng: null },
    { id: 2, city: 'Girne', price: 'abc', currency: 'GBP', lat: null, lng: null },
    { id: 3, city: '', price: 100, currency: 'GBP', lat: null, lng: null },
    { id: 4, city: 'Girne', price: 100, currency: 'GBP', lat: 0, lng: 0 }
  ], { currency: 'GBP' });

  const bozukGirne = bozuk.cities.find((c) => c.city === 'Girne');
  t.assertEqual(bozukGirne.total, 3, 'Fiyatsız ilan sayılıyor');
  t.assertEqual(bozukGirne.medianPrice, 100, 'Ortanca yalnızca geçerli fiyatlardan');
  t.assertEqual(bozuk.exact.length, 0, 'Sıfır koordinat gerçek konum sayılmıyor');
  t.assert(!bozuk.cities.some((c) => c.city === ''), 'Şehirsiz ilan haritaya girmiyor');

  // --- Sablon
  const html = await t.render('listings/map.ejs', { points, title: 'test' });
  t.assert(html.includes(t.translate('map.page_title', 'tr')), 'Sayfa başlığı basılıyor');
  t.assert(html.includes('L.tileLayer'), 'Harita katmanı kuruluyor');
  t.assert(html.includes('"medianPrice":200000'), 'Nokta verisi sayfaya gömülüyor');

  // Isaretin ne anlama geldigi sayfada yazmali: yazmazsa ziyaretci sehir
  // isaretini adres sanar.
  t.assert(html.includes(t.translate('map.accuracy_note', 'tr')), 'Doğruluk notu sayfada');

  const bosHtml = await t.render('listings/map.ejs', {
    points: { exact: [], cities: [], currency: 'GBP', total: 0 },
    title: 'test'
  });
  t.assert(bosHtml.includes('listingMap'), 'İlan yokken de harita basılıyor');
  t.assert(!bosHtml.includes('NaN'), 'Boş veride NaN yok');

  // --- Konum kasten kabalastiriliyor
  //
  // Amac istatistik: "su bolgede su fiyatlar var" demek. Evin kapisini
  // saklamak degil - saklandigi anda o kapi numarasi disa aktarilabilir,
  // sizabilir hale geliyor. Saklanmayan veri sizmiyor.
  const nokta = coarsen(35.34123, 33.31876);
  t.assert(nokta !== null, 'Geçerli nokta kabul ediliyor');
  t.assertEqual(Math.round(nokta.lat * 1000) / 1000, 35.34, 'Enlem ızgaraya oturuyor');
  t.assertEqual(Math.round(nokta.lng * 1000) / 1000, 33.32, 'Boylam ızgaraya oturuyor');

  const kapi1 = coarsen(35.3412, 33.3187);
  const kapi2 = coarsen(35.3419, 33.3191);
  t.assert(kapi1.lat === kapi2.lat && kapi1.lng === kapi2.lng,
    'Aynı mahalledeki iki adres aynı noktaya düşüyor');
  t.assert(coarsen(35.3412, 33.3400).lng !== kapi1.lng,
    'Uzaktaki nokta ayrı kalıyor (harita bir şey söyleyebilsin)');

  const metre = GRID * 111000;
  t.assert(metre > 400 && metre < 700, 'Izgara aralığı yaklaşık 500 metre');

  t.assertEqual(coarsen(null, null), null, 'Boş nokta reddediliyor');
  t.assertEqual(coarsen('abc', 'def'), null, 'Sayı olmayan reddediliyor');
  t.assertEqual(coarsen(0, 0), null, 'Sıfır sıfır gerçek konum sayılmıyor');
  t.assertEqual(coarsen(48.85, 2.35), null, 'Kıbrıs dışındaki nokta reddediliyor');
  t.assert(coarsen(34.75, 32.42) !== null, 'Adanın batı ucu kabul ediliyor');
  t.assert(coarsen(35.40, 34.55) !== null, 'Karpaz kabul ediliyor');

  // Kapiya kadar yakinlastirmak, olmayan bir hassasiyeti varmis gibi
  // gostermek olurdu.
  t.assertEqual(cities.getCoordinates('Girne', 35.34, 33.32).zoom, 14,
    'İlan noktası mahalle düzeyinde açılıyor');
  t.assertEqual(cities.getCoordinates('Girne').zoom, 13, 'Şehir merkezi kendi yakınlaştırmasıyla');

  // --- Diller
  const diller = ['tr', 'en', 'el', 'ru', 'fa'].every((lang) =>
    ['map.page_title', 'map.listing_count', 'map.accuracy_note', 'map.as_list', 'map.page_description']
      .every((key) => t.translate(key, lang) !== key)
  );
  t.assert(diller, 'Harita metinleri 5 dilde çözülüyor');
});
