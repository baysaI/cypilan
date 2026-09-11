const fs = require('fs');
const path = require('path');

const t = require('./helpers');
const consentConfig = require(t.rootDir + '/config/consent');
const consentMiddleware = require(t.rootDir + '/middlewares/consent');
const seoMiddleware = require(t.rootDir + '/middlewares/seo');
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

  // --- Yasal metinler kodla ayni seyi soylemeli
  //
  // Gizlilik ve cerez politikalari sitenin gercekte yaptigina gore yazildi.
  // Kod degisip metin degismezse metin yalan soylemeye baslar - ve bunu kimse
  // fark etmez, cunku sayfa hala duzgun gorunur. Asagidakiler metnin
  // dayandigi olgulari kodun kendisine bagliyor.

  // Sitenin yazdigi her cerez, cerez tablosunda olmali. Liste kaynaktan
  // cikariliyor: yeni bir res.cookie eklenip tabloya eklenmezse test duser.
  const cookieSources = ['middlewares/i18n.js', 'middlewares/theme.js', 'routes/index.js']
    .map((f) => fs.readFileSync(path.join(t.rootDir, f), 'utf8')).join('\n');
  const writtenCookies = new Set([...cookieSources.matchAll(/res\.cookie\('([a-z_]+)'/g)].map((m) => m[1]));
  writtenCookies.add(consentConfig.COOKIE_NAME);
  const sessionName = (serverSrc.match(/name:\s*'([^']+)'/) || [])[1];
  t.assert(Boolean(sessionName), 'Oturum çerezinin adı kaynaktan okunabiliyor');
  writtenCookies.add(sessionName);

  // Sureler de: tablo "7 gun", "6 ay", "13 ay" diyor.
  t.assert(serverSrc.includes('maxAge: 7 * 24 * 60 * 60 * 1000'), 'Oturum çerezi 7 gün — tablo ile aynı');
  t.assertEqual(Math.round(consentConfig.MAX_AGE_MS / (30 * 24 * 60 * 60 * 1000)), 6, 'Onay çerezi 6 ay — tablo ile aynı');
  t.assertEqual(Math.round(appConfig.analytics.retentionDays / 30.4), 13, 'Ziyaret kayıtları 13 ay — metin ile aynı');

  for (const lang of ['tr', 'en', 'el', 'ru', 'fa']) {
    const tl = (key, params) => t.translate(key, lang, params);

    const privacyHtml = await t.render('pages/privacy.ejs', { t: tl, lang });
    t.assertEqual((privacyHtml.match(/<h2 /g) || []).length, 11, lang + ': gizlilik politikası 11 bölüm');
    t.assert(!/pages\.(privacy|cookie|terms)\.[a-z]/.test(privacyHtml), lang + ': gizlilikte ham anahtar yok');
    t.assert(!privacyHtml.includes('{age}') && privacyHtml.includes(String(consentConfig.MINIMUM_AGE)),
      lang + ': yaş sınırı metne işlendi');
    t.assert(!privacyHtml.includes('&lt;p&gt;') && !privacyHtml.includes('&lt;li&gt;'), lang + ': bölüm HTML\'i metin olarak kaçmadı');

    const cookieHtml = await t.render('pages/cookie-policy.ejs', { t: tl, lang });
    const missingRows = [...writtenCookies].filter((name) => !cookieHtml.includes('<code>' + name + '</code>'));
    t.assertEqual(missingRows.length, 0, lang + ': sitenin yazdığı her çerez tabloda' + (missingRows.length ? ' (eksik: ' + missingRows.join(', ') + ')' : ''));
    t.assert(cookieHtml.includes('href="?cerez=ayarla"'), lang + ': çerez sayfası tercihi değiştirme yolunu gösteriyor');

    const termsHtml = await t.render('pages/terms.ejs', { t: tl, lang });
    t.assert(!termsHtml.includes('{age}') && termsHtml.includes(String(consentConfig.MINIMUM_AGE)),
      lang + ': kullanım koşullarında yaş maddesi');
  }

  // Onay geri alinabilir olmali: banner karar verilmis olsa bile yeniden
  // acilabiliyor ve secimden sonra ziyaretci ayni sayfaya parametresiz donuyor.
  const reqReopen = { query: { cerez: 'ayarla' }, originalUrl: '/listings?category=emlak&cerez=ayarla', cookies: { [consentConfig.COOKIE_NAME]: 'v1:essential' } };
  const resReopen = fakeRes();
  consentMiddleware(reqReopen, resReopen, () => {});
  t.assertEqual(resReopen.locals.consentBannerOpen, true, 'Karar verilmiş olsa da banner yeniden açılabiliyor');
  t.assertEqual(resReopen.locals.consentReturnTo, '/listings?category=emlak', 'Geri dönüş adresi parametresiz');

  const resPlain = fakeRes();
  consentMiddleware({ query: {}, originalUrl: '/', cookies: { [consentConfig.COOKIE_NAME]: 'v1:all' } }, resPlain, () => {});
  t.assertEqual(resPlain.locals.consentBannerOpen, false, 'Karar verilmişse banner kendiliğinden açılmıyor');

  const footerSrc = fs.readFileSync(path.join(t.rootDir, 'views', 'partials', 'footer.ejs'), 'utf8');
  t.assert(footerSrc.includes('href="?cerez=ayarla"'), 'Footer\'da çerez tercihleri bağlantısı');

  // --- Var olmayan iletisim kanallari gosterilmemeli
  //
  // Her sayfanin altinda bir e-posta (info@cypilan.com) ve tiklanabilir bir
  // telefon (+90 555 000 00 00) duruyordu. Kutu hic yoktu, numara yer
  // tutucuydu ve gercek birine gidebilirdi; gizlilik politikasi da veri
  // taleplerini o kutuya yonlendiriyordu. Calisan kanal geri bildirim formu.
  //
  // Kontrol, basilabilecek kisim uzerinde: sablon yorumlari (<%# %>) hicbir
  // zaman basilmiyor ve eski degerleri aciklamak icin anabiliyor.
  const renderable = footerSrc.replace(/<%#[\s\S]*?%>/g, '');
  t.assert(!renderable.includes('info@cypilan'), 'Footer var olmayan e-postayı göstermiyor');
  t.assert(!/555\s?000|tel:\+90555/.test(renderable), 'Footer sahte telefonu göstermiyor');
  t.assert(renderable.includes('data-bs-target="#feedbackModal"'), 'Footer iletişim için formu açıyor');

  for (const lang of ['tr', 'en', 'el', 'ru', 'fa']) {
    const texts = ['pages.faq.a5', 'pages.privacy.controller_body', 'pages.privacy.rights_body']
      .map((key) => t.translate(key, lang)).join(' ');
    t.assert(!texts.includes('info@cypilan') && !/555\s?000/.test(texts),
      lang + ': SSS ve gizlilik metni var olmayan kanala yönlendirmiyor');
    t.assert(texts.includes(t.translate('footer.contact_form', lang)),
      lang + ': metin, footer\'daki bağlantının gerçek adını kullanıyor');
  }

  // Arama motoruna da var olmayan bir adres bildirilmemeli.
  const seoRes = { locals: {} };
  seoMiddleware({ originalUrl: '/' }, seoRes, () => {});
  t.assert(!JSON.stringify(seoRes.locals.schemaOrg).includes('info@cypilan'), 'Yapısal veri var olmayan e-postayı bildirmiyor');

  // --- Veri talepleri formda ayri bir tur
  //
  // Politika "30 gun icinde yanitlariz" diyor; talebin panelde digerlerinden
  // ayirt edilebilmesi o sozun tutulabilmesinin sarti.
  const Feedback = require(t.rootDir + '/models/Feedback');
  t.assert(Feedback.TYPES.includes('privacy'), 'Geri bildirim türlerinde kişisel veri talebi var');

  const modal = await t.render('partials/feedbackModal.ejs', {});
  t.assert(modal.includes('value="privacy"'), 'Formda kişisel veri talebi seçeneği var');

  // Yonetici ekrani turleri sabit bir haritadan etiketliyor: modele eklenen
  // bir tur haritada yoksa panel o turdeki ilk kayitta cokerdi.
  const adminFeedback = fs.readFileSync(path.join(t.rootDir, 'views', 'admin', 'feedback.ejs'), 'utf8');
  const styleBlock = (adminFeedback.match(/const TYPE_STYLES = \{([\s\S]*?)\};/) || [])[1] || '';
  const styled = [...styleBlock.matchAll(/^\s*([a-z_]+):\s*\[/gm)].map((m) => m[1]);
  const unstyled = Feedback.TYPES.filter((type) => !styled.includes(type));
  t.assertEqual(unstyled.length, 0, 'Yönetici ekranı her geri bildirim türünü tanıyor' + (unstyled.length ? ' (eksik: ' + unstyled.join(', ') + ')' : ''));

  // Kendi kapsaminda: yukaridaki disa aktarma testinin res adiyla cakismasin.
  {
  // --- Google ile kayit da yas ve kosul onayindan geciyor
  //
  // Kayit formu iki onayi da istiyordu; Google yolu ikisini de atliyor ve
  // hesabi aninda aciyordu, onay kaydi da olusmuyordu. Artik Google'dan donen
  // yeni kisinin hesabi yalnizca onay adiminda, kutular isaretlenince aciliyor.
  const googleSignup = require(t.rootDir + '/utils/googleSignup');
  const authController = require(t.rootDir + '/controllers/authController');
  const User = require(t.rootDir + '/models/User');

  const existingId = t.makeUser(db, 'var@test.local', 'Var Olan');
  const known = await googleSignup.resolve({ emails: [{ value: 'VAR@test.local', verified: true }], displayName: 'Var' });
  t.assert(known.user && known.user.id === existingId, 'Kayıtlı e-posta Google ile doğrudan giriş yapıyor');

  const fresh = await googleSignup.resolve({ emails: [{ value: 'yeni@test.local', verified: true }], displayName: 'Yeni Kişi' });
  t.assert(fresh.pending && fresh.pending.email === 'yeni@test.local', 'Yeni e-posta onay adımına gidiyor');
  t.assert(!(await User.findByEmail('yeni@test.local')), 'Google dönüşünde hesap henüz açılmıyor');

  t.assertEqual((await googleSignup.resolve({ emails: [{ value: 'x@test.local', verified: false }] })).error,
    'flash.google_email_unverified', 'Doğrulanmamış Google adresi reddediliyor');
  t.assertEqual((await googleSignup.resolve({ emails: [] })).error, 'flash.google_email_missing', 'E-postasız profil reddediliyor');

  const stale = { pendingGoogleSignup: { email: 'yeni@test.local', name: 'Yeni', at: Date.now() - googleSignup.PENDING_TTL_MS - 1 } };
  t.assertEqual(googleSignup.readPending(stale), null, 'Süresi geçmiş bekleyen kayıt kullanılmıyor');

  const googleReq = (body, at = Date.now()) => {
    const flashes = [];
    return {
      body,
      flashes,
      flash: (type, message) => flashes.push(type + ':' + message),
      session: {
        pendingGoogleSignup: { email: 'yeni@test.local', name: 'Yeni Kişi', at },
        regenerate(callback) { callback(); },
        save(callback) { if (callback) callback(); }
      }
    };
  };
  const googleRes = () => {
    const res = { locals: { t: (key) => key, meta: {} }, target: null };
    res.redirect = (a, b) => { res.target = b || a; };
    return res;
  };

  let req = googleReq({});
  let res = googleRes();
  await authController.completeGoogleSignup(req, res);
  t.assert(req.flashes.includes('error:flash.terms_required') && res.target === '/auth/google/onay',
    'Kutular işaretlenmeden hesap açılmıyor');

  req = googleReq({ terms: 'on' });
  res = googleRes();
  await authController.completeGoogleSignup(req, res);
  t.assert(req.flashes.includes('error:flash.age_required'), 'Yaş onayı olmadan hesap açılmıyor');
  t.assert(!(await User.findByEmail('yeni@test.local')), 'Eksik onayda hesap hâlâ yok');

  req = googleReq({ terms: 'on', ageConfirm: 'on' }, Date.now() - googleSignup.PENDING_TTL_MS - 1);
  res = googleRes();
  await authController.completeGoogleSignup(req, res);
  t.assert(req.flashes.includes('error:flash.google_signup_expired') && res.target === '/auth/login',
    'Süresi geçmiş adımda hesap açılmıyor');

  req = googleReq({ terms: 'on', ageConfirm: 'on' });
  res = googleRes();
  await authController.completeGoogleSignup(req, res);
  const created = await User.findByEmail('yeni@test.local');
  t.assert(Boolean(created), 'İki onayla hesap açılıyor');
  t.assertEqual(created.full_name, 'Yeni Kişi', 'Google\'daki ad hesaba geçiyor');
  const googleConsents = await UserConsent.forUser(created.id);
  t.assertEqual(googleConsents.map((c) => c.kind).sort().join(','), 'age,privacy,terms', 'Google ile açılan hesabın üç onayı kayıtta');
  t.assert(googleConsents.every((c) => c.version === consentConfig.POLICY_VERSION), 'Onaylar güncel metin sürümüyle kayıtlı');
  t.assertEqual(req.session.pendingGoogleSignup, undefined, 'Bekleyen kayıt temizlendi');
  t.assertEqual(res.target, '/', 'Oturum açılıp ana sayfaya gidiliyor');

  // --- Iki ekran ayni kutulari basiyor
  const registerSrc = fs.readFileSync(path.join(t.rootDir, 'views', 'auth', 'register.ejs'), 'utf8');
  t.assert(registerSrc.includes("include('../partials/consentChecks')"), 'Kayıt formu ortak onay parçasını kullanıyor');
  t.assert(!registerSrc.includes('okudum, kabul ediyorum'), 'Kayıt formunda sabit Türkçe onay cümlesi kalmadı');

  for (const lang of ['tr', 'en', 'el', 'ru', 'fa']) {
    const tl = (key, params) => t.translate(key, lang, params);
    const page = await t.render('auth/google-consent.ejs', { t: tl, lang, pending: { email: 'a<b@test.local' } });
    t.assert(page.includes('name="terms"') && page.includes('name="ageConfirm"'), lang + ': Google onay sayfasında iki kutu');
    t.assert(page.includes('action="/auth/google/onay"'), lang + ': form onay adresine gidiyor');
    t.assert(page.includes('a&lt;b@test.local') && !page.includes('a<b@test.local'), lang + ': e-posta kaçırılarak basılıyor');
    t.assert(page.includes('href="/kullanim-kosullari"') && page.includes('href="/gizlilik-politikasi"'), lang + ': iki metnin bağlantısı var');
    t.assert(!/\{(terms|privacy|email|age)\}/.test(page) && !page.includes('auth.accept_terms'), lang + ': yer tutucu ya da ham anahtar kalmadı');
  }
  }
});
