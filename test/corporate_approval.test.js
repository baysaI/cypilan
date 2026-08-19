const t = require('./helpers');
const User = require('../models/User');
const Notification = require('../models/Notification');
const listingController = require('../controllers/listingController');
const adminController = require('../controllers/adminController');

t.run('Kurumsal Hesap Kayıt, Yönetici Onay Süreci ve İlan Engeli', async (db) => {
  // 1. Bireysel Kayıt Testi
  const individualId = await User.create({
    email: 'bireysel@test.com',
    password: 'Password123',
    full_name: 'Ahmet Bireysel',
    role: 'user',
    corporate_status: 'none'
  });
  const individualUser = await User.findById(individualId);
  t.assertEqual(individualUser.role, 'user', 'Bireysel kayıt rolü user');
  t.assertEqual(individualUser.corporate_status, 'none', 'Bireysel kayıt corporate_status none');

  // 2. Kurumsal Kayıt Testi (Onay Bekliyor Durumu)
  const corporateId = await User.create({
    email: 'kurumsal@test.com',
    password: 'Password123',
    full_name: 'Mehmet Kurumsal',
    company_name: 'Akdeniz Gayrimenkul',
    corporate_status: 'pending',
    corporate_tax_no: 'TRNC-998877',
    corporate_applied_at: new Date().toISOString()
  });
  const corporateUser = await User.findById(corporateId);
  t.assertEqual(corporateUser.role, 'user', 'Kurumsal başvuran kullanıcı ilk başta user rolünde kalır');
  t.assertEqual(corporateUser.corporate_status, 'pending', 'Kurumsal başvuran kullanıcının corporate_status değeri pending');
  t.assertEqual(corporateUser.company_name, 'Akdeniz Gayrimenkul', 'Firma adı doğru kaydedildi');
  t.assertEqual(corporateUser.corporate_tax_no, 'TRNC-998877', 'Vergi/sicil no doğru kaydedildi');

  // 3. Bekleyen Kurumsal Başvuru Sayısı
  const pendingCount = await User.countPendingCorporate();
  t.assert(pendingCount >= 1, 'countPendingCorporate en az 1 bekleyen kurumsal başvuru buldu');

  // 4. Kurumsal Onay Bekleyen Filtrelemesi (User.findAll)
  const pendingList = await User.findAll(1, 20, { role: 'pending_corporate' });
  const foundPending = pendingList.data.find(u => u.id === corporateId);
  t.assert(Boolean(foundPending), 'findAll pending_corporate filtresi kurumsal başvuran kullanıcıyı getirdi');
  t.assertEqual(foundPending.corporate_status, 'pending', 'Dönen kaydın corporate_status değeri pending');

  // 5. Onay Bekleyen Kurumsal Kullanıcının İlan Verme Sayfası Engeli (showCreate)
  let redirectedTo = null;
  let flashMessages = [];
  const mockReq = {
    session: { userId: corporateId, userRole: 'user' },
    flash: (type, msg) => { flashMessages.push({ type, msg }); }
  };
  const mockRes = {
    locals: { meta: {} },
    redirect: (url) => { redirectedTo = url; },
    render: () => { throw new Error('Render edilmemeliydi!'); }
  };
  await listingController.showCreate(mockReq, mockRes, () => {});
  t.assertEqual(redirectedTo, '/profile', 'Onay bekleyen kurumsal kullanıcı profil sayfasına yönlendirildi');
  t.assert(flashMessages.some(f => f.msg === 'flash.corporate_pending_approval'), 'corporate_pending_approval flash mesajı verildi');

  // 6. Onay Bekleyen Kurumsal Kullanıcının İlan Gönderme Engeli (create)
  redirectedTo = null;
  flashMessages = [];
  const mockCreateReq = {
    session: { userId: corporateId, userRole: 'user' },
    body: { title: 'Test İlanı', category_id: 1, city: 'Lefkoşa', price: 1000, phone: '05331234567' },
    flash: (type, msg) => { flashMessages.push({ type, msg }); }
  };
  await listingController.create(mockCreateReq, mockRes, () => {});
  t.assertEqual(redirectedTo, '/profile', 'İlan gönderimi engellenip /profile sayfasına yönlendirildi');

  // 7. Admin Tarafından Kurumsala Onaylama Testi (approveCorporate)
  const approved = await User.approveCorporate(corporateId, 'business');
  t.assert(approved, 'approveCorporate işlemi başarılı döndü');
  const approvedUser = await User.findById(corporateId);
  t.assertEqual(approvedUser.role, 'business', 'Kullanıcının rolü business oldu');
  t.assertEqual(approvedUser.corporate_status, 'approved', 'Kullanıcının corporate_status değeri approved oldu');

  // 8. Admin Reddetme Testi
  const rejectedUserId = await User.create({
    email: 'reddedilecek@test.com',
    password: 'Password123',
    full_name: 'Ali Red',
    company_name: 'Sahte Firma',
    corporate_status: 'pending'
  });
  await User.rejectCorporate(rejectedUserId);
  const rejectedUser = await User.findById(rejectedUserId);
  t.assertEqual(rejectedUser.role, 'user', 'Reddedilen kullanıcının rolü user kaldı');
  t.assertEqual(rejectedUser.corporate_status, 'rejected', 'corporate_status rejected oldu');

  // 9. Kurumsal Sayfası Render Testi (mailto kaldırıldı mı?)
  const corporatePageHtml = await t.render('pages/corporate.ejs', {
    currentUser: null,
    lang: 'tr'
  });
  t.assert(!corporatePageHtml.includes('mailto:kurumsal@cypilan.com'), 'Kurumsal sayfasında mailto adresi yer almıyor');
  t.assert(corporatePageHtml.includes('/auth/register?type=corporate'), 'Kurumsal kayıt bağlantısı mevcut');
});
