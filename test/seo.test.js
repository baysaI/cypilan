const t = require('./helpers');
const seoMiddleware = require('../middlewares/seo');
const seoController = require('../controllers/seoController');

const listingController = require('../controllers/listingController');

t.run('SEO, Dinamik Sitemap, Robots.txt ve Schema.org Zengin Veri Yapısı', async (db) => {
  // Site haritasi 30 dakika onbellekleniyor, yani asagida bir kez uretiliyor.
  // Kategori ve sehir sayfalarinin lastmod'u gercek ilan tarihlerinden geldigi
  // icin ilanlarin o uretimden once durmasi gerekiyor.
  const seller = t.makeUser(db, 'seo@test.local', 'SEO');
  const addListing = (categoryId, city, when, slug) => db.prepare(`
    INSERT INTO listings (user_id, category_id, title, slug, description, status, price, currency, location_city, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'açıklama', 'active', 100, 'GBP', ?, ?, ?)
  `).run([seller, categoryId, 'İlan ' + slug, slug, city, when, when]);

  const satilikDaire = Number(db.prepare("SELECT id FROM categories WHERE slug = 'satilik-daire'").get().id);
  const kiralikDaire = Number(db.prepare("SELECT id FROM categories WHERE slug = 'kiralik-daire'").get().id);

  addListing(satilikDaire, 'Girne', '2026-03-01 10:00:00', 'seo-eski');
  addListing(satilikDaire, 'Girne', '2026-05-20 10:00:00', 'seo-daire');
  addListing(kiralikDaire, 'Lefkoşa', '2026-07-15 10:00:00', 'seo-kiralik');

  // 1. Robots.txt Testi
  let robotsText = '';
  const mockRobotsRes = {
    header: () => {},
    send: (txt) => { robotsText = txt; }
  };
  seoController.robots({}, mockRobotsRes);

  t.assert(robotsText.includes('User-agent: *'), 'robots.txt User-agent kuralı içeriyor');
  t.assert(robotsText.includes('Disallow: /admin/'), 'robots.txt admin engelini içeriyor');
  t.assert(robotsText.includes('Disallow: /panel/'), 'robots.txt panel engelini içeriyor');
  t.assert(robotsText.includes('Disallow: /messages/'), 'robots.txt mesajlaşma engelini içeriyor');
  t.assert(robotsText.includes('Sitemap: https://cypilan.com/sitemap.xml'), 'robots.txt sitemap bağlantısı veriyor');

  // 2. Sitemap.xml Testi
  let sitemapXml = '';
  const mockSitemapRes = {
    header: () => {},
    send: (xml) => { sitemapXml = xml; }
  };
  await seoController.sitemap({}, mockSitemapRes);

  t.assert(sitemapXml.includes('<urlset'), 'sitemap.xml urlset kök elemanı içeriyor');
  t.assert(sitemapXml.includes('https://cypilan.com/'), 'sitemap.xml ana sayfa URL içeriyor');
  t.assert(sitemapXml.includes('https://cypilan.com/listings'), 'sitemap.xml ilanlar sayfası URL içeriyor');
  t.assert(sitemapXml.includes('https://cypilan.com/sss'), 'sitemap.xml SSS sayfası URL içeriyor');
  t.assert(sitemapXml.includes('https://cypilan.com/ogrenci'), 'sitemap.xml öğrenci rehberi URL içeriyor');
  t.assert(sitemapXml.includes('https://cypilan.com/yatirimci'), 'sitemap.xml yatırımcı rehberi URL içeriyor');
  t.assert(sitemapXml.includes('hreflang="tr"'), 'sitemap.xml Türkçe dil etiketi içeriyor');
  t.assert(sitemapXml.includes('hreflang="en"'), 'sitemap.xml İngilizce dil etiketi içeriyor');
  t.assert(sitemapXml.includes('hreflang="ru"'), 'sitemap.xml Rusça dil etiketi içeriyor');

  // 3. SEO Middleware ve Organization / WebSite Schema Testi
  const mockReq = { originalUrl: '/' };
  const mockRes = { locals: {} };
  let nextCalled = false;
  seoMiddleware(mockReq, mockRes, () => { nextCalled = true; });

  t.assert(nextCalled === true, 'seoMiddleware next() çağırıyor');
  t.assert(mockRes.locals.meta && mockRes.locals.meta.title.includes('CYPILAN'), 'Varsayılan meta başlık CYPILAN içeriyor');
  t.assert(mockRes.locals.meta.keywords.includes('cypilan'), 'Meta keywords cypilan kelimesini içeriyor');
  t.assert(mockRes.locals.meta.keywords.includes('kıbrıs ilan'), 'Meta keywords kıbrıs ilan kelimesini içeriyor');

  t.assert(mockRes.locals.schemaOrg && mockRes.locals.schemaOrg['@context'] === 'https://schema.org', 'Schema.org context geçerli');
  const org = mockRes.locals.schemaOrg['@graph'].find(item => item['@type'] === 'Organization');
  t.assert(org && org.name === 'Cypilan', 'Organization schema Cypilan adını taşıyor');
  t.assert(org && org.legalName === 'CYPILAN.COM', 'Organization legalName doğru');
  t.assert(org && Array.isArray(org.alternateName) && org.alternateName.includes('cypilan'), 'Organization alternateName varyasyonları içeriyor');

  // 4. Kategori ve Şehir Zengin SEO Blokları & FAQ Schema Testi
  const seoContent = require('../config/seoContent');
  const emlakBlock = seoContent.getSeoBlock('emlak', 'Girne');
  t.assert(emlakBlock.category && emlakBlock.category.title.includes('Emlak'), 'Emlak kategorisi için SEO bloğu dönüyor');
  t.assert(emlakBlock.category.faqs && emlakBlock.category.faqs.length > 0, 'Emlak kategorisi için SSS listesi mevcut');
  t.assert(emlakBlock.city && emlakBlock.city.title.includes('Girne'), 'Girne şehri için SEO bloğu dönüyor');

  const faqSchema = seoContent.getFaqSchema('emlak');
  t.assert(faqSchema && faqSchema['@type'] === 'FAQPage', 'FAQPage schema tipi doğru');
  t.assert(faqSchema.mainEntity && faqSchema.mainEntity.length > 0, 'FAQPage mainEntity soruları içeriyor');
  t.assertEqual(faqSchema.mainEntity[0]['@type'], 'Question', 'İlk varlık Question tipinde');

  const guideHtml = await t.render('partials/seoGuideBlock.ejs', { seoBlock: emlakBlock });
  t.assert(guideHtml.includes('Kuzey Kıbrıs (KKTC) Emlak'), 'seoGuideBlock.ejs başlığı render ediyor');
  t.assert(guideHtml.includes('Sıkça Sorulan Sorular'), 'seoGuideBlock.ejs SSS akordiyonunu render ediyor');
  t.assert(guideHtml.includes('Girne İlanları'), 'seoGuideBlock.ejs şehir kartını render ediyor');

  // 5. Favicon & Web Manifest Testleri
  const fs = require('fs');
  const path = require('path');
  t.assert(fs.existsSync(path.join(__dirname, '../public/favicon.ico')), 'public/favicon.ico mevcut');
  t.assert(fs.existsSync(path.join(__dirname, '../public/img/favicon-48x48.png')), 'public/img/favicon-48x48.png (Google standart) mevcut');
  t.assert(fs.existsSync(path.join(__dirname, '../public/site.webmanifest')), 'public/site.webmanifest mevcut');

  // 6. Site haritasi ile canonical ayni seyi soylemeli
  //
  // Search Console'da 114 adresin 112'si dizine eklenmemis gorunuyordu. Sebebin
  // bir kismi buradaydi: site haritasi 47 kategori/sehir adresi yayinliyor, o
  // sayfalarin her biri de canonical olarak '/listings' gosteriyordu. Yani
  // Google'a once "bu adresleri tara" deyip sonra "bunlari degil, sunu dizine
  // ekle" diyorduk. Google soyleneni yapiyordu.
  //
  // Asagidaki dongu bu celiskiyi bir daha olusamayacak sekilde bagliyor:
  // haritadaki her liste adresi kendini gostermek zorunda.
  const locs = (sitemapXml.match(/<loc>([^<]*)<\/loc>/g) || []).map((s) => s.replace(/<\/?loc>/g, ''));
  const canonicalFor = async (query, originalUrl) => {
    const req = { query, originalUrl, lang: 'tr', session: {} };
    const res = { locals: { lang: 'tr' }, render: () => {} };
    seoMiddleware(req, res, () => {});
    res.locals.lang = 'tr';
    await listingController.index(req, res, (error) => { throw error; });
    return res.locals.meta.canonical;
  };

  const listeAdresleri = locs.filter((loc) => loc.includes('/listings?'));
  t.assert(listeAdresleri.length > 0, 'Site haritasında kategori/şehir adresleri var');

  const celisen = [];
  for (const loc of listeAdresleri) {
    const url = new URL(loc);
    const canonical = await canonicalFor(Object.fromEntries(url.searchParams.entries()), '/listings' + url.search);
    if (canonical !== loc) celisen.push(loc + ' -> ' + canonical);
  }
  t.assertEqual(celisen.length, 0, 'Haritadaki her liste adresi kendini gösteriyor' + (celisen.length ? ': ' + celisen[0] : ''));

  // Canonical yalnizca sayfayi tanimlayan parametreleri tasimali. Sayfa
  // numarasi, siralama ve dil de girseydi her filtre kombinasyonu ayri bir
  // adres olurdu - katlanma diye bir sey kalmazdi.
  t.assertEqual(await canonicalFor({ category: 'emlak', page: '3' }, '/listings?category=emlak&page=3'),
    'https://cypilan.com/listings?category=emlak', 'Sayfa numarası temiz kategori adresine katlanıyor');
  t.assertEqual(await canonicalFor({ category: 'emlak', sort: 'price_asc', minPrice: '5' }, '/listings?category=emlak&sort=price_asc&minPrice=5'),
    'https://cypilan.com/listings?category=emlak', 'Sıralama ve fiyat filtresi canonical\'a girmiyor');
  t.assertEqual(await canonicalFor({ lang: 'en' }, '/listings?lang=en'),
    'https://cypilan.com/listings', 'Dil parametresi canonical\'a girmiyor');
  t.assertEqual(await canonicalFor({ category: 'emlak', city: 'Girne' }, '/listings?category=emlak&city=Girne'),
    'https://cypilan.com/listings?category=emlak&city=Girne', 'Kategori ve şehir birlikte kendini gösteriyor');

  // 7. Alt kategori adresi uygulamanin anladigi adres olmali
  //
  // Onceden '/listings?category=emlak&sub=satilik-daire' yaziliyordu ama
  // uygulamada 'sub' diye bir parametre yok: o adres emlak sayfasini aynen
  // basiyordu. Yani harita Google'a onlarca kopya sayfa gonderiyordu.
  t.assert(!sitemapXml.includes('sub='), 'Site haritasında uygulamanın görmezden geldiği "sub" parametresi kalmadı');
  t.assert(locs.includes('https://cypilan.com/listings?category=satilik-daire'), 'Alt kategori kendi slug\'ıyla yayınlanıyor');

  // 8. lastmod uydurulmamali
  //
  // Onceden butun statik ve kategori adreslerine bugunun tarihi yaziliyordu:
  // cerez politikasi aylardir ayni dururken harita her gun "bugun degisti"
  // diyordu. Google tutarli bicimde yanlis bir lastmod gorurse o alani tumden
  // yok sayiyor - yani yalan, dogru tarihi olan ilan sayfalarini da
  // degersizlestiriyordu.
  const bloklar = sitemapXml.split('<url>').slice(1);
  const blokFor = (loc) => bloklar.find((b) => b.includes('<loc>' + loc + '</loc>'));
  const lastmodOf = (loc) => {
    const blok = blokFor(loc);
    const eslesme = blok && blok.match(/<lastmod>([^<]*)<\/lastmod>/);
    return eslesme ? eslesme[1] : null;
  };

  t.assertEqual(lastmodOf('https://cypilan.com/cerez-politikasi'), null, 'Değişmeyen sayfaya tarih uydurulmuyor');
  t.assertEqual(lastmodOf('https://cypilan.com/kurumsal'), null, 'Kurumsal sayfaya tarih uydurulmuyor');
  t.assertEqual(lastmodOf('https://cypilan.com/listings?category=satilik-daire'), '2026-05-20', 'Alt kategori tarihi kendi en yeni ilanından');
  t.assertEqual(lastmodOf('https://cypilan.com/listings?category=emlak'), '2026-07-15', 'Üst kategori tarihi ağacın en yenisinden');
  t.assertEqual(lastmodOf('https://cypilan.com/listings?city=Girne'), '2026-05-20', 'Şehir tarihi o şehrin en yeni ilanından');
  t.assertEqual(lastmodOf('https://cypilan.com/listings?city=Baf'), null, 'İlanı olmayan şehre tarih yazılmıyor');
});
