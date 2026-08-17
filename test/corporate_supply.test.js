const t = require('./helpers');

const Category = require(t.rootDir + '/models/Category');
const Listing = require(t.rootDir + '/models/Listing');
const listingPolicy = require(t.rootDir + '/config/listingPolicy');
const smartSearch = require(t.rootDir + '/utils/smartSearch');
const listingDraft = require(t.rootDir + '/utils/listingDraft');

const ROOT = 'kurumsal-tedarikci';

t.run('Kurumsal Tedarikçi Ağı kategorisi', async (db) => {
  // --- Kategori agaci
  const root = await Category.getBySlug(ROOT);
  t.assert(Boolean(root) && root.parent_id === null, 'Kök kategori seed ile oluşuyor');
  t.assertEqual(root.name_tr, 'Kurumsal Tedarikçi Ağı', 'Türkçe adı doğru');

  const subcategories = await Category.getSubcategories(root.id);
  t.assert(subcategories.length === 10, `Alt kategoriler yükleniyor (${subcategories.length}/10)`);

  const named = subcategories.every((sub) => sub.name_en && sub.name_el && sub.name_ru && sub.name_fa);
  t.assert(named, 'Her alt kategori 5 dilde adlandırılmış');

  const building = await Category.getBySlug('insaat-malzemeleri');
  t.assertEqual(await Category.getRootSlug(building.id), ROOT, 'Alt kategori kökü doğru çözülüyor');

  t.assert(
    (await Category.getMainCategoriesWithCount()).some((cat) => cat.slug === ROOT),
    'Ana sayfa kategori listesinde görünüyor'
  );

  // --- Politika: kota disi, foto zorunlu, fiyat opsiyonel
  t.assert(listingPolicy.isAlwaysFree(ROOT), 'Ücretsiz kategoriler arasında');
  t.assert(!listingPolicy.usesQuota(ROOT), '3 ilanlık ücretsiz kotayı harcamıyor');
  t.assert(listingPolicy.requiresPhotos(ROOT), 'Fotoğraf zorunlu');
  t.assert(!listingPolicy.requiresPrice(ROOT), 'Fiyat opsiyonel (teklif usulü satış mümkün)');

  const exhausted = listingPolicy.evaluate({ role: 'user', rootSlug: ROOT, usedCount: 99 });
  t.assert(exhausted.allowed && exhausted.free, 'Kotası dolmuş bireysel kullanıcı da ilan açabiliyor');

  // Kota kategorileri etkilenmemis olmali
  t.assert(listingPolicy.requiresPrice('emlak'), 'Emlakta fiyat hâlâ zorunlu');
  t.assert(
    !listingPolicy.evaluate({ role: 'user', rootSlug: 'emlak', usedCount: 3 }).allowed,
    'Emlak kotası hâlâ işliyor'
  );

  // --- Kurumsal hesaplar listelemede once
  const individual = t.makeUser(db, 'birey@test.local', 'Bireysel Satıcı', 'user');
  const company = t.makeUser(db, 'firma@test.local', 'Tedarik A.Ş.', 'business');

  const makeListing = async (userId, categoryId, slug, createdAt) => {
    const listing = await Listing.create({
      user_id: userId, category_id: categoryId, title: slug, slug,
      description: 'Toptan tedarik açıklaması.', status: 'active', city: 'Girne'
    });
    db.prepare('UPDATE listings SET created_at = ? WHERE id = ?').run([createdAt, listing.id]);
    return listing;
  };

  // Bireyselin ilani daha yeni: kurumsal one cikmiyorsa o basta gorunur.
  const companyListing = await makeListing(company, 601, 'firma-cimento', '2026-01-01 00:00:00');
  const individualListing = await makeListing(individual, 602, 'birey-vida', '2026-06-01 00:00:00');

  const supplyResults = await Listing.search({ category: ROOT }, 1, 20);
  t.assertEqual(supplyResults.total, 2, 'Kategori aramada iki ilan da bulunuyor');
  t.assertEqual(
    supplyResults.data[0].id,
    companyListing.id,
    'Kurumsal hesabın ilanı daha eski olmasına rağmen başta'
  );

  const subResults = await Listing.search({ category: 'insaat-malzemeleri' }, 1, 20);
  t.assertEqual(subResults.data[0].id, companyListing.id, 'Alt kategori de kurumsal öncelikli sıralanıyor');

  // Fiyat siralamasi istendiginde kurumsal oncelik korunur, gerisi fiyata gore
  db.prepare('UPDATE listings SET price = 100 WHERE id = ?').run([companyListing.id]);
  db.prepare('UPDATE listings SET price = 5 WHERE id = ?').run([individualListing.id]);
  const byPrice = await Listing.search({ category: ROOT, sort: 'price_asc' }, 1, 20);
  t.assertEqual(
    byPrice.data[0].id,
    companyListing.id,
    'Fiyat sıralamasında da kurumsal önce, fiyat ondan sonra'
  );

  // --- Diger kategorilerin siralamasi degismemis olmali
  const oldCompanySecondHand = await makeListing(company, 501, 'firma-eski-tv', '2026-01-01 00:00:00');
  await makeListing(individual, 502, 'birey-yeni-koltuk', '2026-07-01 00:00:00');

  const secondHand = await Listing.search({ category: 'ikinci-el' }, 1, 20);
  t.assert(
    secondHand.data[0].slug === 'birey-yeni-koltuk',
    'İkinci elde sıralama hâlâ en yeniden eskiye (kurumsal önceliği yok)'
  );
  t.assert(
    secondHand.data.some((row) => row.id === oldCompanySecondHand.id),
    'Kurumsal ilan ikinci elde de listede, sadece öncelikli değil'
  );

  // --- Akilli arama
  const parsed = smartSearch.parse('Girne toptan inşaat malzemesi');
  t.assertEqual(parsed.filters.category, 'insaat-malzemeleri', 'Akıllı arama alt kategoriyi tanıyor');
  t.assertEqual(parsed.filters.city, 'Girne', 'Akıllı arama şehri tanıyor');
  t.assertEqual(smartSearch.parse('kurumsal tedarik').filters.category, ROOT, 'Kök kategori terimi tanınıyor');

  // Iskele bir sehir adi: makine terimleri onu yutmamali
  const iskele = smartSearch.parse("İskele'de 3+1 kiralık daire");
  t.assertEqual(iskele.filters.city, 'İskele', 'İskele şehir olarak ayrıştırılıyor');
  t.assertEqual(iskele.filters.category, 'kiralik-daire', 'İskele araması iş makinelerine düşmüyor');

  // --- Otomatik aciklama
  const features = listingDraft.featuresFor(ROOT);
  t.assert(features.length > 0, 'Kategoriye özel özellik listesi var');

  const draft = listingDraft.build({
    rootSlug: ROOT,
    categoryName: 'İnşaat Malzemeleri',
    cityName: 'Girne',
    features: ['toptan_fiyat', 'stoktan_teslim']
  }, (key, params) => t.translate(key, 'tr', params));

  t.assert(draft.includes('İnşaat Malzemeleri') && draft.includes('Girne'), 'Taslak kategori ve şehri kullanıyor');
  t.assert(draft.includes('Toptan fiyat'), 'Taslak işaretlenen özellikleri yazıyor');
  t.assert(!draft.includes('draft.'), 'Taslakta çözülmemiş çeviri anahtarı yok');

  // --- Sablonlar ve diller
  const headerHtml = await t.render('partials/header.ejs', {
    user: null, currentUser: null, unreadMessages: 0, unreadNotifications: 0,
    pendingBidCount: 0, pendingApplicationCount: 0, currentPath: '/', theme: 'light'
  });
  t.assert(headerHtml.includes('category=' + ROOT), 'Üst menüde kategori bağlantısı var');

  const footerHtml = await t.render('partials/footer.ejs', { currentPath: '/', theme: 'light' });
  t.assert(footerHtml.includes('category=' + ROOT), 'Alt menüde kategori bağlantısı var');

  const langs = ['tr', 'en', 'el', 'ru', 'fa'].every((lang) =>
    ['categories.corporate_supply', 'draft.kurumsal.opening', 'draft.features.toptan_fiyat']
      .every((key) => t.translate(key, lang) !== key)
  );
  t.assert(langs, 'Yeni kategori anahtarları 5 dilde çözülüyor');
});
