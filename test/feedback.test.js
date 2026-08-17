const t = require('./helpers');

const Feedback = require(t.rootDir + '/models/Feedback');
const feedbackController = require(t.rootDir + '/controllers/feedbackController');

// Enough of a req/res to drive the controller the way Express would.
const makeReq = (overrides = {}) => Object.assign({
  session: {},
  body: {},
  query: {},
  params: {},
  flash(type, message, params) {
    this.flashes.push({ type, message, params });
  },
  flashes: [],
  get: () => null
}, overrides);

const makeRes = () => ({
  locals: { meta: {} },
  redirectedTo: null,
  redirect(url) { this.redirectedTo = url; },
  render(view, locals) { this.rendered = { view, locals }; }
});

t.run('Öneri / Hata bildirimi', async (db) => {
  const member = t.makeUser(db, 'member@test.local', 'Üye');

  // --- Tablo
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'feedback'").all();
  t.assertEqual(tables.length, 1, 'feedback tablosu şemada oluşuyor');

  // --- Ziyaretci gonderimi (giris gerekmiyor)
  const visitorReq = makeReq({
    body: {
      type: 'bug',
      message: 'Kiralık daire filtresinde şehir seçimi çalışmıyor.',
      contact_email: 'Ziyaretci@Ornek.COM',
      page_url: '/listings?category=emlak'
    }
  });
  const visitorRes = makeRes();
  await feedbackController.submit(visitorReq, visitorRes);

  t.assert(
    visitorReq.flashes.some((flash) => flash.type === 'success'),
    'Ziyaretçi bildirimi kabul ediliyor'
  );
  t.assertEqual(visitorRes.redirectedTo, '/listings?category=emlak', 'Gönderim sonrası aynı sayfaya dönülüyor');

  const stored = (await Feedback.findAll({}, 1, 10)).data[0];
  t.assertEqual(stored.type, 'bug', 'Bildirim türü kaydediliyor');
  t.assertEqual(stored.user_id, null, 'Ziyaretçi bildirimi üyeye bağlanmıyor');
  t.assertEqual(stored.contact_email, 'ziyaretci@ornek.com', 'E-posta küçük harfe indirilerek saklanıyor');
  t.assertEqual(stored.page_url, '/listings?category=emlak', 'Bildirimin geldiği sayfa saklanıyor');
  t.assertEqual(stored.status, 'new', 'Yeni bildirim "new" durumunda başlıyor');

  // --- Uye gonderimi kimlige baglanir
  const memberReq = makeReq({
    session: { userId: member },
    body: { type: 'suggestion', message: 'Favorilere not ekleme özelliği olsa harika olurdu.', page_url: '/panel' }
  });
  await feedbackController.submit(memberReq, makeRes());

  const memberEntry = (await Feedback.findAll({ type: 'suggestion' }, 1, 10)).data[0];
  t.assertEqual(memberEntry.user_id, member, 'Üye bildirimi hesaba bağlanıyor');
  t.assertEqual(memberEntry.user_name, 'Üye', 'Admin listesi gönderenin adını çözüyor');

  // --- Dogrulama
  const shortReq = makeReq({ body: { type: 'bug', message: 'yok', page_url: '/' } });
  await feedbackController.submit(shortReq, makeRes());
  t.assert(
    shortReq.flashes.some((flash) => flash.type === 'error' && flash.message === 'flash.feedback_too_short'),
    'Çok kısa mesaj reddediliyor'
  );

  const badEmailReq = makeReq({
    body: { type: 'bug', message: 'Yeterince uzun bir hata açıklaması.', contact_email: 'bu-bir-eposta-degil', page_url: '/' }
  });
  await feedbackController.submit(badEmailReq, makeRes());
  t.assert(
    badEmailReq.flashes.some((flash) => flash.message === 'flash.invalid_email'),
    'Geçersiz e-posta reddediliyor (gönderen yanıt beklediği için sessiz geçilmiyor)'
  );

  const bogusTypeReq = makeReq({
    body: { type: 'apocalypse', message: 'Tanımsız tür ile gönderilen bildirim.', page_url: '/' }
  });
  await feedbackController.submit(bogusTypeReq, makeRes());
  const fallback = (await Feedback.findAll({ type: 'other' }, 1, 10)).data[0];
  t.assert(Boolean(fallback), 'Tanımsız tür "other" olarak kaydediliyor, kayıp olmuyor');

  t.assertEqual((await Feedback.findAll({}, 1, 50)).total, 3, 'Reddedilen gönderimler tabloya yazılmıyor');

  // --- page_url yalnizca site ici yol olabilir
  t.assertEqual(feedbackController.safePagePath('/listings'), '/listings', 'Site içi yol kabul ediliyor');
  t.assertEqual(feedbackController.safePagePath('https://kotu-site.example/x'), null, 'Dış bağlantı reddediliyor');
  t.assertEqual(feedbackController.safePagePath('//kotu-site.example'), null, 'Protokol-göreli dış bağlantı reddediliyor');
  t.assertEqual(feedbackController.safePagePath('javascript:alert(1)'), null, 'javascript: şeması reddediliyor');

  const evilReq = makeReq({
    body: { type: 'bug', message: 'Dış bağlantı denemesi içeren bildirim.', page_url: 'https://kotu-site.example' }
  });
  const evilRes = makeRes();
  await feedbackController.submit(evilReq, evilRes);
  // Mesajdan aranıyor: aynı saniye içindeki kayıtlarda "en yeni" tek başına
  // hangi satır olduğunu belirlemez.
  const evilEntry = (await Feedback.findAll({}, 1, 50)).data
    .find((row) => row.message.startsWith('Dış bağlantı denemesi'));
  t.assert(Boolean(evilEntry), 'Bildirim kaydedildi');
  t.assertEqual(evilEntry.page_url, null, 'Dış bağlantı page_url olarak saklanmıyor');
  t.assertEqual(evilRes.redirectedTo, '/', 'Dış bağlantıya yönlendirme yapılmıyor');

  // --- Admin kuyrugu
  const counts = await Feedback.countByStatus();
  t.assertEqual(counts.new, 4, 'Yeni bildirim sayacı doğru');
  t.assertEqual(await Feedback.countNew(), 4, 'Kenar çubuğu sayacı doğru');

  await Feedback.setStatus(stored.id, 'resolved', 'Filtre hatası giderildi.');
  const resolved = (await Feedback.findAll({ status: 'resolved' }, 1, 10)).data[0];
  t.assertEqual(resolved.id, stored.id, 'Durum filtresi çalışıyor');
  t.assertEqual(resolved.admin_note, 'Filtre hatası giderildi.', 'Yönetici notu saklanıyor');
  t.assertEqual(await Feedback.countNew(), 3, 'Çözülen bildirim yeni sayacından düşüyor');

  // Not gonderilmeden durum degistirmek mevcut notu silmemeli
  await Feedback.setStatus(stored.id, 'read', null);
  const afterReopen = (await Feedback.findAll({ status: 'read' }, 1, 10)).data[0];
  t.assertEqual(afterReopen.admin_note, 'Filtre hatası giderildi.', 'Boş not mevcut notu ezmiyor');

  let threw = false;
  try {
    await Feedback.setStatus(stored.id, 'kapatildi');
  } catch (error) {
    threw = true;
  }
  t.assert(threw, 'Tanımsız durum reddediliyor');

  // --- Sablonlar
  const queryRes = makeRes();
  await feedbackController.adminQueue(makeReq({ query: {} }), queryRes);
  t.assertEqual(queryRes.rendered.view, 'admin/feedback', 'Admin kuyruğu doğru şablonu render ediyor');

  const adminHtml = await t.render('admin/feedback.ejs', Object.assign({
    activePage: 'feedback', title: 'test'
  }, queryRes.rendered.locals));
  t.assert(adminHtml.includes('Kiralık daire filtresinde'), 'Admin sayfası bildirim metnini basıyor');
  t.assert(adminHtml.includes('ziyaretci@ornek.com'), 'Ziyaretçinin iletişim adresi görünüyor');
  t.assert(adminHtml.includes('/admin/geri-bildirim/' + stored.id + '/durum'), 'Durum güncelleme formu var');
  t.assert(adminHtml.includes('Filtre hatası giderildi.'), 'Yönetici notu listede görünüyor');

  const modalHtml = await t.render('partials/feedbackModal.ejs', { currentPath: '/listings' });
  t.assert(modalHtml.includes('action="/geri-bildirim"'), 'Modal formu doğru uca gönderiyor');
  t.assert(modalHtml.includes('name="_csrf"'), 'Modal CSRF alanı içeriyor');
  t.assert(modalHtml.includes('value="/listings"'), 'Modal bulunulan sayfayı taşıyor');
  t.assert(modalHtml.includes('name="contact_email"'), 'Ziyaretçiye e-posta alanı gösteriliyor');

  const memberModal = await t.render('partials/feedbackModal.ejs', {
    currentPath: '/panel', currentUser: { id: member, name: 'Üye' }
  });
  t.assert(!memberModal.includes('name="contact_email"'), 'Girişli üyeye e-posta alanı sorulmuyor');

  const langs = ['tr', 'en', 'el', 'ru', 'fa'].every((lang) =>
    ['feedback.title', 'feedback.intro', 'feedback.submit', 'feedback.type_bug', 'flash.feedback_received']
      .every((key) => t.translate(key, lang) !== key)
  );
  t.assert(langs, 'Geri bildirim metinleri 5 dilde çözülüyor');
});
