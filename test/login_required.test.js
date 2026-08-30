const t = require('./helpers');

const Setting = require(t.rootDir + '/models/Setting');
const loginRequired = require(t.rootDir + '/middlewares/loginRequired');

// A request just complete enough for the middleware to decide on.
const makeReq = ({ path = '/', method = 'GET', role = null, headers = {}, xhr = false } = {}) => ({
  path,
  originalUrl: path,
  method,
  xhr,
  headers,
  session: role ? { userId: 1, userRole: role } : {},
  user: null,
  flashed: [],
  flash(type, message) { this.flashed.push({ type, message }); }
});

// Captures what the middleware did instead of actually answering.
const makeRes = () => ({
  statusCode: null,
  jsonBody: null,
  redirectedTo: null,
  locals: { t: (key) => key },
  status(code) { this.statusCode = code; return this; },
  json(body) { this.jsonBody = body; return this; },
  redirect(target) { this.redirectedTo = target; return this; }
});

const visit = (req) => {
  const res = makeRes();
  let calledNext = false;
  loginRequired(req, res, () => { calledNext = true; });
  return { calledNext, res, req };
};

t.run('Kayıtla görüntüleme modu', async (db) => {
  const admin = t.makeUser(db, 'admin@test.local', 'Admin', 'admin');

  // --- Varsayilan: kapali
  Setting.clearCache();
  t.assert(
    !Setting.getBool(Setting.KEYS.LOGIN_REQUIRED, false),
    'Kayıtla görüntüleme varsayılan olarak kapalı'
  );
  t.assert(visit(makeReq({ path: '/listings' })).calledNext, 'Kapalıyken ziyaretçi siteyi görebiliyor');

  // --- Acildiginda giris yapmamis ziyaretci engellenmeli
  Setting.setBool(Setting.KEYS.LOGIN_REQUIRED, true, admin);

  const guest = visit(makeReq({ path: '/listings' }));
  t.assert(!guest.calledNext, 'Açıkken giriş yapmamış ziyaretçi geçemiyor');
  t.assertEqual(guest.res.redirectedTo, '/auth/login', 'Ziyaretçi giriş sayfasına yönlendiriliyor');
  t.assertEqual(guest.res.statusCode, null, 'Yanıt bir hata sayfası değil, yönlendirme');
  t.assertEqual(
    guest.req.flashed[0] && guest.req.flashed[0].message, 'flash.site_login_required',
    'Ziyaretçiye neden yönlendirildiği söyleniyor'
  );

  // Giris yaptiktan sonra gitmek istedigi yere donmeli; yoksa her ziyaretci ana
  // sayfaya dusuyor ve tikladigi ilani yeniden aramak zorunda kaliyor.
  t.assertEqual(
    guest.req.session.returnTo, '/listings',
    'Gitmek istediği adres oturumda saklanıyor (giriş sonrası oraya döner)'
  );

  // POST icin returnTo yazilmamali: giris sonrasi yapilan sey bir GET
  // yonlendirmesi ve POST govdesi coktan kaybolmus oluyor.
  const posted = visit(makeReq({ path: '/listings', method: 'POST' }));
  t.assert(!posted.calledNext, 'POST isteği de engelleniyor');
  t.assert(!posted.req.session.returnTo, 'POST adresi dönüş yolu olarak saklanmıyor');

  // --- Giris yapmis herkes gecmeli
  t.assert(visit(makeReq({ path: '/listings', role: 'user' })).calledNext, 'Giriş yapmış üye siteyi görebiliyor');
  t.assert(visit(makeReq({ path: '/listings', role: 'agent' })).calledNext, 'Emlakçı hesabı da geçebiliyor');

  const adminVisit = visit(makeReq({ path: '/listings', role: 'admin' }));
  t.assert(adminVisit.calledNext, 'Admin siteyi gezebiliyor');
  t.assert(adminVisit.res.locals.loginRequiredBypass, 'Admin için uyarı bandı işaretleniyor');

  const memberVisit = visit(makeReq({ path: '/listings', role: 'user' }));
  t.assert(
    !memberVisit.res.locals.loginRequiredBypass,
    'Normal üyeye uyarı bandı gösterilmiyor — elinden gelen bir şey yok'
  );

  // --- Uyeligin mumkun oldugu yollar acik kalmali
  t.assert(visit(makeReq({ path: '/auth/login' })).calledNext, 'Giriş sayfası açık');
  t.assert(visit(makeReq({ path: '/auth/register' })).calledNext, 'Kayıt sayfası açık — yoksa kimse üye olamaz');
  t.assert(visit(makeReq({ path: '/auth/forgot-password' })).calledNext, 'Şifre sıfırlama açık');
  t.assert(visit(makeReq({ path: '/auth/google' })).calledNext, 'Google ile giriş açık');
  t.assert(visit(makeReq({ path: '/admin' })).calledNext, 'Yönetici paneli kendi korumasına bırakılıyor');
  t.assert(visit(makeReq({ path: '/robots.txt' })).calledNext, 'robots.txt açık — tarayıcılar geçerli bir yanıt alıyor');

  // --- Yol listesi yanlislikla genislememeli
  t.assert(loginRequired.isAlwaysOpen('/auth/login'), '/auth altındaki yollar açık');
  t.assert(!loginRequired.isAlwaysOpen('/authors'), 'Benzer isimli yol yanlışlıkla açılmıyor');
  t.assert(!loginRequired.isAlwaysOpen('/listings'), 'Normal sayfalar listede değil');
  t.assert(!loginRequired.isAlwaysOpen('/'), 'Ana sayfa da kapalı');

  // --- Sayfa ici istekler yonlendirme degil 401 almali
  const api = visit(makeReq({ path: '/api/listings' }));
  t.assertEqual(api.res.statusCode, 401, 'API çağrısı 401 dönüyor');
  t.assert(!api.res.redirectedTo, 'API çağrısı yönlendirilmiyor — fetch giriş sayfasını veri sanardı');

  const xhr = visit(makeReq({ path: '/listings', xhr: true }));
  t.assertEqual(xhr.res.statusCode, 401, 'XHR isteği 401 dönüyor');

  const jsonAccept = visit(makeReq({ path: '/listings', headers: { accept: 'application/json' } }));
  t.assertEqual(jsonAccept.res.statusCode, 401, 'JSON bekleyen istek 401 dönüyor');

  // --- Kapatinca site hemen geri gelmeli
  Setting.setBool(Setting.KEYS.LOGIN_REQUIRED, false, admin);
  t.assert(visit(makeReq({ path: '/listings' })).calledNext, 'Mod kapatılınca site herkese açılıyor');

  // --- Ayar kalici olmali (onbellek degil, veritabani)
  Setting.clearCache();
  Setting.setBool(Setting.KEYS.LOGIN_REQUIRED, true, admin);
  Setting.clearCache();
  t.assert(
    Setting.getBool(Setting.KEYS.LOGIN_REQUIRED, false),
    'Ayar veritabanında saklanıyor (sunucu yeniden başlasa da kalıcı)'
  );

  const described = Setting.describe(Setting.KEYS.LOGIN_REQUIRED);
  t.assertEqual(described.updated_by_name, 'Admin', 'Modu kimin değiştirdiği kaydediliyor');

  // Bakim modunun anahtarindan ayri durmali: birini acmak otekini acmamali
  t.assert(
    !Setting.getBool(Setting.KEYS.MAINTENANCE_ENABLED, false),
    'Kayıtla görüntüleme bakım modundan bağımsız bir anahtar'
  );

  // --- Yonetici paneli
  const adminHtml = await t.render('admin/maintenance.ejs', {
    enabled: false, message: '', until: '', lastChange: null,
    loginRequiredEnabled: true, loginRequiredLastChange: described,
    title: 'test'
  });
  t.assert(
    adminHtml.includes('/admin/kayitla-goruntuleme'),
    'Ayar sayfasında kayıtla görüntüleme formu var'
  );
  t.assert(adminHtml.includes('Kayıtla Görüntüleme AÇIK'), 'Panelde modun açık olduğu net yazıyor');
  t.assert(adminHtml.includes('Admin'), 'Panelde ayarı kimin değiştirdiği görünüyor');

  const offHtml = await t.render('admin/maintenance.ejs', {
    enabled: false, message: '', until: '', lastChange: null,
    loginRequiredEnabled: false, loginRequiredLastChange: null,
    title: 'test'
  });
  t.assert(offHtml.includes('Site Herkese Açık'), 'Kapalıyken panel bunu da net gösteriyor');

  // Arama motoru sonucu panelde yazmali: bu modu kalici acan biri ilanlarinin
  // dizinden dusecegini onceden bilmeli.
  t.assert(offHtml.includes('Arama motorları'), 'Panel arama motoru sonucunu açıkça uyarıyor');

  const allLangs = ['tr', 'en', 'el', 'ru', 'fa'].every((lang) =>
    ['access.admin_banner', 'access.admin_banner_action', 'flash.site_login_required',
      'flash.login_required_mode_on', 'flash.login_required_mode_off']
      .every((key) => t.translate(key, lang) !== key)
  );
  t.assert(allLangs, 'access.* ve ilgili flash anahtarları 5 dilde çözülüyor');
});
