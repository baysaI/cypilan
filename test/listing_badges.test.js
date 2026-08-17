const t = require('./helpers');

const Listing = require(t.rootDir + '/models/Listing');
const listingBadges = require(t.rootDir + '/config/listingBadges');

t.run('Acil / Fırsat / Pazarlıklı rozetleri', async (db) => {
  const seller = t.makeUser(db, 'seller@test.local', 'Satıcı');

  // --- Migrasyon
  const columns = db.pragma('table_info(listings)').map((column) => column.name);
  listingBadges.COLUMNS.forEach((column) => {
    t.assert(columns.includes(column), `listings.${column} kolonu mevcut`);
  });

  // --- Form gövdesinden kolon değerlerine
  const ticked = listingBadges.fromBody({ badge_urgent: '1', badge_negotiable: '1' });
  t.assertEqual(ticked.is_urgent, 1, 'İşaretlenen rozet 1 olarak okunuyor');
  t.assertEqual(ticked.is_opportunity, 0, 'İşaretlenmeyen rozet 0 olarak okunuyor');
  t.assertEqual(ticked.is_negotiable, 1, 'Birden fazla rozet birlikte işaretlenebiliyor');

  // Formda olmayan alanlar bu kapıdan geçmemeli
  const hostile = listingBadges.fromBody({ is_premium: '1', is_featured: '1', badge_urgent: '1' });
  t.assertEqual(hostile.is_premium, undefined, 'Ücretli is_premium alanı rozet kapısından geçmiyor');
  t.assertEqual(hostile.is_featured, undefined, 'Ücretli is_featured alanı rozet kapısından geçmiyor');
  t.assertEqual(Object.keys(hostile).length, listingBadges.COLUMNS.length, 'Sadece tanımlı rozet kolonları dönüyor');

  // --- Kaydetme
  const listing = await Listing.create({
    user_id: seller, category_id: 102, title: 'Acil Kiralık', slug: 'acil-kiralik',
    description: 'Acil devren kiralık daire.', price: 12000, status: 'active', city: 'Girne',
    ...listingBadges.fromBody({ badge_urgent: '1', badge_opportunity: '1' })
  });

  t.assertEqual(Number(listing.is_urgent), 1, 'Rozet ilan oluşturmada kaydediliyor');
  t.assertEqual(Number(listing.is_opportunity), 1, 'İkinci rozet de kaydediliyor');
  t.assertEqual(Number(listing.is_negotiable), 0, 'İşaretlenmeyen rozet varsayılan 0');

  // Duzenlemede kaldirma: fromBody her zaman uc kolonu da yazar
  await Listing.update(listing.id, listingBadges.fromBody({ badge_negotiable: '1' }));
  const afterEdit = await Listing.findById(listing.id);
  t.assertEqual(Number(afterEdit.is_urgent), 0, 'İşareti kaldırılan rozet düzenlemede siliniyor');
  t.assertEqual(Number(afterEdit.is_negotiable), 1, 'Yeni işaretlenen rozet düzenlemede ekleniyor');

  // --- activeFor: pazarlik fiyati olmayan ilanda gosterilmez
  t.assertEqual(
    listingBadges.activeFor({ is_urgent: 1, is_negotiable: 1, price: 5000 }).length,
    2,
    'Fiyatı olan ilanda pazarlıklı rozeti geçerli'
  );
  const priceless = listingBadges.activeFor({ is_urgent: 1, is_negotiable: 1, price: null });
  t.assertEqual(priceless.length, 1, 'Fiyatsız ilanda pazarlıklı rozeti gösterilmiyor');
  t.assertEqual(priceless[0].key, 'urgent', 'Fiyattan bağımsız rozet gösterilmeye devam ediyor');
  t.assertEqual(listingBadges.activeFor({}).length, 0, 'Rozetsiz ilan boş liste döndürüyor');

  // --- Filtreleme
  await Listing.create({
    user_id: seller, category_id: 102, title: 'Sıradan Kiralık', slug: 'siradan-kiralik',
    description: 'Normal bir kiralık daire.', price: 9000, status: 'active', city: 'Girne'
  });

  const urgentOnly = await Listing.search({ badge: 'urgent' }, 1, 20);
  t.assertEqual(urgentOnly.total, 0, 'Rozeti kaldırılan ilan artık acil filtresine düşmüyor');

  const negotiable = await Listing.search({ badge: 'negotiable' }, 1, 20);
  t.assertEqual(negotiable.total, 1, 'Pazarlıklı filtresi doğru ilanı buluyor');
  t.assertEqual(negotiable.data[0].slug, 'acil-kiralik', 'Filtre doğru kaydı döndürüyor');

  const all = await Listing.search({}, 1, 20);
  t.assertEqual(all.total, 2, 'Filtre yokken bütün ilanlar listeleniyor');

  // Bilinmeyen rozet hicbir sey dondurmeli: SQL'e kolon adi olarak sizmamali
  const bogus = await Listing.search({ badge: 'is_premium' }, 1, 20);
  t.assertEqual(bogus.total, 0, 'Bilinmeyen rozet anahtarı hiçbir ilan döndürmüyor');
  const injection = await Listing.search({ badge: "1=1 OR '1'='1" }, 1, 20);
  t.assertEqual(injection.total, 0, 'Enjeksiyon denemesi sonuç döndürmüyor');
  t.assert(!listingBadges.isKnownKey('is_premium'), 'is_premium geçerli rozet anahtarı değil');

  // Fiyatsiz bir ilan pazarlikli isaretlense de o filtreye dusmemeli
  const jobListing = await Listing.create({
    user_id: seller, category_id: 301, title: 'Acil Personel', slug: 'acil-personel',
    description: 'Acil olarak personel aranıyor.', status: 'active', city: 'Lefkoşa',
    ...listingBadges.fromBody({ badge_negotiable: '1', badge_urgent: '1' })
  });
  const negotiableAgain = await Listing.search({ badge: 'negotiable' }, 1, 20);
  t.assert(
    !negotiableAgain.data.some((row) => row.id === jobListing.id),
    'Fiyatsız ilan pazarlıklı filtresine düşmüyor (rozeti gösterilmediği için)'
  );
  const urgentAgain = await Listing.search({ badge: 'urgent' }, 1, 20);
  t.assert(
    urgentAgain.data.some((row) => row.id === jobListing.id),
    'Fiyatsız ilan acil filtresine düşüyor (iş ilanı da acil olabilir)'
  );

  // --- Siralamayi degistirmemeli
  // Rozetli iki ilan rozetsizden daha ESKI: rozet bir siralama avantaji olsaydi
  // yine de basa gecerlerdi.
  db.prepare("UPDATE listings SET created_at = '2026-01-01 00:00:00' WHERE slug = 'acil-personel'").run();
  db.prepare("UPDATE listings SET created_at = '2026-02-01 00:00:00' WHERE slug = 'acil-kiralik'").run();
  db.prepare("UPDATE listings SET created_at = '2026-06-01 00:00:00' WHERE slug = 'siradan-kiralik'").run();

  const ordered = await Listing.search({}, 1, 20);
  t.assertEqual(
    ordered.data[0].slug,
    'siradan-kiralik',
    'Rozet sıralamayı etkilemiyor: rozetsiz ama yeni ilan hâlâ başta'
  );

  // --- Sablonlar
  const cardHtml = await t.render('partials/listingCard.ejs', {
    listing: await Listing.findBySlug('acil-kiralik')
  });
  t.assert(cardHtml.includes('Pazarlıklı'), 'İlan kartı rozeti basıyor');
  t.assert(!cardHtml.includes('Acil Satılık'), 'Kaldırılan rozet kartta görünmüyor');

  const plainCard = await t.render('partials/listingCard.ejs', {
    listing: await Listing.findBySlug('siradan-kiralik')
  });
  t.assert(!plainCard.includes('Pazarlıklı') && !plainCard.includes('Fırsat'), 'Rozetsiz kart temiz');

  const detail = await Listing.findDetailBySlug('acil-kiralik');
  const showHtml = await t.render('listings/show.ejs', {
    listing: detail, isFavorited: false,
    sellerRating: { total: 0, average: 0, distribution: {} },
    bidSummary: { total: 0, best_amount: null },
    openServiceRequests: {}, offeredServices: ['assurance']
  });
  t.assert(showHtml.includes('Pazarlıklı'), 'Detay sayfası rozeti basıyor');
  t.assert(showHtml.includes('/listings?badge=negotiable'), 'Detaydaki rozet filtreye bağlanıyor');

  const pickerHtml = await t.render('partials/badgePicker.ejs', { current: detail, idPrefix: 'x_' });
  t.assert(pickerHtml.includes('name="badge_urgent"'), 'Form rozet kutularını basıyor');
  t.assert(pickerHtml.includes('id="x_badge_negotiable" checked'), 'Mevcut rozet formda işaretli geliyor');

  // Sablon nitelikleri satirlara boluyor, bu yuzden bosluklar tek boşluğa indirilir.
  const filterHtml = (await t.render('partials/badgeFilter.ejs', { selectedBadge: 'urgent', idPrefix: 'f_' }))
    .replace(/\s+/g, ' ');
  t.assert(filterHtml.includes('id="f_badge_urgent" checked'), 'Filtrede seçili rozet işaretli');
  t.assert(filterHtml.includes('id="f_badge_any" >') || filterHtml.includes('id="f_badge_any">'), 'Filtre "tümü" seçeneği seçili değil');
  t.assert(!filterHtml.includes('id="f_badge_negotiable" checked'), 'Seçilmeyen rozet filtrede işaretli değil');

  const langs = ['tr', 'en', 'el', 'ru', 'fa'].every((lang) =>
    listingBadges.KEYS.concat(['any', 'picker_title', 'picker_help', 'picker_warning', 'filter_label'])
      .every((suffix) => t.translate('listing.badge_' + suffix, lang) !== 'listing.badge_' + suffix)
  );
  t.assert(langs, 'Rozet metinleri 5 dilde çözülüyor');
});
