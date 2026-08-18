const t = require('./helpers');

t.run('Kategoriye Göre Dinamik İlan Amacı / Filtreleme (Emlak, Vasıta, İş, Hizmet, İkinci El)', async (db) => {
  const user = t.makeUser(db, 'cat_dynamic@test.local', 'Dinamik Kategori Test');

  // 1. listings/index.ejs Emlak Görünümü
  const emlakHtml = await t.render('listings/index.ejs', {
    listings: [],
    pagination: { currentPage: 1, totalPages: 1, totalItems: 0 },
    categories: [],
    filters: { category: 'emlak' },
    currentCategoryName: 'Emlak',
    currentRootSlug: 'emlak',
    userFavoriteIds: [],
    smartQuery: null,
    smartParsed: null,
    title: 'Emlak İlanları'
  });

  t.assert(emlakHtml.includes('type=sale'), 'Emlak sayfasında Satılık butonu var');
  t.assert(emlakHtml.includes('type=rent'), 'Emlak sayfasında Kiralık butonu var');
  t.assert(emlakHtml.includes('type=wanted'), 'Emlak sayfasında Arıyorum butonu var');

  // 2. listings/index.ejs Vasıta Görünümü
  const vasitaHtml = await t.render('listings/index.ejs', {
    listings: [],
    pagination: { currentPage: 1, totalPages: 1, totalItems: 0 },
    categories: [],
    filters: { category: 'vasita' },
    currentCategoryName: 'Vasıta',
    currentRootSlug: 'vasita',
    userFavoriteIds: [],
    smartQuery: null,
    smartParsed: null,
    title: 'Vasıta İlanları'
  });

  t.assert(vasitaHtml.includes('type=sale'), 'Vasıta sayfasında Satılık butonu var');
  t.assert(!vasitaHtml.includes('type=rent'), 'Vasıta sayfasında Kiralık butonu YOK');
  t.assert(!vasitaHtml.includes('type=wanted'), 'Vasıta sayfasında Arıyorum butonu YOK');

  // 3. listings/index.ejs İş İlanları Görünümü
  const isHtml = await t.render('listings/index.ejs', {
    listings: [],
    pagination: { currentPage: 1, totalPages: 1, totalItems: 0 },
    categories: [],
    filters: { category: 'is-ilanlari' },
    currentCategoryName: 'İş İlanları',
    currentRootSlug: 'is-ilanlari',
    userFavoriteIds: [],
    smartQuery: null,
    smartParsed: null,
    title: 'İş İlanları'
  });

  t.assert(!isHtml.includes('type=sale'), 'İş İlanları sayfasında Satılık butonu YOK');
  t.assert(!isHtml.includes('type=rent'), 'İş İlanları sayfasında Kiralık butonu YOK');
  t.assert(isHtml.includes('type=job'), 'İş İlanları sayfasında Eleman Arayanlar butonu var');
  t.assert(isHtml.includes('type=wanted'), 'İş İlanları sayfasında İş Arayanlar butonu var');

  // 4. listings/index.ejs Usta & Hizmetler Görünümü
  const ustaHtml = await t.render('listings/index.ejs', {
    listings: [],
    pagination: { currentPage: 1, totalPages: 1, totalItems: 0 },
    categories: [],
    filters: { category: 'usta-hizmetler' },
    currentCategoryName: 'Usta & Hizmetler',
    currentRootSlug: 'usta-hizmetler',
    userFavoriteIds: [],
    smartQuery: null,
    smartParsed: null,
    title: 'Usta & Hizmetler'
  });

  t.assert(!ustaHtml.includes('type=sale'), 'Usta & Hizmetler sayfasında Satılık butonu YOK');
  t.assert(!ustaHtml.includes('type=rent'), 'Usta & Hizmetler sayfasında Kiralık butonu YOK');
  t.assert(ustaHtml.includes('type=service'), 'Usta & Hizmetler sayfasında Hizmet Verenler butonu var');
  t.assert(ustaHtml.includes('type=wanted'), 'Usta & Hizmetler sayfasında Hizmet Arayanlar butonu var');

  // 5. listings/index.ejs İkinci El Görünümü
  const ikinciElHtml = await t.render('listings/index.ejs', {
    listings: [],
    pagination: { currentPage: 1, totalPages: 1, totalItems: 0 },
    categories: [],
    filters: { category: 'ikinci-el' },
    currentCategoryName: 'İkinci El',
    currentRootSlug: 'ikinci-el',
    userFavoriteIds: [],
    smartQuery: null,
    smartParsed: null,
    title: 'İkinci El'
  });

  t.assert(ikinciElHtml.includes('type=sale'), 'İkinci El sayfasında Satılık butonu var');
  t.assert(!ikinciElHtml.includes('type=rent'), 'İkinci El sayfasında Kiralık butonu YOK');
  t.assert(ikinciElHtml.includes('type=wanted'), 'İkinci El sayfasında Arıyorum butonu var');

  // 6. listings/edit.ejs Vasıta için sadece Satılık render ediyor
  const editVasitaHtml = await t.render('listings/edit.ejs', {
    listing: {
      id: 99,
      title: 'Satılık Araba',
      description: 'Temiz araba',
      price: 100000,
      currency: 'TRY',
      listing_type: 'sale',
      category_id: 201,
      location_city: 'Girne',
      status: 'active'
    },
    categories: [],
    categoryTree: [],
    draftFeatureMap: {},
    draftFeatureLabels: {},
    images: [],
    rootSlug: 'vasita',
    currentRootSlug: 'vasita',
    requiresPrice: true,
    requiresPhotos: true,
    ownerStatuses: ['active', 'sold', 'expired'],
    title: 'İlanı Düzenle'
  });

  t.assert(editVasitaHtml.includes('value="sale"'), 'Vasıta düzenleme sayfasında Satılık seçeneği var');
  t.assert(!editVasitaHtml.includes('value="rent"'), 'Vasıta düzenleme sayfasında Kiralık seçeneği yok');
  t.assert(!editVasitaHtml.includes('value="wanted"'), 'Vasıta düzenleme sayfasında Arıyorum seçeneği yok');
});
