const t = require('./helpers');

const Listing = require(t.rootDir + '/models/Listing');
const listingPolicy = require(t.rootDir + '/config/listingPolicy');

const makeListing = (userId, slug, title) => Listing.create({
  user_id: userId, category_id: 101, title, slug,
  description: 'açıklama', price: 1000, currency: 'GBP', status: 'active', city: 'Girne'
});

t.run('Vitrine firlatma', async (db) => {
  const member = t.makeUser(db, 'member@test.local', 'Normal Üye');
  const company = t.makeUser(db, 'company@test.local', 'Kurumsal', 'business');
  const stranger = t.makeUser(db, 'stranger@test.local', 'Yabancı');

  // --- Kotalar
  t.assertEqual(listingPolicy.boostQuotaFor('user'), 1, 'Normal üyenin haftalık hakkı 1');
  t.assertEqual(listingPolicy.boostQuotaFor('business'), 3, 'Kurumsal hesabın haftalık hakkı 3');
  t.assertEqual(listingPolicy.boostQuotaFor('agent'), 3, 'Emlakçı hesabının haftalık hakkı 3');

  const eski = await makeListing(member, 'eski-ilan', 'Eski İlan');
  const yeni = await makeListing(member, 'yeni-ilan', 'Yeni İlan');

  // Yayin tarihlerini ayiralim: firlatma olmadan yeni olan ustte olmali
  db.prepare("UPDATE listings SET created_at = '2026-01-01 00:00:00' WHERE id = ?").run([eski.id]);
  db.prepare("UPDATE listings SET created_at = '2026-06-01 00:00:00' WHERE id = ?").run([yeni.id]);

  const before = await Listing.getFeatured(10);
  t.assertEqual(before[0].id, yeni.id, 'Firlatma yokken en yeni ilan vitrinin başında');

  // --- Firlatma ilani tepeye tasimali
  t.assert(await Listing.boost(eski.id, member), 'Firlatma başarılı');

  const after = await Listing.getFeatured(10);
  t.assertEqual(after[0].id, eski.id, 'Fırlatılan ilan vitrinin en üstüne çıkıyor');
  t.assertEqual(after[1].id, yeni.id, 'Diğerleri yayın tarihi sırasını koruyor');

  // --- Hak sayimi
  t.assertEqual(await Listing.boostsUsed(member), 1, 'Kullanılan hak sayılıyor');
  t.assert(Boolean(await Listing.nextBoostAt(member)), 'Yeni hakkın açılacağı zaman hesaplanıyor');

  // --- Baskasinin ilani firlatilamaz, hak da yanmaz
  t.assert(!(await Listing.boost(eski.id, stranger)), 'Başkasının ilanı fırlatılamıyor');
  t.assertEqual(await Listing.boostsUsed(stranger), 0, 'Reddedilen deneme hak harcamıyor');

  // --- Yayinda olmayan ilan firlatilamaz
  const kapali = await makeListing(member, 'kapali-ilan', 'Kapalı İlan');
  db.prepare("UPDATE listings SET status = 'sold' WHERE id = ?").run([kapali.id]);
  t.assert(!(await Listing.boost(kapali.id, member)), 'Yayında olmayan ilan fırlatılamıyor');

  // --- Kurumsal uc kez firlatabilmeli
  const c1 = await makeListing(company, 'kurumsal-1', 'Kurumsal 1');
  const c2 = await makeListing(company, 'kurumsal-2', 'Kurumsal 2');
  const c3 = await makeListing(company, 'kurumsal-3', 'Kurumsal 3');

  for (const item of [c1, c2, c3]) {
    t.assert(await Listing.boost(item.id, company), 'Kurumsal fırlatma başarılı: ' + item.slug);
  }
  t.assertEqual(await Listing.boostsUsed(company), 3, 'Kurumsal üç hakkını da kullanabiliyor');

  // --- Ayni ilani ikinci kez firlatmak da hak harciyor
  await Listing.boost(c1.id, company);
  t.assertEqual(await Listing.boostsUsed(company), 4, 'Aynı ilanı tekrar fırlatmak da hak harcıyor');

  // --- Firlatmanin etkisi pencere dolunca bitmeli
  db.prepare("UPDATE listings SET boosted_at = datetime('now', '-10 days') WHERE id = ?").run([eski.id]);
  const expired = await Listing.getFeatured(10);
  const eskiIndex = expired.findIndex((row) => row.id === eski.id);
  const yeniIndex = expired.findIndex((row) => row.id === yeni.id);
  t.assert(yeniIndex < eskiIndex, 'Süresi dolan fırlatma artık üste taşımıyor');

  // --- Pencere disina dusen firlatma hak sayimindan da dusmeli
  db.prepare("UPDATE listing_boosts SET created_at = datetime('now', '-10 days') WHERE user_id = ?").run([member]);
  t.assertEqual(await Listing.boostsUsed(member), 0, 'Süresi dolan fırlatma hak sayımından düşüyor');
  t.assertEqual(await Listing.nextBoostAt(member), null, 'Hak dolmadığında bekleme zamanı yok');
});
