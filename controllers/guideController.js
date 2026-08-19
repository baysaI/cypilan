const guidesConfig = require('../config/guides');
const Listing = require('../models/Listing');

const index = async (req, res, next) => {
  try {
    const activeCategory = req.query.cat || 'all';
    const guides = guidesConfig.getGuidesByCategory(activeCategory);
    const categories = guidesConfig.CATEGORIES;

    res.locals.meta = res.locals.meta || {};
    res.locals.meta.title = 'Kıbrıs Yaşam & Emlak, Araç, İş Rehberi - CYPILAN';
    res.locals.meta.description = 'Kuzey Kıbrıs’ta ev alımı, araç devir işlemleri, kiralık daireler, çalışma izni ve Kıbrıs yaşam maliyetleri hakkında en güncel ve kapsamlı rehberler.';

    const baseUrl = (process.env.SITE_URL || 'https://www.cypilan.com').replace(/\/$/, '');
    res.locals.schemaOrg = res.locals.schemaOrg || [];
    res.locals.schemaOrg.push({
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Ana Sayfa", "item": baseUrl },
        { "@type": "ListItem", "position": 2, "name": "Kıbrıs Rehberi", "item": `${baseUrl}/rehber` }
      ]
    });

    res.render('guide/index', {
      guides,
      categories,
      activeCategory,
      title: 'Kıbrıs Yaşam & Bilgi Rehberi'
    });
  } catch (error) {
    console.error('Guide Index Error:', error);
    next(error);
  }
};

const show = async (req, res, next) => {
  try {
    const { slug } = req.params;
    const guide = guidesConfig.getGuideBySlug(slug);

    if (!guide) {
      req.flash('error', 'flash.page_not_found');
      return res.redirect('/rehber');
    }

    let relatedListings = [];
    if (guide.relatedCategorySlug) {
      try {
        const searchResult = await Listing.search({ category: guide.relatedCategorySlug }, 1, 4);
        relatedListings = searchResult.data || [];
      } catch (err) {
        console.error('Guide related listings error:', err);
      }
    }

    const otherGuides = guidesConfig.getRelatedGuides(guide.slug, 3);
    const baseUrl = (process.env.SITE_URL || 'https://www.cypilan.com').replace(/\/$/, '');
    const canonicalUrl = `${baseUrl}/rehber/${encodeURIComponent(guide.slug)}`;

    res.locals.meta = res.locals.meta || {};
    res.locals.meta.title = `${guide.title} - CYPILAN Kıbrıs Rehberi`;
    res.locals.meta.description = guide.summary;
    res.locals.meta.canonicalUrl = canonicalUrl;

    res.locals.schemaOrg = res.locals.schemaOrg || [];
    res.locals.schemaOrg.push({
      "@type": "Article",
      "@id": `${canonicalUrl}#article`,
      "headline": guide.title,
      "description": guide.summary,
      "datePublished": `${guide.publishedAt}T08:00:00+03:00`,
      "dateModified": `${guide.publishedAt}T08:00:00+03:00`,
      "author": {
        "@type": "Organization",
        "name": guide.author,
        "url": baseUrl
      },
      "publisher": {
        "@type": "Organization",
        "name": "CYPILAN.COM",
        "logo": {
          "@type": "ImageObject",
          "url": `${baseUrl}/img/logo.svg`
        }
      },
      "mainEntityOfPage": {
        "@type": "WebPage",
        "@id": canonicalUrl
      }
    });

    res.locals.schemaOrg.push({
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Ana Sayfa", "item": baseUrl },
        { "@type": "ListItem", "position": 2, "name": "Kıbrıs Rehberi", "item": `${baseUrl}/rehber` },
        { "@type": "ListItem", "position": 3, "name": guide.title, "item": canonicalUrl }
      ]
    });

    res.render('guide/show', {
      guide,
      relatedListings,
      otherGuides,
      canonicalUrl,
      title: guide.title
    });
  } catch (error) {
    console.error('Guide Show Error:', error);
    next(error);
  }
};

module.exports = {
  index,
  show
};
