const fs = require('fs');
const path = require('path');

const t = require('./helpers');
const consentConfig = require(t.rootDir + '/config/consent');
const consentMiddleware = require(t.rootDir + '/middlewares/consent');
const analyticsMiddleware = require(t.rootDir + '/middlewares/analytics');
const i18nMiddleware = require(t.rootDir + '/middlewares/i18n');
const themeMiddleware = require(t.rootDir + '/middlewares/theme');
const UserConsent = require(t.rootDir + '/models/UserConsent');
const Analytics = require(t.rootDir + '/models/Analytics');
const profileController = require(t.rootDir + '/controllers/profileController');
const appConfig = require(t.rootDir + '/config/app');

// Veri koruma denetiminde cikan aciklar.
//
// Sitede hic cerez onayi yoktu ama analitik herkes icin calisiyordu; kayit
// formundaki onay kutusu yalnizca tarayicida duruyordu ve kimin neyi kabul
// ettigine dair kayit tutulmuyordu; ziyaret kayitlari hic silinmiyordu; ve her
// sayfa acilisi ziyaretcinin IP'sini Google'a gonderiyordu.
//
// Bu dosya, kapatilan aciklarin sessizce geri acilmamasi icin.
const tick = () => new Promise((resolve) => setImmediate(() => setImmediate(resolve)));

const fakeRes = () => {
  const res = { locals: {}, cookies: {}, headers: {}, body: null };
  res.cookie = (name, value, options) => { res.cookies[name] = { value, options }; };
  res.clearCookie = (name) => { delete res.cookies[name]; };
  res.setHeader = (key, value) => { res.headers[key] = value; };
  res.send = (payload) => { res.body = payload; };
  return res;
};

t.run('Gizlilik: onay, saklama süresi ve veri taşınabilirliği', async (db) => {
  // --- Onay degeri
  t.assertEqual(consentConfig.parse(undefined).decided, false, 'Çerez yokken karar verilmemiş sayılıyor');
  t.assertEqual(consentConfig.parse('v1:all').analytics, true, 'Kabul analitiği açıyor');
  t.assertEqual(consentConfig.parse('v1:essential').analytics, false, 'Ret analitiği açmıyor');
  t.assertEqual(consentConfig.parse('v1:essential').decided, true, 'Ret de bir karardır');

  // Surum, ileride yeni bir kategori eklendiginde eski onayin yeni kategoriyi
  // kapsiyormus gibi davranmasini engelliyor.
  t.assertEqual(consentConfig.parse('v0:all').decided, false, 'Eski sürümdeki onay geçersiz');
  t.assertEqual(consentConfig.serialize('uydurma'), null, 'Tanınmayan seviye reddediliyor');

  // --- Analitik onaydan once calismiyor
  const visit = async (cookies) => {
    const req = {
      method: 'GET', path: '/listings', originalUrl: '/listings', query: {}, cookies,
      headers: {}, socket: { remoteAddress: '203.0.113.7' }, sessionID: 'oturum', session: {}
    };
    const res = fakeRes();
    consentMiddleware(req, res, () => {});
    analyticsMiddleware(req, res, () => {});
    await tick();
  };

  const views = () => Number(db.prepare('SELECT COUNT(*) AS n FROM page_views').get().n);

  await visit({});
  t.assertEqual(views(), 0, 'Karar verilmemişken ziyaret kaydı tutulmuyor');

  await visit({ [consentConfig.COOKIE_NAME]: 'v1:essential' });
  t.assertEqual(views(), 0, 'Reddedilmişken ziyaret kaydı tutulmuyor');

  await visit({ [consentConfig.COOKIE_NAME]: 'v1:all' });
  t.assertEqual(views(), 1, 'Kabul edilmişken ziyaret kaydı tutuluyor');

  // --- IP ozeti tuzsuz olmamali
  //
  // Tum IPv4 uzayi 4,3 milyar adres: tuzsuz bir ozet, bir dizustu bilgisayarda
  // saniyeler icinde geri cevrilebilir, yani md5(ip) pratikte IP'nin kendisi.
  const analyticsSrc = fs.readFileSync(path.join(t.rootDir, 'middlewares', 'analytics.js'), 'utf8');
  t.assert(!analyticsSrc.includes("createHash('md5')"), 'IP özeti md5 ile üretilmiyor');
  t.assert(analyticsSrc.includes('ANALYTICS_SALT'), 'IP özeti tuzlanıyor');

  // --- Dil ve tema cerezleri yalnizca acik secimde
  const guess = fakeRes();
  i18nMiddleware({ query: {}, cookies: {}, headers: { 'accept-language': 'ru-RU,ru' } }, guess, () => {});
  t.assertEqual(guess.cookies.lang, undefined, 'Seçim yokken dil çerezi yazılmıyor');
  t.assertEqual(guess.locals.lang, 'ru', 'Dil yine de tarayıcı başlığından çözülüyor');

  const picked = fakeRes();
  i18nMiddleware({ query: { lang: 'el' }, cookies: {}, headers: {} }, picked, () => {});
  t.assertEqual(picked.cookies.lang.value, 'el', 'Açık seçimde dil çerezi yazılıyor');

  const themeGuess = fakeRes();
  themeMiddleware({ query: {}, cookies: {} }, themeGuess, () => {});
  t.assertEqual(themeGuess.cookies.theme, undefined, 'Seçim yokken tema çerezi yazılmıyor');

  const themePicked = fakeRes();
  themeMiddleware({ query: { theme: 'dark' }, cookies: {} }, themePicked, () => {});
  t.assertEqual(themePicked.cookies.theme.value, 'dark', 'Açık seçimde tema çerezi yazılıyor');

  // --- Banner
  const banner = await t.render('partials/cookieBanner.ejs', {
    consent: consentConfig.parse(undefined), currentUrl: '/listings?category=emlak'
  });
  t.assert(banner.includes('action="/cerez-tercihi"'), 'Banner tercihi kaydeden adrese gidiyor');
  t.assert(banner.includes('value="essential"') && banner.includes('value="all"'), 'İki seçenek de sunuluyor');
  t.assert(banner.includes('/listings?category=emlak'), 'Sorgu dizesi geri dönüş için taşınıyor');

  // Reddetmek kabul etmek kadar kolay olmali: ayni bicim, ayni yukseklik, ayni
  // dolgu. Ret kucuk bir baglanti olsaydi onay gercek bir secim sayilmazdi.
  // Genislikler etiket uzunluguna gore farkli - olculdu, 147px ve 92px - ama
  // aranan sey esit piksel degil esit muamele.
  const buttons = banner.match(/<button[^>]*class="([^"]*)"/g) || [];
  t.assertEqual(buttons.length, 2, 'İki düğme var');
  t.assert(buttons.every((b) => b.includes('rounded-pill px-3 flex-fill')), 'İki düğme de aynı biçimde');

  // Kurabiye simgesi tanima isareti: onsuz kart sitedeki diger duyuru
  // seritlerinden ayirt edilemiyor ve okunmadan uyari metni saniliyor.
  t.assert(banner.includes('fa-cookie-bite'), 'Çerez simgesi var');

  const settled = await t.render('partials/cookieBanner.ejs', {
    consent: consentConfig.parse('v1:essential'), currentUrl: '/'
  });
  t.assertEqual(settled.trim(), '', 'Karar verilmişse banner hiç basılmıyor');

  // --- Onay kaydi
  const seller = t.makeUser(db, 'onay@test.local', 'Onaylı');
  t.assertEqual(await UserConsent.record(seller, ['terms', 'privacy', 'age'], consentConfig.POLICY_VERSION), 3,
    'Üç onay kaydediliyor');
  t.assertEqual(await UserConsent.record(seller, ['uydurma'], 'v1'), 0, 'Tanınmayan tür kaydedilmiyor');

  const records = await UserConsent.forUser(seller);
  t.assertEqual(records.length, 3, 'Onaylar geri okunuyor');
  t.assert(records.every((r) => r.version === consentConfig.POLICY_VERSION && r.accepted_at),
    'Her kayıt sürüm ve zaman damgası taşıyor');

  // Sunucu tarafinda dogrulama olmadan onay kutusu yalnizca bir suslemedir.
  const authSrc = fs.readFileSync(path.join(t.rootDir, 'controllers', 'authController.js'), 'utf8');
  t.assert(authSrc.includes("req.body.terms === 'on'"), 'Kullanım koşulları sunucuda kontrol ediliyor');
  t.assert(authSrc.includes("req.body.ageConfirm === 'on'"), 'Yaş onayı sunucuda kontrol ediliyor');
  t.assert(authSrc.includes("saveFormAndRedirect('flash.terms_required')"), 'Onaysız kayıt reddediliyor');
  t.assert(authSrc.indexOf('const userId = await User.create') < authSrc.indexOf('UserConsent.record'),
    'Onay kaydı kullanıcı oluştuktan sonra yazılıyor');

  // --- Saklama suresi
  const old = (days) => db.prepare(
    "INSERT INTO page_views (session_id, user_id, path, ip_hash, created_at) VALUES ('s', NULL, '/x', 'h', datetime('now', '-' || ? || ' days'))"
  ).run([days]);

  old(10); old(appConfig.analytics.retentionDays + 5); old(appConfig.analytics.retentionDays + 400);
  const before = views();
  const removed = await Analytics.purgeExpired(appConfig.analytics.retentionDays);
  t.assertEqual(removed, 2, 'Süresi dolan kayıtlar siliniyor');
  t.assertEqual(views(), before - 2, 'Süresi dolmayanlar duruyor');
  t.assertEqual(await Analytics.purgeExpired(0), 0, 'Sıfır gün hiçbir şeyi silmiyor');
  t.assertEqual(await Analytics.purgeExpired('abc'), 0, 'Sayı olmayan değer hiçbir şeyi silmiyor');

  // --- Veri tasinabilirligi
  const buyer = t.makeUser(db, 'alici@test.local', 'Alıcı');
  const categoryId = Number(db.prepare("SELECT id FROM categories WHERE slug = 'satilik-daire'").get().id);
  const listingId = Number(db.prepare(
    "INSERT INTO listings (user_id, category_id, title, slug, description, status, price, currency) VALUES (?,?,?,?,?,'active',1000,'GBP')"
  ).run([seller, categoryId, 'İlanım', 'ilanim', 'açıklama']).lastInsertRowid);
  db.prepare("INSERT INTO messages (sender_id, receiver_id, listing_id, content) VALUES (?,?,?,'merhaba')").run([seller, buyer, listingId]);
  db.prepare("INSERT INTO messages (sender_id, receiver_id, listing_id, content) VALUES (?,?,?,'selam')").run([buyer, seller, listingId]);

  const res = fakeRes();
  await profileController.exportData({ session: { userId: seller } }, res, (error) => { if (error) throw error; });

  t.assert(res.headers['Content-Disposition'].includes('attachment'), 'Veri dosya olarak iniyor');
  const data = JSON.parse(res.body);
  t.assertEqual(data.hesap.id, seller, 'Kendi hesabını içeriyor');
  t.assertEqual(data.ilanlar.length, 1, 'Kendi ilanlarını içeriyor');
  t.assertEqual(data.mesajlar.length, 2, 'Gelen ve giden mesajları içeriyor');
  t.assertEqual(data.onaylar.length, 3, 'Onay kayıtlarını içeriyor');

  // Sifre ozeti ve sifirlama jetonlari kisinin kendi verisi olsa da disari
  // verilmez: dosya e-postayla dolasabilir.
  t.assertEqual(data.hesap.password_hash, undefined, 'Şifre özeti dışa aktarılmıyor');
  t.assertEqual(data.hesap.password_reset_token, undefined, 'Sıfırlama jetonu dışa aktarılmıyor');

  // Karsi tarafin kimligi, profilinde zaten herkese acik olan adiyla sinirli.
  t.assert(!res.body.includes('alici@test.local'), 'Karşı tarafın e-postası dışa aktarılmıyor');

  const otherRes = fakeRes();
  await profileController.exportData({ session: { userId: buyer } }, otherRes, (error) => { if (error) throw error; });
  t.assertEqual(JSON.parse(otherRes.body).ilanlar.length, 0, 'Başkasının ilanları sızmıyor');

  // --- Yazi tipi kendi sunucumuzda
  //
  // fonts.googleapis.com uzerinden yuklemek, her sayfa acilisinda ziyaretcinin
  // IP adresini Google'a gondermek demekti.
  ['views/layouts/main.ejs', 'views/admin/layout.ejs'].forEach((view) => {
    const src = fs.readFileSync(path.join(t.rootDir, view), 'utf8');
    t.assert(!src.includes('fonts.googleapis.com'), view + ' Google Fonts yüklemiyor');
    t.assert(!src.includes('fonts.gstatic.com'), view + ' gstatic çağırmıyor');
    t.assert(src.includes('/fonts/inter.css'), view + ' yerel yazı tipini bağlıyor');
  });

  const fontCss = fs.readFileSync(path.join(t.rootDir, 'public', 'fonts', 'inter.css'), 'utf8');
  t.assert(!fontCss.includes('url(https:'), 'Yazı tipi CSS\'i uzak adres çağırmıyor');

  const missing = (fontCss.match(/url\(\/fonts\/([^)]+)\)/g) || [])
    .map((u) => u.replace('url(/fonts/', '').replace(')', ''))
    .filter((file) => !fs.existsSync(path.join(t.rootDir, 'public', 'fonts', file)));
  t.assertEqual(missing.length, 0, 'CSS\'in gösterdiği her yazı tipi dosyası diskte');

  const serverSrc = fs.readFileSync(path.join(t.rootDir, 'server.js'), 'utf8');
  const csp = serverSrc.slice(serverSrc.indexOf('contentSecurityPolicy'), serverSrc.indexOf('upgradeInsecureRequests'));
  t.assert(!csp.includes('fonts.googleapis.com') && !csp.includes('fonts.gstatic.com'),
    'Güvenlik politikasında Google Fonts adresleri kalmadı');
});
