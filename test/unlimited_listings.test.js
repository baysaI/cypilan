const t = require('./helpers');
const path = require('path');
const Setting = require(t.rootDir + '/models/Setting');
const listingPolicy = require(t.rootDir + '/config/listingPolicy');
const Listing = require(t.rootDir + '/models/Listing');
const Category = require(t.rootDir + '/models/Category');
const maintenanceController = require(t.rootDir + '/controllers/maintenanceController');

t.run('Sınırsız İlan Modu & Opsiyonel İş İlanı Ücreti', async (db) => {
  // 1. Setting and Default State
  Setting.clearCache();
  t.assertEqual(
    Setting.getBool(Setting.KEYS.UNLIMITED_LISTINGS_MODE, false),
    false,
    'Sınırsız ilan modu varsayılan olarak kapalıdır'
  );

  // 2. Listing Policy Evaluation under Default Quota Mode (3 free limit)
  const quotaEvalBlocked = listingPolicy.evaluate({
    role: 'user',
    rootSlug: 'emlak',
    usedCount: 3,
    isUnlimited: false
  });
  t.assertEqual(quotaEvalBlocked.allowed, false, '3 ilan kullanılmışken standart modda 4. ilan engellenir');
  t.assertEqual(quotaEvalBlocked.remaining, 0, 'Kalan hak 0 döner');

  const quotaEvalAllowed = listingPolicy.evaluate({
    role: 'user',
    rootSlug: 'emlak',
    usedCount: 2,
    isUnlimited: false
  });
  t.assertEqual(quotaEvalAllowed.allowed, true, '2 ilan kullanılmışken standart modda ilan verilebilir');
  t.assertEqual(quotaEvalAllowed.remaining, 1, 'Kalan hak 1 döner');

  // 3. Listing Policy Evaluation under Unlimited Mode
  const unlimitedEval = listingPolicy.evaluate({
    role: 'user',
    rootSlug: 'emlak',
    usedCount: 50,
    isUnlimited: true
  });
  t.assertEqual(unlimitedEval.allowed, true, 'Sınırsız modda 50 ilan açılmış olsa dahi izin verilir');
  t.assertEqual(unlimitedEval.isUnlimited, true, 'isUnlimited bayrağı true döner');
  t.assertEqual(unlimitedEval.remaining, null, 'Kalan hak null (sınırsız) döner');

  // 4. Admin Toggle updates Setting in DB
  const adminId = t.makeUser(db, 'admin@cypilan.test', 'Admin Test', 'admin');
  
  let flashType = null;
  let flashMsg = null;
  let redirectedTo = null;

  const mockReq = {
    body: { enabled: '1' },
    session: { userId: adminId },
    flash: (type, msg) => {
      flashType = type;
      flashMsg = msg;
    }
  };
  const mockRes = {
    redirect: (path) => {
      redirectedTo = path;
    }
  };

  await maintenanceController.updateUnlimited(mockReq, mockRes);
  t.assertEqual(
    Setting.getBool(Setting.KEYS.UNLIMITED_LISTINGS_MODE, false),
    true,
    'Admin sınırsız modu açtığında veritabanı ayarı 1 olur'
  );
  t.assertEqual(flashType, 'success', 'Başarılı flash mesajı verilir');
  t.assertEqual(flashMsg, 'flash.unlimited_mode_on', 'unlimited_mode_on mesaj anahtarı kullanılır');
  t.assertEqual(redirectedTo, '/admin/bakim', 'Ayarlar sayfasına yönlendirilir');

  // Turn it back off
  mockReq.body.enabled = '';
  await maintenanceController.updateUnlimited(mockReq, mockRes);
  t.assertEqual(
    Setting.getBool(Setting.KEYS.UNLIMITED_LISTINGS_MODE, false),
    false,
    'Admin sınırsız modu kapattığında veritabanı ayarı 0 olur'
  );
  t.assertEqual(flashMsg, 'flash.unlimited_mode_off', 'unlimited_mode_off mesaj anahtarı kullanılır');

  // 5. Job Listing Creation without Price / Salary
  const employer = t.makeUser(db, 'employer@test.local', 'Firma LTD', 'business');
  
  t.assertEqual(listingPolicy.requiresPrice('is-ilanlari'), false, 'İş ilanları kategorisinde fiyat zorunlu değildir');
  t.assertEqual(listingPolicy.requiresPrice('emlak'), true, 'Emlak kategorisinde fiyat zorunludur');
  t.assertEqual(listingPolicy.requiresPrice('vasita'), true, 'Vasıta kategorisinde fiyat zorunludur');

  const jobWithoutPrice = await Listing.create({
    user_id: employer,
    category_id: 301,
    title: 'Aşçı Yardımcısı Aranıyor',
    slug: 'asci-yardimcisi-aranin-123',
    description: 'Restoranımıza deneyimli aşçı yardımcısı arıyoruz. Maaş yüz yüze görüşülecektir.',
    price: null,
    currency: 'TRY',
    city: 'Lefkoşa',
    status: 'active'
  });

  t.assert(jobWithoutPrice && jobWithoutPrice.id, 'Fiyatsız iş ilanı başarıyla veritabanına kaydedildi');
  t.assertEqual(jobWithoutPrice.price, null, 'Kayıtlı fiyat null olarak tutuldu');

  // 6. Corporate roles (business & agent) always have unlimited listings even when unlimited mode is off
  const businessEval = listingPolicy.evaluate({
    role: 'business',
    rootSlug: 'emlak',
    usedCount: 100,
    isUnlimited: false
  });
  t.assertEqual(businessEval.allowed, true, 'Kurumsal işletme (business) 100 ilanı olsa bile daima ilan açabilir');
  t.assertEqual(businessEval.isUnlimited, true, 'isUnlimited true döner');

  const agentEval = listingPolicy.evaluate({
    role: 'agent',
    rootSlug: 'vasita',
    usedCount: 200,
    isUnlimited: false
  });
  t.assertEqual(agentEval.allowed, true, 'Acente danışmanı (agent) 200 ilanı olsa bile daima ilan açabilir');
  t.assertEqual(agentEval.isUnlimited, true, 'isUnlimited true döner');

  // 7. Category Tree and Optgroup Rendering in create.ejs
  const categoryTree = await Category.getTree();
  const createHtml = await t.render('listings/create.ejs', {
    categoryTree,
    categories: await Category.getAll(),
    formData: {},
    draftFeatureMap: { emlak: ['esyali', 'balkon', 'havuz'] },
    draftFeatureLabels: { esyali: 'Eşyalı', balkon: 'Balkonlu', havuz: 'Havuzlu' },
    quota: { limit: null, isUnlimited: true, categories: ['emlak'], freeCategories: [] }
  });
  t.assert(createHtml.includes('<optgroup label="Emlak">'), 'create.ejs Emlak için optgroup render ediyor');
  t.assert(createHtml.includes('<optgroup label="Vasıta">'), 'create.ejs Vasıta için optgroup render ediyor');
  t.assert(createHtml.includes('Satılık Daire'), 'Satılık Daire alt seçeneği optgroup içinde bulunuyor');

  // 8. Structured Attributes Saving and Rendering in show.ejs
  const propertyListing = await Listing.create({
    user_id: employer,
    category_id: 101, // Satılık Daire
    title: 'Lefkoşa Merkezde Geniş 3+1 Daire',
    slug: 'lefkosa-merkezde-genis-3-1-daire-test',
    description: 'Şehir merkezinde, hastaneye yakın, geniş ve aydınlık daire.',
    price: 120000,
    currency: 'GBP',
    city: 'Lefkoşa',
    district: 'Gönyeli',
    status: 'active'
  });

  await Listing.setAttributes(propertyListing.id, {
    rooms: '3+1',
    size: '145',
    floor: '3',
    build_year: '2021',
    features: 'esyali,balkon,havuz'
  });

  const detail = await Listing.findDetailBySlug('lefkosa-merkezde-genis-3-1-daire-test');
  t.assert(detail.attributes, 'findDetailBySlug attributes nesnesini yüklüyor');
  t.assertEqual(detail.attributes.rooms, '3+1', 'Oda sayısı yüklendi');
  t.assertEqual(detail.attributes.size, '145', 'Metrekare yüklendi');
  t.assertEqual(detail.attributes.floor, '3', 'Kat bilgisi yüklendi');
  t.assertEqual(detail.attributes.build_year, '2021', 'Yapım yılı yüklendi');

  const showHtml = await t.render('listings/show.ejs', {
    listing: detail,
    isFavorited: false,
    sellerRating: { avg: 5, count: 1 },
    bidSummary: { total: 0, best_amount: null },
    openServiceRequests: {},
    offeredServices: ['assurance']
  });

  t.assert(showHtml.includes('3+1'), 'show.ejs Oda sayısını (3+1) gösteriyor');
  t.assert(showHtml.includes('145 m²'), 'show.ejs Metrekareyi (145 m²) gösteriyor');
  t.assert(showHtml.includes('2021'), 'show.ejs Yapım yılını (2021) gösteriyor');
  t.assert(showHtml.includes('Eşyalı'), 'show.ejs Eşyalı rozetini gösteriyor');
  t.assert(showHtml.includes('Balkonlu'), 'show.ejs Balkonlu rozetini gösteriyor');
  t.assert(showHtml.includes('Havuzlu'), 'show.ejs Havuzlu rozetini gösteriyor');
});
