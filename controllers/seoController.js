const Category = require('../models/Category');
const cities = require('../config/cities');
const { getDb } = require('../config/database');

const DEFAULT_SITE_URL = 'https://www.cypilan.com';
let sitemapCache = null;
let sitemapCacheTime = 0;
const SITEMAP_CACHE_TTL = 30 * 60 * 1000; // 30 mins cache

const staticPages = [
    { url: '/', priority: '1.0', changefreq: 'daily' },
    { url: '/listings', priority: '0.9', changefreq: 'hourly' },
    { url: '/sss', priority: '0.6', changefreq: 'weekly' },
    { url: '/nasil-ilan-verilir', priority: '0.7', changefreq: 'weekly' },
    { url: '/ilan-paketleri', priority: '0.6', changefreq: 'weekly' },
    { url: '/guvenlik', priority: '0.6', changefreq: 'weekly' },
    { url: '/kurumsal', priority: '0.7', changefreq: 'weekly' },
    { url: '/reklam', priority: '0.5', changefreq: 'monthly' },
    { url: '/ogrenci', priority: '0.8', changefreq: 'weekly' },
    { url: '/yatirimci', priority: '0.8', changefreq: 'weekly' },
    { url: '/gizlilik-politikasi', priority: '0.3', changefreq: 'yearly' },
    { url: '/kullanim-kosullari', priority: '0.3', changefreq: 'yearly' },
    { url: '/cerez-politikasi', priority: '0.3', changefreq: 'yearly' }
];

const LANGUAGES = ['tr', 'en', 'el', 'ru', 'fa'];

const seoController = {
    sitemap: async (req, res) => {
        try {
            const now = Date.now();
            if (sitemapCache && (now - sitemapCacheTime) < SITEMAP_CACHE_TTL) {
                res.header('Content-Type', 'application/xml; charset=utf-8');
                res.header('Cache-Control', 'public, max-age=1800');
                return res.send(sitemapCache);
            }

            const baseUrl = (process.env.SITE_URL || DEFAULT_SITE_URL).replace(/\/$/, '');
            const today = new Date().toISOString().split('T')[0];

            let urlsXml = '';

            // 1. Static Pages
            for (const page of staticPages) {
                urlsXml += '  <url>\n';
                urlsXml += '    <loc>' + baseUrl + page.url + '</loc>\n';
                urlsXml += '    <lastmod>' + today + '</lastmod>\n';
                urlsXml += '    <changefreq>' + page.changefreq + '</changefreq>\n';
                urlsXml += '    <priority>' + page.priority + '</priority>\n';
                for (const lang of LANGUAGES) {
                    const separator = page.url.includes('?') ? '&amp;' : '?';
                    urlsXml += '    <xhtml:link rel="alternate" hreflang="' + lang + '" href="' + baseUrl + page.url + separator + 'lang=' + lang + '"/>\n';
                }
                urlsXml += '  </url>\n';
            }

            // 2. Categories & Subcategories
            const db = getDb();
            const mainCategories = db.prepare('SELECT * FROM categories WHERE parent_id IS NULL ORDER BY sort_order ASC').all();
            const subCategories = db.prepare('SELECT * FROM categories WHERE parent_id IS NOT NULL ORDER BY sort_order ASC').all();

            for (const cat of mainCategories) {
                const catUrl = '/listings?category=' + encodeURIComponent(cat.slug);
                urlsXml += '  <url>\n';
                urlsXml += '    <loc>' + baseUrl + catUrl + '</loc>\n';
                urlsXml += '    <lastmod>' + today + '</lastmod>\n';
                urlsXml += '    <changefreq>daily</changefreq>\n';
                urlsXml += '    <priority>0.85</priority>\n';
                for (const lang of LANGUAGES) {
                    urlsXml += '    <xhtml:link rel="alternate" hreflang="' + lang + '" href="' + baseUrl + catUrl + '&amp;lang=' + lang + '"/>\n';
                }
                urlsXml += '  </url>\n';

                const subs = subCategories.filter(s => s.parent_id === cat.id);
                for (const sub of subs) {
                    const subUrl = '/listings?category=' + encodeURIComponent(cat.slug) + '&amp;sub=' + encodeURIComponent(sub.slug);
                    urlsXml += '  <url>\n';
                    urlsXml += '    <loc>' + baseUrl + subUrl + '</loc>\n';
                    urlsXml += '    <lastmod>' + today + '</lastmod>\n';
                    urlsXml += '    <changefreq>daily</changefreq>\n';
                    urlsXml += '    <priority>0.80</priority>\n';
                    urlsXml += '  </url>\n';
                }
            }

            // 3. City landing pages
            const cityList = cities.CITIES || [];
            for (const city of cityList) {
                const cityUrl = '/listings?city=' + encodeURIComponent(city.name);
                urlsXml += '  <url>\n';
                urlsXml += '    <loc>' + baseUrl + cityUrl + '</loc>\n';
                urlsXml += '    <lastmod>' + today + '</lastmod>\n';
                urlsXml += '    <changefreq>daily</changefreq>\n';
                urlsXml += '    <priority>0.75</priority>\n';
                urlsXml += '  </url>\n';
            }

            // 4. Active & Approved Listings
            const listings = db.prepare(`
                SELECT slug, updated_at, created_at 
                FROM listings 
                WHERE status = 'active'
                ORDER BY updated_at DESC 
                LIMIT 10000
            `).all();

            for (const item of listings) {
                const dateStr = (item.updated_at || item.created_at || today).split(' ')[0];
                const listingUrl = '/listings/' + encodeURIComponent(item.slug);
                urlsXml += '  <url>\n';
                urlsXml += '    <loc>' + baseUrl + listingUrl + '</loc>\n';
                urlsXml += '    <lastmod>' + dateStr + '</lastmod>\n';
                urlsXml += '    <changefreq>weekly</changefreq>\n';
                urlsXml += '    <priority>0.90</priority>\n';
                for (const lang of LANGUAGES) {
                    urlsXml += '    <xhtml:link rel="alternate" hreflang="' + lang + '" href="' + baseUrl + listingUrl + '?lang=' + lang + '"/>\n';
                }
                urlsXml += '  </url>\n';
            }

            // 5. Public Business/Agent Stores & Profiles
            const sellers = db.prepare(`
                SELECT id, updated_at, created_at 
                FROM users 
                WHERE role IN ('business', 'agent') AND is_active = 1
                LIMIT 1000
            `).all();

            for (const seller of sellers) {
                const dateStr = (seller.updated_at || seller.created_at || today).split(' ')[0];
                const profileUrl = '/profile/' + seller.id;
                urlsXml += '  <url>\n';
                urlsXml += '    <loc>' + baseUrl + profileUrl + '</loc>\n';
                urlsXml += '    <lastmod>' + dateStr + '</lastmod>\n';
                urlsXml += '    <changefreq>weekly</changefreq>\n';
                urlsXml += '    <priority>0.70</priority>\n';
                urlsXml += '  </url>\n';
            }

            const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n        xmlns:xhtml="http://www.w3.org/1999/xhtml">\n' + urlsXml + '</urlset>';

            sitemapCache = xml;
            sitemapCacheTime = now;

            res.header('Content-Type', 'application/xml; charset=utf-8');
            res.header('Cache-Control', 'public, max-age=1800');
            return res.send(xml);
        } catch (err) {
            console.error('[SEO ERROR] Failed to generate sitemap.xml:', err);
            if (typeof res.status === 'function') res.status(500);
            res.send('Error generating sitemap');
        }
    },

    robots: (req, res) => {
        const baseUrl = (process.env.SITE_URL || DEFAULT_SITE_URL).replace(/\/$/, '');
        const robotsTxt = 'User-agent: *\n' +
            'Allow: /\n' +
            'Disallow: /admin/\n' +
            'Disallow: /panel/\n' +
            'Disallow: /messages/\n' +
            'Disallow: /auth/\n' +
            'Disallow: /favorites/\n' +
            'Disallow: /notifications/\n' +
            'Disallow: /api/\n' +
            'Disallow: /search?*\n' +
            'Disallow: /profile/edit\n' +
            'Disallow: /profile/taleplerim\n' +
            'Disallow: /profile/teklifler\n' +
            'Disallow: /profile/alarmlar\n' +
            'Disallow: /profile/listings\n' +
            'Disallow: /profile/favorites\n\n' +
            'Sitemap: ' + baseUrl + '/sitemap.xml\n';

        res.header('Content-Type', 'text/plain; charset=utf-8');
        res.header('Cache-Control', 'public, max-age=86400');
        res.send(robotsTxt);
    }
};

module.exports = seoController;
