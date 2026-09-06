const t = require('./helpers');

const Listing = require(t.rootDir + '/models/Listing');
const brands = require(t.rootDir + '/config/vehicleBrands');

t.run('Araç markaları ve model havuzu', async (db) => {
  const seller = t.makeUser(db, 'satici@test.local', 'Satıcı');
  const categoryId = Number(db.prepare("SELECT id FROM categories WHERE slug = 'otomobil'").get().id);

  let n = 0;
  const listing = (brand, model, status = 'active') => {
    n += 1;
    const id = Number(db.prepare(`
      INSERT INTO listings (user_id, category_id, title, slug, description, status)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run([seller, categoryId, 'İlan ' + n, 'ilan-' + n, 'açıklama', status]).lastInsertRowid);

    db.prepare("INSERT INTO listing_attributes (listing_id, attribute_key, attribute_value) VALUES (?, 'brand', ?)")
      .run([id, brand]);
    if (model !== null) {
      db.prepare("INSERT INTO listing_attributes (listing_id, attribute_key, attribute_value) VALUES (?, 'model', ?)")
        .run([id, model]);
    }
    return id;
  };

  // --- Katalog
  const car = brands.forSubcategory('otomobil');
  t.assert(car.all.length > 30, 'Otomobil marka listesi dolu');
  t.assertEqual(car.all[0], 'Toyota', 'En sık görülen marka başta (alfabetik değil)');
  t.assert(car.popular.length > 0, 'Popüler alt kümesi tanımlı');

  // Motosiklet markalari otomobilinkiyle ayni degil; ayniymis gibi davranmak
  // listeyi iki tarafta da kullanissiz yapardi.
  const moto = brands.forSubcategory('motosiklet');
  t.assert(moto.all.includes('Yamaha'), 'Motosiklet listesi kendi markalarını taşıyor');
  t.assert(!moto.all.includes('Toyota'), 'Otomobil markası motosiklette görünmüyor');
  t.assert(brands.forSubcategory('bilinmeyen').all.includes('Toyota'), 'Bilinmeyen alt kategori otomobile düşüyor');

  // --- Normalizasyon
  t.assertEqual(brands.canonicalBrand('otomobil', 'bmw'), 'BMW', 'Yazım listedeki hâline çekiliyor');
  t.assertEqual(brands.canonicalBrand('otomobil', '  mercedes-benz '), 'Mercedes-Benz', 'Boşluk ve küçük harf düzeliyor');
  t.assertEqual(brands.canonicalBrand('otomobil', 'Morgan'), 'Morgan', 'Listede olmayan marka olduğu gibi kalıyor');
  t.assertEqual(brands.normalize('  320   i '), '320 i', 'Boşluklar sadeleşiyor');
  t.assertEqual(brands.normalize(null), '', 'Boş değer patlatmıyor');

  // --- Model havuzu
  t.assertEqual((await Listing.modelsForBrand('BMW')).length, 0, 'Hiç ilan yokken havuz boş');

  // Tek kullanim oneriye donusmemeli: bir kisinin bir kez yanlis yazdigi sey
  // listeye girmemeli, iki kisinin ayni yazdigi sey girmeli.
  listing('BMW', '320i');
  t.assertEqual((await Listing.modelsForBrand('BMW')).length, 0, 'Tek kullanım öneriye dönüşmüyor');

  listing('BMW', '320i');
  const pool = await Listing.modelsForBrand('BMW');
  t.assertEqual(pool.length, 1, 'İki kullanım öneriye dönüşüyor');
  t.assertEqual(pool[0].model, '320i', 'Doğru model');
  t.assertEqual(pool[0].uses, 2, 'Kullanım sayısı doğru');

  listing('BMW', '520d');
  listing('BMW', '520d');
  listing('BMW', '520d');
  t.assertEqual((await Listing.modelsForBrand('BMW'))[0].model, '520d', 'En çok kullanılan başta');

  listing('bmw', 'X5');
  listing('BMW ', 'X5');
  t.assert(
    (await Listing.modelsForBrand('BMW')).some((m) => m.model === 'X5'),
    'Marka eşleşmesi büyük/küçük harfe ve boşluğa duyarsız'
  );

  listing('Toyota', 'Corolla');
  listing('Toyota', 'Corolla');
  const toyota = await Listing.modelsForBrand('Toyota');
  t.assertEqual(toyota.length, 1, 'Markalar birbirine karışmıyor');
  t.assertEqual(toyota[0].model, 'Corolla', 'Doğru markanın modeli geliyor');

  // Yayinda olmayan ilan havuza girmemeli: onay bekleyen ya da kaldirilmis bir
  // ilandan gelen model, herkese onerilen bir deger olmamali.
  listing('Honda', 'Civic', 'pending');
  listing('Honda', 'Civic', 'pending');
  t.assertEqual((await Listing.modelsForBrand('Honda')).length, 0, 'Yayında olmayan ilan havuza girmiyor');

  listing('Kia', '');
  listing('Kia', '');
  t.assertEqual((await Listing.modelsForBrand('Kia')).length, 0, 'Boş model değeri öneri olmuyor');

  listing('Opel', null);
  listing('Opel', null);
  t.assertEqual((await Listing.modelsForBrand('Opel')).length, 0, 'Modeli girilmemiş ilan havuza girmiyor');

  // --- Kotu girdi
  t.assertEqual((await Listing.modelsForBrand('')).length, 0, 'Boş marka boş dönüyor');
  t.assertEqual((await Listing.modelsForBrand(null)).length, 0, 'null marka patlatmıyor');
  t.assertEqual((await Listing.modelsForBrand("' OR 1=1 --")).length, 0, 'Tırnak içeren marka sorguyu kırmıyor');
});
