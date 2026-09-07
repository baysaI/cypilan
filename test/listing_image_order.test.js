const fs = require('fs');
const path = require('path');

const t = require('./helpers');
const Listing = require(t.rootDir + '/models/Listing');
const appConfig = require(t.rootDir + '/config/app');

// Bir satıcıdan gelen geri bildirim: "ilan yüklerken foto yükleme yapınca
// resimlerin yerlerini değiştiremiyoruz". Haklıydı - formda sıralama diye bir
// şey yoktu. Sıra süs değil: ilk fotoğraf ilanın kapağı oluyor, listelerde,
// aramada ve paylaşımda görünen tek görsel o. Yanlış sırada seçen satıcının
// tek çaresi hepsini silip baştan seçmekti.
//
// Sıralama tarayıcıda, public/js/imagePicker.js içinde yapılıyor; bir DOM
// olmadan burada çalıştırılamıyor. Bu dosya onun dayandığı iki şeyi bağlıyor:
// sunucunun gelen sırayı koruduğunu ve iki formun da bileşeni gerçekten
// kurduğunu.
t.run('İlan fotoğraflarının sırası', async (db) => {
  const seller = t.makeUser(db, 'foto@test.local', 'Satıcı');
  const categoryId = Number(db.prepare("SELECT id FROM categories WHERE slug = 'satilik-daire'").get().id);

  const created = await Listing.create({
    user_id: seller,
    category_id: categoryId,
    title: 'Sıralı fotoğraflı ilan',
    slug: 'sirali-fotografli-ilan',
    description: 'Fotoğraf sırasının korunduğunu doğrulamak için.',
    price: 1000,
    currency: 'GBP',
    location_city: 'Girne',
    images: ['/uploads/listings/a.jpg', '/uploads/listings/b.jpg', '/uploads/listings/c.jpg']
  });

  const listingId = created.id;

  // --- Gelen sira aynen saklaniyor
  const images = await Listing.getImages(listingId);
  t.assertEqual(images.join(','), '/uploads/listings/a.jpg,/uploads/listings/b.jpg,/uploads/listings/c.jpg',
    'Fotoğraflar verildiği sırayla dönüyor');

  const rows = db.prepare('SELECT image_url, is_primary, sort_order FROM listing_images WHERE listing_id = ? ORDER BY sort_order').all([listingId]);
  t.assertEqual(rows[0].is_primary, 1, 'İlk fotoğraf kapak işaretleniyor');
  t.assertEqual(rows[1].is_primary, 0, 'İkincisi kapak değil');
  t.assertEqual(rows[2].is_primary, 0, 'Üçüncüsü kapak değil');
  t.assertEqual(rows.map((r) => r.sort_order).join(','), '0,1,2', 'Sıra numaraları veriliş sırasına göre');

  // --- Sira degisince kapak da degisiyor
  await Listing.replaceImages(listingId, ['/uploads/listings/c.jpg', '/uploads/listings/a.jpg', '/uploads/listings/b.jpg']);
  const yeniSira = await Listing.getImages(listingId);
  t.assertEqual(yeniSira[0], '/uploads/listings/c.jpg', 'Yeni sıradaki ilk fotoğraf başa geçiyor');

  const yeniKapak = db.prepare('SELECT image_url FROM listing_images WHERE listing_id = ? AND is_primary = 1').get([listingId]);
  t.assertEqual(yeniKapak.image_url, '/uploads/listings/c.jpg', 'Kapak da yeni sıraya göre değişiyor');

  // --- Iki form da ayni bileseni kuruyor
  //
  // Onceden her form kendi kopyasini tasiyordu; iki kopya da ayni eksigi
  // tasiyordu. Bilesen tek yerde, ikisi de oradan kuruyor.
  const picker = path.join(t.rootDir, 'public', 'js', 'imagePicker.js');
  t.assert(fs.existsSync(picker), 'Fotoğraf seçici bileşeni yerinde');

  ['create.ejs', 'edit.ejs'].forEach((name) => {
    const src = fs.readFileSync(path.join(t.rootDir, 'views', 'listings', name), 'utf8');

    t.assert(src.includes('src="/js/imagePicker.js'), name + ' bileşeni yüklüyor');
    t.assert(src.includes('setupImagePicker({'), name + ' bileşeni kuruyor');

    // Betik, kendisini kullanan satir ici betikten once gelmeli; duzen
    // (extractScripts) betikleri sirasini bozmadan sona tasiyor.
    t.assert(src.indexOf('src="/js/imagePicker.js') < src.indexOf('setupImagePicker({'),
      name + ' bileşeni çağrıdan önce yüklüyor');

    // Eski kopyalardan iz kalmamali: kalirsa iki farkli davranis yan yana
    // calisir ve hangisinin kazandigi tarayiciya kalir.
    t.assert(!src.includes('function renderPreviews'), name + ' eski kopyayı taşımıyor');
    t.assert(!src.includes('let selectedFiles'), name + ' eski durum değişkenini taşımıyor');
  });

  // --- Metinler bes dilde
  const keys = ['cover_photo', 'move_earlier', 'move_later', 'images_order_help', 'unsupported_format', 'file_too_large'];
  ['tr', 'en', 'el', 'ru', 'fa'].forEach((lang) => {
    keys.forEach((key) => {
      t.assert(t.translate('listing.' + key, lang) !== 'listing.' + key, lang + ': listing.' + key + ' çözülüyor');
    });
  });

  // --- Etiket gercek siniri soylemeli
  //
  // Form "en fazla 10" diyordu, sunucu 20 kabul ediyor. Satici 11. fotografi
  // secebiliyor ama secmemesi gerektigini saniyor.
  const limit = appConfig.uploads.maxImagesPerListing;
  ['tr', 'en', 'el', 'ru', 'fa'].forEach((lang) => {
    const label = t.translate('listing.max_images', lang);
    // Farsca rakamlari ayri karakterler.
    const western = label.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
    t.assert(western.includes(String(limit)), lang + ': fotoğraf sınırı etiketi ' + limit + ' diyor');
  });
});
