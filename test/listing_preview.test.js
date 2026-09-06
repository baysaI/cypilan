const t = require('./helpers');

const { buildPreviewListing } = require(t.rootDir + '/utils/listingPreview');

const EMLAK = { id: 102, slug: 'kiralik-daire', name_tr: 'Kiralık Daire' };
const IS_ILANI = { id: 301, slug: 'tam-zamanli', name_tr: 'Tam Zamanlı' };

t.run('İlan kartı önizlemesi', async () => {
  // --- Bos form bile bir kart uretebilmeli
  const bos = buildPreviewListing({}, { untitled: 'Başlıksız ilan' });
  t.assertEqual(bos.title, 'Başlıksız ilan', 'Başlık yokken yer tutucu metin kullanılıyor');
  t.assertEqual(bos.price, null, 'Fiyat yokken null (0 değil)');
  t.assertEqual(bos.image_count, 0, 'Fotoğraf sayısı sıfır');
  t.assert(Array.isArray(bos.images), 'images her zaman dizi');

  // --- Dolu form
  const dolu = buildPreviewListing({
    title: '  Girne merkezde 2+1 kiralık daire  ',
    price: '850',
    currency: 'GBP',
    city: 'Girne',
    district: 'Merkez',
    listing_type: 'rent',
    image_count: '4'
  }, { category: EMLAK, rootSlug: 'emlak', lang: 'tr', untitled: 'Başlıksız ilan' });

  t.assertEqual(dolu.title, 'Girne merkezde 2+1 kiralık daire', 'Başlıktaki boşluklar kırpılıyor');
  t.assertEqual(dolu.price, 850, 'Fiyat sayıya çevriliyor');
  t.assertEqual(dolu.image_count, 4, 'Fotoğraf sayısı sayıya çevriliyor');
  t.assertEqual(dolu.category_name, 'Kiralık Daire', 'Kategori adı geliyor');
  t.assertEqual(dolu.category_name_tr, 'Kiralık Daire', 'Kartın dile göre okuduğu alan da dolu');
  t.assertEqual(dolu.root_slug, 'emlak', 'Kök kategori rozet mantığı için taşınıyor');

  // --- Bozuk fiyat karta sifir olarak dusmemeli
  t.assertEqual(buildPreviewListing({ price: 'abc' }).price, null, 'Sayı olmayan fiyat null');
  t.assertEqual(buildPreviewListing({ price: '-5' }).price, null, 'Negatif fiyat null');
  t.assertEqual(buildPreviewListing({ price: '0' }).price, null, 'Sıfır fiyat null (kart "belirtilmemiş" yazsın)');

  // --- Rozetler
  const rozetli = buildPreviewListing({ is_urgent: true, is_swap: false });
  t.assertEqual(rozetli.is_urgent, 1, 'İşaretli rozet 1');
  t.assertEqual(rozetli.is_swap, 0, 'İşaretsiz rozet 0');

  // --- Kart, uretilen nesneyle gercekten render olmali
  //
  // Asil risk burasi: eksik bir alan sunucuda render hatasina donusuyor ve
  // onizleme kullaniciya sessizce hic gelmiyor. Bu yuzden test, sitenin gercek
  // kart partial'ini bu nesneyle basiyor.
  const html = await t.render('partials/listingCard.ejs', { listing: dolu, userFavoriteIds: [] });
  t.assert(html.includes('Girne merkezde 2+1 kiralık daire'), 'Kart başlığı basıyor');
  t.assert(html.includes('Girne, Merkez'), 'Kart konumu basıyor');
  t.assert(html.includes('Kiralık Daire'), 'Kart kategori rozetini basıyor');
  t.assert(!html.includes('undefined'), 'Kartta undefined yok');
  t.assert(!html.includes('NaN'), 'Kartta NaN yok');

  const bosHtml = await t.render('partials/listingCard.ejs', { listing: bos, userFavoriteIds: [] });
  t.assert(bosHtml.includes('Başlıksız ilan'), 'Boş formda da kart basılıyor');
  t.assert(!bosHtml.includes('NaN'), 'Boş kartta NaN yok');

  const isHtml = await t.render('partials/listingCard.ejs', {
    listing: buildPreviewListing({ title: 'Garson aranıyor', listing_type: 'job' },
      { category: IS_ILANI, rootSlug: 'is-ilanlari', untitled: 'Başlıksız ilan' }),
    userFavoriteIds: []
  });
  t.assert(isHtml.includes(t.translate('career.salary_unspecified', 'tr')), 'İş ilanında maaş metni doğru');

  // --- Kotu girdi karti dusurmemeli
  const kotu = buildPreviewListing({ title: '<script>alert(1)</script>', price: '999999999999' },
    { category: EMLAK, rootSlug: 'emlak', untitled: 'Başlıksız ilan' });
  const kotuHtml = await t.render('partials/listingCard.ejs', { listing: kotu, userFavoriteIds: [] });
  t.assert(kotuHtml.length > 0, 'Bozuk girdi kartı düşürmüyor');
  t.assert(!kotuHtml.includes('<script>alert(1)</script>'), 'Başlık kaçışı yapılıyor');

  // --- Bes dilde metinler
  const diller = ['tr', 'en', 'el', 'ru', 'fa'].every((lang) =>
    ['listing.preview_title', 'listing.preview_hint', 'listing.preview_untitled']
      .every((key) => t.translate(key, lang) !== key)
  );
  t.assert(diller, 'Önizleme metinleri 5 dilde çözülüyor');
});
