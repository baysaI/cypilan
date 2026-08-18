const t = require('./helpers');
const seoMiddleware = require('../middlewares/seo');
const seoController = require('../controllers/seoController');

t.run('SEO, Dinamik Sitemap, Robots.txt ve Schema.org Zengin Veri Yapısı', async (db) => {
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
  t.assert(robotsText.includes('Sitemap: https://www.cypilan.com/sitemap.xml'), 'robots.txt sitemap bağlantısı veriyor');

  // 2. Sitemap.xml Testi
  let sitemapXml = '';
  const mockSitemapRes = {
    header: () => {},
    send: (xml) => { sitemapXml = xml; }
  };
  await seoController.sitemap({}, mockSitemapRes);

  t.assert(sitemapXml.includes('<urlset'), 'sitemap.xml urlset kök elemanı içeriyor');
  t.assert(sitemapXml.includes('https://www.cypilan.com/'), 'sitemap.xml ana sayfa URL içeriyor');
  t.assert(sitemapXml.includes('https://www.cypilan.com/listings'), 'sitemap.xml ilanlar sayfası URL içeriyor');
  t.assert(sitemapXml.includes('https://www.cypilan.com/sss'), 'sitemap.xml SSS sayfası URL içeriyor');
  t.assert(sitemapXml.includes('https://www.cypilan.com/ogrenci'), 'sitemap.xml öğrenci rehberi URL içeriyor');
  t.assert(sitemapXml.includes('https://www.cypilan.com/yatirimci'), 'sitemap.xml yatırımcı rehberi URL içeriyor');
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
});
