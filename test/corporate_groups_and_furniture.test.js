const t = require('./helpers');
const User = require('../models/User');
const Listing = require('../models/Listing');
const Category = require('../models/Category');
const Notification = require('../models/Notification');
const listingController = require('../controllers/listingController');

t.run('Kurumsal Sektörel Gruplama ve Mobilya/Giyim Kiralama Kısıtlaması', async (db) => {
  // 1. Kurumsal Hesap Sektör / Grup Kayıt Testi
  const realEstateUserId = await User.create({
    email: 'emlakofisi@cypilan.com',
    password: 'Password123',
    full_name: 'Ahmet Emlakçı',
    company_name: 'Lefkoşa Gayrimenkul',
    role: 'business',
    corporate_status: 'approved',
    corporate_type: 'real_estate'
  });

  const autoGalleryUserId = await User.create({
    email: 'otogaleri@cypilan.com',
    password: 'Password123',
    full_name: 'Mehmet Galerici',
    company_name: 'Girne Auto Center',
    role: 'business',
    corporate_status: 'approved',
    corporate_type: 'auto'
  });

  const realEstateUser = await User.findById(realEstateUserId);
  const autoGalleryUser = await User.findById(autoGalleryUserId);

  t.assertEqual(realEstateUser.corporate_type, 'real_estate', 'Emlak kullanıcısının corporate_type değeri real_estate');
  t.assertEqual(autoGalleryUser.corporate_type, 'auto', 'Galerici kullanıcısının corporate_type değeri auto');

  // 2. Admin Kullanıcı Filtreleme (corporate_type ile)
  const realEstateList = await User.findAll(1, 20, { corporate_type: 'real_estate' });
  const foundRealEstate = realEstateList.data.find(u => u.id === realEstateUserId);
  const foundAutoInRealEstate = realEstateList.data.find(u => u.id === autoGalleryUserId);

  t.assert(Boolean(foundRealEstate), 'corporate_type = real_estate filtresi emlakçıyı getirdi');
  t.assert(!foundAutoInRealEstate, 'corporate_type = real_estate filtresinde galerici yer almadı');

  const autoList = await User.findAll(1, 20, { corporate_type: 'auto' });
  const foundAuto = autoList.data.find(u => u.id === autoGalleryUserId);
  t.assert(Boolean(foundAuto), 'corporate_type = auto filtresi galericiyi getirdi');

  // 3. Hedefli Teklif Bildirimi Testi (Notification.notifyCorporateGroup)
  await Notification.notifyCorporateGroup({
    corporate_type: 'auto',
    actor_id: 1,
    title: 'Yeni Araç Teklif Talebi 🚗',
    message: 'Honda Civic için araç sahibi galericilerden teklif bekliyor.',
    link_url: '/teklifler'
  });

  const autoNotifications = await Notification.getByUserId(autoGalleryUserId);
  const realEstateNotifications = await Notification.getByUserId(realEstateUserId);

  t.assert(autoNotifications.some(n => n.title.includes('Yeni Araç Teklif Talebi')), 'Galericiye araç teklif bildirimi ulaştı');
  t.assert(!realEstateNotifications.some(n => n.title.includes('Yeni Araç Teklif Talebi')), 'Emlakçıya araç teklif bildirimi gitmedi (hedefleme başarılı)');

  // 4. Mobilya ve Giyim Kategorisinde Kiralama Kısıtlaması (Backend)
  const mobilyaCat = await Category.getBySlug('mobilya');
  const giyimCat = await Category.getBySlug('giyim');

  if (mobilyaCat) {
    let redirectedTo = null;
    const mockReq = {
      session: { userId: 1, userRole: 'business' },
      processedImages: [{ filename: 'test.jpg', path: '/uploads/koltuk.jpg' }],
      body: {
        title: 'Lüks Köşe Koltuk Takımı İkinci El',
        category_id: mobilyaCat.id,
        listing_type: 'rent', // Kullanıcı kiralık göndermeyi denesin
        price: 5000,
        currency: 'TRY',
        phone: '05331234567',
        city: 'Lefkoşa',
        district: 'Gönyeli',
        description: 'Çok az kullanılmış temiz l koltuk takımı satılıktır.'
      },
      flash: () => {}
    };
    const mockRes = {
      redirect: (url) => { redirectedTo = url; }
    };

    await listingController.create(mockReq, mockRes, () => {});
    t.assert(Boolean(redirectedTo), 'Mobilya ilanı başarıyla oluşturuldu');

    // Oluşturulan ilanın listing_type değerinin otomatik 'sale' olduğunu doğrula
    const createdFurnitureListing = db.prepare('SELECT * FROM listings WHERE title = ?').get(['Lüks Köşe Koltuk Takımı İkinci El']);
    t.assert(Boolean(createdFurnitureListing), 'Mobilya ilanı veritabanında bulundu');
    t.assertEqual(createdFurnitureListing.listing_type, 'sale', 'Mobilya kategorisinde listing_type kiralık (rent) yerine satılık (sale) olarak normalize edildi');
  }

  // 5. Views Render Testleri
  const registerHtml = await t.render('auth/register.ejs', {
    fData: { accountType: 'corporate', corporateType: 'auto' },
    lang: 'tr',
    csrfToken: 'test'
  });
  t.assert(registerHtml.includes('corporateType'), 'register.ejs kurumsal sektör seçim alanını içeriyor');
  t.assert(registerHtml.includes('Oto Galeri'), 'register.ejs Oto Galeri seçeneğini render ediyor');

  const adminUsersHtml = await t.render('admin/users.ejs', {
    users: [realEstateUser, autoGalleryUser],
    pagination: { page: 1, totalItems: 2, totalPages: 1 },
    filters: { role: '', q: '', corporateType: '' },
    pendingReports: 0,
    warningCounts: {},
    warningHistory: {},
    suspensionThreshold: 3,
    reportReasons: [],
    activeAdminUser: { id: 999 },
    activePage: 'users',
    title: 'Kullanıcılar',
    lang: 'tr',
    csrfToken: 'test'
  });
  t.assert(adminUsersHtml.includes('Emlak Ofisleri'), 'admin/users.ejs filtre dropdownunda Emlak Ofisleri yer alıyor');
  t.assert(adminUsersHtml.includes('Oto Galerileri'), 'admin/users.ejs filtre dropdownunda Oto Galerileri yer alıyor');
  t.assert(adminUsersHtml.includes('editCorporateType'), 'admin/users.ejs düzenleme modalında editCorporateType alanı mevcut');
});
