const crypto = require('crypto');
const { getDb } = require('../config/database');

const IGNORED_PREFIXES = [
  '/css/',
  '/js/',
  '/img/',
  '/uploads/',
  '/favicon.ico',
  '/robots.txt',
  '/sitemap.xml',
  '/api/'
];

const isIgnoredPath = (path) => {
  if (!path) return true;
  return IGNORED_PREFIXES.some(prefix => path === prefix || path.startsWith(prefix));
};

// Tuzsuz bir IP ozeti anonimlestirme degil. Tum IPv4 uzayi 4,3 milyar adres:
// bir dizustu bilgisayar hepsini saniyeler icinde ozetleyip tabloyla
// eslestirebilir, yani md5(ip) pratikte IP'nin kendisidir. Gizli bir tuz bunu
// imkansiz kiliyor - tuzu bilmeyen listeyi kuramaz.
//
// Tuz yoksa ozet hic uretilmiyor. Zayif bir ozeti "anonim" diye saklamaktansa
// alani bos birakmak dogru; sayfa sayimi zaten oturum kimliginden yuruyor.
const ANALYTICS_SALT = process.env.ANALYTICS_SALT || process.env.SESSION_SECRET || '';

if (!ANALYTICS_SALT) {
  console.warn('[Analytics] ANALYTICS_SALT tanimli degil; IP ozeti saklanmayacak.');
}

const hashIp = (ip) => {
  if (!ip || !ANALYTICS_SALT) return null;
  return crypto.createHash('sha256').update(ANALYTICS_SALT).update(String(ip)).digest('hex').substring(0, 16);
};

const analyticsMiddleware = (req, res, next) => {
  // Only track GET page requests, ignore static assets
  if (req.method !== 'GET' || isIgnoredPath(req.path)) {
    return next();
  }

  // Analitik zorunlu degil, dolayisiyla onaydan once calismiyor. Karar
  // verilmemisse de calismiyor: sessizlik onay sayilmaz.
  if (!req.consent || !req.consent.analytics) {
    return next();
  }

  // Execute logging asynchronously after request lifecycle moves on
  setImmediate(() => {
    try {
      const db = getDb();
      const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '';
      const ipHash = hashIp(ip.split(',')[0].trim());
      const sessionId = req.sessionID || null;
      const userId = req.session?.userId || null;
      const path = req.path.substring(0, 255);

      db.prepare(`
        INSERT INTO page_views (session_id, user_id, path, ip_hash)
        VALUES (?, ?, ?, ?)
      `).run([sessionId, userId, path, ipHash]);
    } catch (err) {
      // Quietly swallow analytics errors so failure never impacts visitors
      console.error('Analytics record error:', err.message);
    }
  });

  next();
};

module.exports = analyticsMiddleware;
