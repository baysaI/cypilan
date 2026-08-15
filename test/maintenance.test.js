const t = require('./helpers');

const Setting = require(t.rootDir + '/models/Setting');
const maintenance = require(t.rootDir + '/middlewares/maintenance');

// A request just complete enough for the middleware to decide on.
const makeReq = ({ path = '/', role = null } = {}) => ({
  path,
  session: role ? { userId: 1, userRole: role } : {},
  user: null
});

// Captures what the middleware did instead of actually rendering.
const makeRes = () => {
  const res = {
    statusCode: null,
    headers: {},
    rendered: null,
    locals: { t: (key) => key },
    status(code) { this.statusCode = code; return this; },
    set(name, value) { this.headers[name] = value; return this; },
    render(view, locals, callback) {
      this.rendered = { view, locals };
      if (callback) callback(null, '<html>maintenance</html>');
      return this;
    },
    send() { return this; },
    type() { return this; }
  };
  return res;
};

const passesThrough = (req) => {
  const res = makeRes();
  let calledNext = false;
  maintenance(req, res, () => { calledNext = true; });
  return { calledNext, res };
};

t.run('Bakım modu', async (db) => {
  const admin = t.makeUser(db, 'admin@test.local', 'Admin', 'admin');

  // --- Varsayilan: kapali
  Setting.clearCache();
  t.assert(!Setting.getBool(Setting.KEYS.MAINTENANCE_ENABLED, false), 'Bakım modu varsayılan olarak kapalı');
  t.assert(passesThrough(makeReq({ path: '/listings' })).calledNext, 'Kapalıyken ziyaretçi siteye girebiliyor');

  // --- Acildiginda ziyaretci engellenmeli
  Setting.setBool(Setting.KEYS.MAINTENANCE_ENABLED, true, admin);
  Setting.set(Setting.KEYS.MAINTENANCE_MESSAGE, 'Sistemi güncelliyoruz.', admin);

  const visitor = passesThrough(makeReq({ path: '/listings' }));
  t.assert(!visitor.calledNext, 'Açıkken ziyaretçi siteye giremiyor');
  t.assertEqual(visitor.res.statusCode, 503, 'Yanıt 503 dönüyor (200 değil — arama sıralaması korunur)');
  t.assert(Boolean(visitor.res.headers['Retry-After']), 'Retry-After başlığı gönderiliyor');
  t.assertEqual(
    visitor.res.rendered.view, 'errors/maintenance',
    'Ziyaretçiye bakım sayfası gösteriliyor'
  );
  t.assertEqual(
    visitor.res.rendered.locals.maintenanceMessage, 'Sistemi güncelliyoruz.',
    'Admin\'in yazdığı mesaj ziyaretçiye ulaşıyor'
  );

  // --- EN KRITIK: admin kendini disarida birakmamali
  const adminVisit = passesThrough(makeReq({ path: '/listings', role: 'admin' }));
  t.assert(adminVisit.calledNext, 'Admin bakım modundayken de siteyi gezebiliyor');
  t.assert(adminVisit.res.locals.maintenanceBypass, 'Admin\'e "bakım açık" uyarı bandı gösteriliyor');

  const adminPanel = passesThrough(makeReq({ path: '/admin/bakim', role: 'admin' }));
  t.assert(adminPanel.calledNext, 'Admin paneline erişim açık kalıyor (modu kapatabilir)');

  // Oturumu olmayan bir admin baska cihazdan giris yapabilmeli, yoksa donus yolu kalmaz
  t.assert(
    passesThrough(makeReq({ path: '/admin' })).calledNext,
    'Giriş yapmamış ziyaretçi için /admin yolu açık (isAdmin ayrıca koruyor)'
  );
  t.assert(
    passesThrough(makeReq({ path: '/auth/login' })).calledNext,
    'Giriş sayfası açık kalıyor — admin başka cihazdan girebilir'
  );
  t.assert(
    passesThrough(makeReq({ path: '/auth/logout' })).calledNext,
    'Çıkış yolu açık kalıyor'
  );

  // --- Bireysel kullanici gecemez
  t.assert(
    !passesThrough(makeReq({ path: '/listings', role: 'user' })).calledNext,
    'Normal kullanıcı (admin olmayan) geçemiyor'
  );
  t.assert(
    !passesThrough(makeReq({ path: '/kariyer', role: 'agent' })).calledNext,
    'Emlakçı hesabı da geçemiyor — yalnızca admin'
  );

  // --- Yol listesi kontrolu
  t.assert(maintenance.isAlwaysOpen('/admin/users'), '/admin altındaki yollar açık');
  t.assert(!maintenance.isAlwaysOpen('/administrator'), 'Benzer isimli yol yanlışlıkla açılmıyor');
  t.assert(!maintenance.isAlwaysOpen('/listings'), 'Normal sayfalar listede değil');

  // --- Retry-After makul olmali
  t.assertEqual(maintenance.retryAfterSeconds(''), 3600, 'Bitiş verilmezse makul varsayılan kullanılıyor');
  t.assertEqual(maintenance.retryAfterSeconds('gecersiz-tarih'), 3600, 'Bozuk tarih varsayılana düşüyor');
  t.assertEqual(
    maintenance.retryAfterSeconds(new Date(Date.now() - 60000).toISOString()), 60,
    'Geçmiş tarih negatif süre üretmiyor'
  );
  t.assert(
    maintenance.retryAfterSeconds(new Date(Date.now() + 400 * 86400000).toISOString()) <= 86400,
    'Çok uzak tarih 24 saatle sınırlanıyor'
  );

  // --- Kapatinca site geri gelmeli
  Setting.setBool(Setting.KEYS.MAINTENANCE_ENABLED, false, admin);
  t.assert(passesThrough(makeReq({ path: '/listings' })).calledNext, 'Mod kapatılınca site hemen geri geliyor');

  // --- Ayar kalici olmali (onbellek degil, veritabani)
  Setting.clearCache();
  Setting.setBool(Setting.KEYS.MAINTENANCE_ENABLED, true, admin);
  Setting.clearCache();
  t.assert(
    Setting.getBool(Setting.KEYS.MAINTENANCE_ENABLED, false),
    'Ayar veritabanında saklanıyor (sunucu yeniden başlasa da kalıcı)'
  );

  const described = Setting.describe(Setting.KEYS.MAINTENANCE_ENABLED);
  t.assertEqual(described.updated_by_name, 'Admin', 'Modu kimin değiştirdiği kaydediliyor');

  // --- Sablonlar
  const pageHtml = await t.render('errors/maintenance.ejs', {
    maintenanceMessage: 'Sistemi güncelliyoruz.',
    maintenanceUntil: '',
    title: 'test'
  });
  t.assert(pageHtml.includes('Sistemi güncelliyoruz.'), 'errors/maintenance.ejs mesajı basıyor');

  // Bakim sayfasi kendi basina tam bir belge olmali: site sablonunu kullansaydi
  // arama kutusu ve tum menu gorunur, hepsi 503 donerdi; ustelik header/footer
  // veritabanina sorar ve bu sayfanin onemli oldugu an tam da goc yapilan andir.
  t.assert(pageHtml.trim().startsWith('<!DOCTYPE html>'), 'Bakım sayfası kendi başına tam bir HTML belgesi');
  t.assert(!pageHtml.includes('site-header'), 'Site menüsü bakım sayfasında yok');
  t.assert(!pageHtml.includes('site-footer'), 'Footer bakım sayfasında yok');
  t.assert(!pageHtml.includes('name="q"'), 'Arama kutusu bakım sayfasında yok');
  t.assert(!pageHtml.includes('/listings'), 'Ölü bağlantı verilmiyor');
  t.assert(!pageHtml.includes('cdn.jsdelivr') && !pageHtml.includes('cdnjs.'), 'Dış CDN bağımlılığı yok');
  t.assert(!pageHtml.includes('/css/style.css'), 'Stil dosyasına bağımlı değil, kendi içinde');
  t.assert(pageHtml.includes('<style>'), 'Stiller sayfanın içinde gömülü');

  const defaultHtml = await t.render('errors/maintenance.ejs', {
    maintenanceMessage: '', maintenanceUntil: '', title: 'test'
  });
  t.assert(
    defaultHtml.includes('Kısa süre içinde geri döneceğiz'),
    'Mesaj boşsa varsayılan metin gösteriliyor'
  );

  const adminHtml = await t.render('admin/maintenance.ejs', {
    enabled: true, message: 'Sistemi güncelliyoruz.', until: '',
    lastChange: described, title: 'test'
  });
  t.assert(adminHtml.includes('ziyaretçilere kapalı'), 'admin/maintenance.ejs durumu net gösteriyor');

  const allLangs = ['tr', 'en', 'el', 'ru', 'fa'].every((lang) =>
    ['maintenance.title', 'maintenance.default_message', 'maintenance.admin_banner', 'flash.maintenance_on']
      .every((key) => t.translate(key, lang) !== key)
  );
  t.assert(allLangs, 'maintenance.* anahtarları 5 dilde çözülüyor');
});
