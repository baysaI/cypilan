const t = require('./helpers');

const listingController = require(t.rootDir + '/controllers/listingController');
const Category = require(t.rootDir + '/models/Category');
const User = require(t.rootDir + '/models/User');

t.run('İlan oluşturma formu veri koruma ve hata yönetimi', async (db) => {
  const userId = t.makeUser(db, 'seller@test.local', 'İlan Sahibi');

  // Test 1: create validation error saves req.body into session.listingFormData
  const reqFail = {
    session: { userId, userRole: 'user' },
    processedImages: [{ path: '/uploads/listings/test.jpg', filename: 'test.jpg' }],
    body: {
      category_id: '201',
      title: '2020 Model Temiz Araç',
      price: '450000',
      currency: 'TRY',
      city: 'Girne',
      district: 'Alsancak',
      phone: '0533 123 4567',
      hide_phone: '1',
      collect_bids: '1',
      description: 'Kısa açıklama' // Less than MIN_DESCRIPTION_LENGTH (20 chars)
    },
    flash: (type, message, params) => {
      reqFail._flash = { type, message, params };
    }
  };

  let redirectedTo = null;
  const resFail = {
    redirect: (url) => {
      redirectedTo = url;
    }
  };

  await listingController.create(reqFail, resFail, () => {});

  t.assertEqual(redirectedTo, '/listings/create', 'Eksik bilgide ilan oluşturma sayfasına yönlendirildi');
  t.assertEqual(reqFail._flash.message, 'flash.description_too_short', 'Açıklama kısa uyarısı verildi');
  t.assert(Boolean(reqFail.session.listingFormData), 'Girilen form verileri session\'a kaydedildi');
  t.assertEqual(reqFail.session.listingFormData.title, '2020 Model Temiz Araç', 'Başlık session\'da korundu');
  t.assertEqual(reqFail.session.listingFormData.price, '450000', 'Fiyat session\'da korundu');
  t.assertEqual(reqFail.session.listingFormData.district, 'Alsancak', 'İlçe session\'da korundu');

  // Test 2: showCreate consumes listingFormData and passes it to view
  let renderedView = null;
  let renderedData = null;
  const resShow = {
    locals: {
      t: (key) => key
    },
    render: (view, data) => {
      renderedView = view;
      renderedData = data;
    }
  };

  await listingController.showCreate(reqFail, resShow, () => {});

  t.assertEqual(renderedView, 'listings/create', 'listings/create view çağrıldı');
  t.assert(Boolean(renderedData.formData), 'formData view parametrelerine aktarıldı');
  t.assertEqual(renderedData.formData.title, '2020 Model Temiz Araç', 'formData içindeki başlık korundu');
  t.assertEqual(renderedData.formData.category_id, '201', 'formData içindeki kategori korundu');
  t.assert(!reqFail.session.listingFormData, 'session.listingFormData view yüklendikten sonra temizlendi');

  // Test 3: create.ejs renders with formData correctly
  const categories = await Category.getAll();
  const html = await t.render('listings/create.ejs', {
    categories,
    formData: {
      category_id: 201,
      title: '2020 Model Temiz Araç',
      price: 450000,
      currency: 'TRY',
      city: 'Girne',
      district: 'Alsancak',
      phone: '0533 123 4567',
      hide_phone: '1',
      collect_bids: '1',
      description: 'Daha önce girilmiş uzun açıklama metni burada korunuyor.'
    },
    draftFeatureMap: { vasita: ['otomatik', 'manuel'] },
    draftFeatureLabels: { otomatik: 'Otomatik vites', manuel: 'Manuel vites' },
    quota: { limit: 3, used: 0, remaining: 3, categories: ['emlak', 'vasita', 'ikinci-el'], freeCategories: [] }
  });

  t.assert(html.includes('2020 Model Temiz Araç'), 'İlan başlığı HTML formunda korundu');
  t.assert(html.includes('450000'), 'Fiyat HTML formunda korundu');
  t.assert(html.includes('Alsancak'), 'İlçe HTML formunda korundu');
  t.assert(html.includes('Daha önce girilmiş uzun açıklama metni burada korunuyor.'), 'Açıklama HTML formunda korundu');
  t.assert(html.includes('invalid-feedback'), 'Gerekli doğrulama geri bildirimleri (invalid-feedback) eklendi');
});
