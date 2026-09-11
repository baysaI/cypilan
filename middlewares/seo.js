const DEFAULT_SITE_URL = 'https://cypilan.com';

const seoMiddleware = (req, res, next) => {
    const siteName = 'CYPILAN.COM';
    // Falls back to the production domain, but staging/dev never advertise
    // canonical URLs pointing at production.
    const baseUrl = (process.env.SITE_URL || DEFAULT_SITE_URL).replace(/\/$/, '');

    res.locals.meta = {
        title: `${siteName} - Kıbrıs'ın En Büyük İlan ve Pazaryeri Platformu`,
        description: 'Kuzey Kıbrıs (KKTC) genelinde emlak, vasıta, ikinci el eşya, iş ilanları ve usta hizmetleri. Lefkoşa, Girne, Mağusa ve tüm Kıbrıs\'ta ücretsiz ilan verin.',
        keywords: 'cypilan, cypilan kıbrıs, cypilan kktc, cyp ilan, kıbrıs ilan, kktc ilan, kıbrıs satılık, kıbrıs kiralık, kıbrıs emlak, kıbrıs araba, kıbrıs iş ilanları, lefkoşa emlak, girne satılık ev, mağusa araba',
        ogImage: '/img/logo.svg',
        canonical: `${baseUrl}${req.originalUrl.split('?')[0]}`,
        robots: 'index, follow',
        siteName: siteName,
        url: `${baseUrl}${req.originalUrl}`
    };

    res.locals.schemaOrg = {
        "@context": "https://schema.org",
        "@graph": [
            {
                "@type": "Organization",
                "@id": `${baseUrl}/#organization`,
                "name": "Cypilan",
                "legalName": "CYPILAN.COM",
                "alternateName": ["cypilan", "cyp ilan", "CypIlan", "cypilan kktc", "cypilan kıbrıs", "Kıbrıs İlan"],
                "url": baseUrl,
                "logo": {
                    "@type": "ImageObject",
                    "url": `${baseUrl}/img/logo.svg`,
                    "caption": "CYPILAN.COM - Kıbrıs İlan Sitesi"
                },
                // Burada info@cypilan.com'u gosteren bir ContactPoint vardi; o
                // kutu yok. Arama motoruna var olmayan bir iletisim adresi
                // bildirmektense hic bildirmemek dogru - iletisim site
                // uzerinden, geri bildirim formuyla yapiliyor.
                "description": "Kuzey Kıbrıs Türk Cumhuriyeti (KKTC) dijital pazaryeri ve ücretsiz seri ilan platformu."
            },
            {
                "@type": "WebSite",
                "@id": `${baseUrl}/#website`,
                "url": baseUrl,
                "name": siteName,
                "alternateName": "Cypilan",
                "publisher": {
                    "@id": `${baseUrl}/#organization`
                },
                "potentialAction": {
                    "@type": "SearchAction",
                    "target": `${baseUrl}/search?q={search_term_string}`,
                    "query-input": "required name=search_term_string"
                }
            }
        ]
    };

    next();
};

module.exports = seoMiddleware;
