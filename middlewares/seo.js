const DEFAULT_SITE_URL = 'https://www.cypilan.com';

const seoMiddleware = (req, res, next) => {
    const siteName = 'CYPILAN.COM';
    // Falls back to the production domain, but staging/dev never advertise
    // canonical URLs pointing at production.
    const baseUrl = (process.env.SITE_URL || DEFAULT_SITE_URL).replace(/\/$/, '');

    res.locals.meta = {
        title: `${siteName} - Kıbrıs İlan Platformu`,
        description: 'Kuzey Kıbrıs\'ın en kapsamlı ücretsiz ilan, emlak, oto, alışveriş platformu.',
        keywords: 'kıbrıs ilan, kktc emlak, kıbrıs araba, ikinci el kıbrıs, lefkoşa, girne, mağusa',
        ogImage: '/img/logo.svg',
        canonical: `${baseUrl}${req.originalUrl.split('?')[0]}`,
        robots: 'index, follow',
        siteName: siteName,
        url: `${baseUrl}${req.originalUrl}`
    };

    res.locals.schemaOrg = {
        "@context": "https://schema.org",
        "@type": "WebSite",
        "name": siteName,
        "url": baseUrl,
        "potentialAction": {
            "@type": "SearchAction",
            "target": `${baseUrl}/search?q={search_term_string}`,
            "query-input": "required name=search_term_string"
        }
    };

    next();
};

module.exports = seoMiddleware;
