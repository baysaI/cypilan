const t = require('./helpers');
const guidesConfig = require('../config/guides');
const guideController = require('../controllers/guideController');
const seoController = require('../controllers/seoController');

t.run('Kıbrıs Yaşam & Rehber (Blog) Sistemi ve SEO Entegrasyonu', async (db) => {
  // 1. Guides Config Testleri
  const allGuides = guidesConfig.getAllGuides();
  t.assert(Array.isArray(allGuides) && allGuides.length >= 5, 'En az 5 adet rehber makalesi mevcut');

  const evGuide = guidesConfig.getGuideBySlug('kktc-ev-alirken-bilinmesi-gerekenler');
  t.assert(evGuide !== null, 'Ev alma rehberi slug ile bulunuyor');
  t.assertEqual(evGuide.category, 'emlak', 'Ev alma rehberi emlak kategorisinde');
  t.assert(evGuide.content.includes('Türk Koçanlı'), 'Ev alma rehberi koçan türlerini içeriyor');

  const otoGuides = guidesConfig.getGuidesByCategory('vasita');
  t.assert(otoGuides.some(g => g.slug === 'kktc-arac-devir-ve-ruhsat-islemleri'), 'Vasıta kategorisi filtrelemesi doğru çalışıyor');

  const related = guidesConfig.getRelatedGuides('kktc-ev-alirken-bilinmesi-gerekenler', 3);
  t.assertEqual(related.length, 3, '3 adet ilgili rehber dönüyor');
  t.assert(!related.some(g => g.slug === 'kktc-ev-alirken-bilinmesi-gerekenler'), 'İlgili rehberler listesinde mevcut rehber yer almıyor');

  // 2. Guide Controller Testleri
  let renderedView = '';
  let renderedData = {};
  const mockRes = {
    locals: {},
    render: (view, data) => {
      renderedView = view;
      renderedData = data;
    },
    redirect: () => {}
  };

  await guideController.index({ query: { cat: 'all' } }, mockRes, () => {});
  t.assertEqual(renderedView, 'guide/index', 'guideController.index doğru şablonu render ediyor');
  t.assert(renderedData.guides && renderedData.guides.length > 0, 'Rehber listesi gönderiliyor');
  t.assert(mockRes.locals.meta && mockRes.locals.meta.title.includes('Rehber'), 'Rehber meta başlığı ayarlanıyor');
  t.assert(mockRes.locals.schemaOrg['@graph'].some(s => s['@type'] === 'BreadcrumbList'), 'BreadcrumbList şeması ekleniyor');

  // Detay Sayfası Testi
  const mockShowRes = {
    locals: {},
    render: (view, data) => {
      renderedView = view;
      renderedData = data;
    },
    redirect: () => {}
  };
  await guideController.show({ params: { slug: 'kktc-ev-alirken-bilinmesi-gerekenler' } }, mockShowRes, () => {});
  t.assertEqual(renderedView, 'guide/show', 'guideController.show doğru şablonu render ediyor');
  t.assertEqual(renderedData.guide.slug, 'kktc-ev-alirken-bilinmesi-gerekenler', 'Doğru makale verisi aktarılıyor');
  t.assert(mockShowRes.locals.schemaOrg['@graph'].some(s => s['@type'] === 'Article'), 'Article şeması ekleniyor');
  const articleSchema = mockShowRes.locals.schemaOrg['@graph'].find(s => s['@type'] === 'Article');
  t.assert(articleSchema.headline.includes('Ev Alırken'), 'Article şemasında headline doğru');

  // 3. Şablon Render Testleri
  const indexHtml = await t.render('guide/index.ejs', {
    guides: allGuides,
    categories: guidesConfig.CATEGORIES,
    activeCategory: 'all'
  });
  t.assert(indexHtml.includes('Kıbrıs Yaşam, Emlak &amp; Yatırım Rehberi') || indexHtml.includes('Kıbrıs Yaşam, Emlak & Yatırım Rehberi'), 'index.ejs başlığı render ediyor');
  t.assert(indexHtml.includes('kktc-ev-alirken-bilinmesi-gerekenler'), 'index.ejs rehber kartı linklerini içeriyor');

  const showHtml = await t.render('guide/show.ejs', {
    guide: evGuide,
    relatedListings: [],
    otherGuides: related,
    canonicalUrl: 'https://www.cypilan.com/rehber/kktc-ev-alirken-bilinmesi-gerekenler'
  });
  t.assert(showHtml.includes('Tapu (Koçan) Türlerini'), 'show.ejs makale gövdesini render ediyor');
  t.assert(showHtml.includes('Diğer Kıbrıs Rehberleri'), 'show.ejs diğer rehberler yan panelini basıyor');
  t.assert(showHtml.includes('whatsapp.com/send'), 'show.ejs paylaşım butonlarını içeriyor');

  // 4. Sitemap Entegrasyon Testi
  let sitemapXml = '';
  const mockSitemapRes = {
    header: () => {},
    send: (xml) => { sitemapXml = xml; }
  };
  await seoController.sitemap({}, mockSitemapRes);
  t.assert(sitemapXml.includes('https://www.cypilan.com/rehber'), 'sitemap.xml /rehber ana sayfasını içeriyor');
  t.assert(sitemapXml.includes('https://www.cypilan.com/rehber/kktc-ev-alirken-bilinmesi-gerekenler'), 'sitemap.xml ev alma rehberini içeriyor');
  t.assert(sitemapXml.includes('https://www.cypilan.com/rehber/kktc-arac-devir-ve-ruhsat-islemleri'), 'sitemap.xml araç devir rehberini içeriyor');
});
