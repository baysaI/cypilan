const seoMiddleware = (req, res, next) => {
    const siteName = 'CYPILAN.COM';
    
    // Default meta tags
    res.locals.meta = {
        title: `${siteName} - Kıbrıs İlan Platformu`,
        description: 'Kuzey Kıbrıs\'ın en kapsamlı ücretsiz ilan, emlak, oto, alışveriş platformu.',
        keywords: 'kıbrıs ilan, kktc emlak, kıbrıs araba, ikinci el kıbrıs, lefkoşa, girne, mağusa',
        ogImage: '/img/og-default.jpg',
        canonical: `https://www.cypilan.com${req.originalUrl.split('?')[0]}`,
        robots: 'index, follow',
        siteName: siteName,
        url: `https://www.cypilan.com${req.originalUrl}`
    };

    // Default Schema.org
    res.locals.schemaOrg = {
        "@context": "https://schema.org",
        "@type": "WebSite",
        "name": siteName,
        "url": "https://www.cypilan.com",
        "potentialAction": {
            "@type": "SearchAction",
            "target": "https://www.cypilan.com/search?q={search_term_string}",
            "query-input": "required name=search_term_string"
        }
    };

    next();
};

module.exports = seoMiddleware;
