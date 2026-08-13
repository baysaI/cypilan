// Seeds a throwaway database with a realistic listing volume and times the
// queries the app actually runs, so capacity questions get measured instead of
// guessed. Never touches the real database: point DB_PATH somewhere scratch.
//
//   DB_PATH=./database/bench.db node scripts/bench.js 1000
require('dotenv').config();

const fs = require('fs');
const path = require('path');

if (!process.env.DB_PATH) {
  console.error('DB_PATH gerekli — gerçek veritabanının üzerine yazmamak için.');
  process.exit(1);
}

const { getDb, initialize, closeDb } = require('../config/database');
const Listing = require('../models/Listing');
const Category = require('../models/Category');
const User = require('../models/User');

const LISTINGS = parseInt(process.argv[2], 10) || 1000;
const IMAGES_PER_LISTING = 3;
const CITIES = ['Lefkoşa', 'Girne', 'Gazimağusa', 'İskele', 'Güzelyurt'];
const WORDS = ['satılık', 'kiralık', 'temiz', 'bakımlı', 'acil', 'lüks', 'deniz', 'manzaralı', 'sıfır', 'ikinci el', 'garajlı', 'eşyalı'];

const dbFile = path.resolve(__dirname, '..', process.env.DB_PATH);

const seed = async () => {
  const db = getDb();

  const categoryIds = db.prepare('SELECT id FROM categories WHERE parent_id IS NOT NULL').all().map(r => r.id);
  if (categoryIds.length === 0) throw new Error('Önce kategoriler seed edilmeli');

  const userIds = [];
  const insertUser = db.prepare("INSERT INTO users (email, password_hash, full_name, phone, role) VALUES (?, ?, ?, ?, 'user')");
  db.transaction(() => {
    for (let i = 0; i < 200; i++) {
      userIds.push(Number(insertUser.run([`bench${i}@test.local`, '$2a$10$abcdefghijklmnopqrstuv', `Bench User ${i}`, '05331234567']).lastInsertRowid));
    }
  })();

  const insertListing = db.prepare(`
    INSERT INTO listings (user_id, category_id, title, slug, description, price, currency, status, location_city, location_district, views_count, is_featured, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'TRY', 'active', ?, ?, ?, ?, datetime('now', '+90 days'), datetime('now', '-' || ? || ' days'))
  `);
  const insertImage = db.prepare('INSERT INTO listing_images (listing_id, image_url, is_primary, sort_order) VALUES (?, ?, ?, ?)');

  db.transaction(() => {
    for (let i = 0; i < LISTINGS; i++) {
      const title = `${WORDS[i % WORDS.length]} ${WORDS[(i * 7) % WORDS.length]} ilan ${i}`;
      const id = Number(insertListing.run([
        userIds[i % userIds.length],
        categoryIds[i % categoryIds.length],
        title,
        `bench-ilan-${i}`,
        `${title} hakkinda uzunca bir aciklama metni. `.repeat(6),
        50000 + (i * 137) % 4000000,
        CITIES[i % CITIES.length],
        `Mahalle ${i % 40}`,
        (i * 13) % 5000,
        i % 25 === 0 ? 1 : 0,
        i % 365
      ]).lastInsertRowid);

      for (let k = 0; k < IMAGES_PER_LISTING; k++) {
        insertImage.run([id, `/uploads/listings/listing-bench-${id}-${k}.jpg`, k === 0 ? 1 : 0, k]);
      }
    }
  })();

  // Some traffic-shaped side data so joins are not measured against empty tables.
  const insertFav = db.prepare('INSERT OR IGNORE INTO favorites (user_id, listing_id) VALUES (?, ?)');
  const insertMsg = db.prepare('INSERT INTO messages (sender_id, receiver_id, listing_id, content) VALUES (?, ?, ?, ?)');
  db.transaction(() => {
    for (let i = 0; i < LISTINGS * 2; i++) {
      insertFav.run([userIds[i % userIds.length], 1 + (i * 3) % LISTINGS]);
    }
    for (let i = 0; i < LISTINGS; i++) {
      insertMsg.run([userIds[i % userIds.length], userIds[(i + 1) % userIds.length], 1 + i % LISTINGS, 'Merhaba, ilan hakkinda bilgi alabilir miyim?']);
    }
  })();
};

const time = async (label, fn, runs = 30) => {
  await fn(); // warm
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < runs; i++) await fn();
  const ms = Number(process.hrtime.bigint() - t0) / 1e6 / runs;
  const flag = ms > 50 ? '🔴' : ms > 10 ? '🟡' : '🟢';
  console.log(`  ${flag} ${label.padEnd(46)} ${ms.toFixed(2)} ms`);
  return ms;
};

(async () => {
  if (fs.existsSync(dbFile)) fs.rmSync(dbFile, { force: true });
  ['-wal', '-shm'].forEach(s => fs.rmSync(dbFile + s, { force: true }));

  console.log(`Veritabanı: ${dbFile}`);
  await initialize();
  const db = getDb();
  db.exec(fs.readFileSync(path.join(__dirname, '..', 'database', 'seed.sql'), 'utf8'));

  console.log(`\n${LISTINGS} ilan + ${LISTINGS * IMAGES_PER_LISTING} fotoğraf kaydı yazılıyor...`);
  const t0 = Date.now();
  await seed();
  console.log(`  yazma süresi: ${((Date.now() - t0) / 1000).toFixed(1)} sn`);

  db.pragma('wal_checkpoint(TRUNCATE)');
  const size = fs.statSync(dbFile).size;
  console.log(`\n=== VERİTABANI BOYUTU ===`);
  console.log(`  ${(size / 1024 / 1024).toFixed(2)} MB  (${(size / LISTINGS).toFixed(0)} bayt/ilan)`);
  ['listings', 'listing_images', 'users', 'favorites', 'messages'].forEach(t => {
    console.log(`  ${t.padEnd(16)} ${db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c} satır`);
  });

  console.log(`\n=== SORGU SÜRELERİ (${LISTINGS} ilanda, 30 tekrar ortalaması) ===`);
  await time('Anasayfa: getRecent(12)', () => Listing.getRecent(12));
  await time('Anasayfa: getFeatured(8)', () => Listing.getFeatured(8));
  await time('Anasayfa: kategori sayaçları', () => Category.getMainCategoriesWithCount());
  await time('Anasayfa: countAll + User.countAll', async () => { await Listing.countAll(); await User.countAll(); });
  await time('Liste: search sayfa 1 (filtresiz)', () => Listing.search({}, 1, 20));
  await time('Liste: search sayfa 25 (derin offset)', () => Listing.search({}, 25, 20));
  await time('Liste: kategori filtresi', () => Listing.search({ category: 'emlak' }, 1, 20));
  await time('Liste: metin arama (LIKE %q%)', () => Listing.search({ q: 'manzaralı' }, 1, 20));
  await time('Liste: şehir + fiyat aralığı', () => Listing.search({ city: 'Girne', minPrice: 100000, maxPrice: 900000 }, 1, 20));
  await time('Detay: findDetailBySlug + görseller', () => Listing.findDetailBySlug('bench-ilan-500'));
  await time('Detay: incrementViews (yazma)', () => Listing.incrementViews(500));
  await time('Profil: getByUser', () => Listing.getByUser(3, 20, 0));
  await time('Profil: favoriler', () => Listing.findFavoritesByUser(3));
  await time('Admin: adminFindAll sayfa 1', () => Listing.adminFindAll({}, 1, 20));
  await time('Admin: countByStatus', () => Listing.countByStatus());
  await time('Arama önerisi: suggestTitles', () => Listing.suggestTitles('man', 8));

  console.log(`\n=== SORGU PLANI: kart sorgusundaki alt sorgu ===`);
  const plan = db.prepare(`
    EXPLAIN QUERY PLAN
    SELECT l.*, (SELECT image_url FROM listing_images WHERE listing_id = l.id ORDER BY is_primary DESC, sort_order ASC LIMIT 1) as primary_image
    FROM listings l WHERE l.status = 'active' ORDER BY l.created_at DESC LIMIT 20
  `).all();
  plan.forEach(r => console.log(`  ${r.detail}`));

  closeDb();
})();
