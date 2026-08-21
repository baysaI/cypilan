const t = require('./helpers');

const Listing = require(t.rootDir + '/models/Listing');
const Career = require(t.rootDir + '/models/Career');

t.run('İlan oluşturma bütünlüğü', async (db) => {
  const seller = t.makeUser(db, 'seller@test.local', 'Satıcı');

  // --- Ilan, gorselleri, nitelikleri ve is detaylari tek seferde yazilmali
  const job = await Listing.create({
    user_id: seller, category_id: 301, title: 'Resepsiyon Görevlisi',
    slug: 'resepsiyon-atomik', description: 'Otelimize resepsiyonist aranıyor',
    status: 'active', city: 'Girne',
    images: ['/uploads/listings/a.webp', '/uploads/listings/b.webp'],
    attributes: { experience: '2', shift: 'gunduz' },
    jobDetails: { work_type: 'full_time', salary_min: '30000', salary_currency: 'TRY' }
  });

  t.assert(Boolean(job && job.id), 'İlan oluşturuluyor');
  t.assertEqual((await Listing.getImages(job.id)).length, 2, 'Görseller aynı çağrıda yazılıyor');

  const attrs = await Listing.getAttributes(job.id);
  t.assertEqual(attrs.length, 2, 'Nitelikler aynı çağrıda yazılıyor');

  const details = await Career.getJobDetails(job.id);
  t.assert(Boolean(details), 'İş ilanı detayları aynı çağrıda yazılıyor');
  t.assertEqual(Number(details.salary_min), 30000, 'Maaş bilgisi doğru kaydediliyor');

  // --- Asil mesele: zincirin ortasi kirilirsa geriye hicbir sey kalmamali.
  // Nitelik degeri baglanamayan bir tur oldugunda yazma islemin ortasinda
  // patlar; ilan satiri o noktada zaten eklenmis olur.
  const doomedSlug = 'yarim-kalmasi-gereken-ilan';
  let threw = false;

  try {
    await Listing.create({
      user_id: seller, category_id: 301, title: 'Yarım Kalacak',
      slug: doomedSlug, description: 'Bu ilan hiç var olmamalı',
      status: 'active', city: 'Girne',
      images: ['/uploads/listings/c.webp'],
      attributes: { rooms: '3+1', bozuk: { baglanamaz: true } }
    });
  } catch (error) {
    threw = true;
  }

  t.assert(threw, 'Yazılamayan nitelik hata fırlatıyor');

  const leftover = db.prepare('SELECT id FROM listings WHERE slug = ?').get([doomedSlug]);
  t.assertEqual(leftover, undefined, 'Başarısız oluşturmadan geriye ilan kalmıyor');

  const orphanImages = db.prepare(
    'SELECT COUNT(*) AS count FROM listing_images WHERE image_url = ?'
  ).get(['/uploads/listings/c.webp']).count;
  t.assertEqual(orphanImages, 0, 'Başarısız oluşturmadan geriye görsel kaydı kalmıyor');

  const orphanAttrs = db.prepare(
    "SELECT COUNT(*) AS count FROM listing_attributes WHERE attribute_key = 'rooms' AND attribute_value = '3+1'"
  ).get().count;
  t.assertEqual(orphanAttrs, 0, 'Başarısız oluşturmadan geriye nitelik kalmıyor');
});
