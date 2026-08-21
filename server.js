require('dotenv').config();

const express = require('express');
const path = require('path');
const expressLayouts = require('express-ejs-layouts');
const session = require('express-session');
const SqliteStore = require('better-sqlite3-session-store')(session);
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');

const { initialize, seed, getDb, closeDb } = require('./config/database');
const seoMiddleware = require('./middlewares/seo');
const i18nMiddleware = require('./middlewares/i18n');
const themeMiddleware = require('./middlewares/theme');
const { setUserLocal } = require('./middlewares/auth');
const { csrfProtection } = require('./middlewares/csrf');
const maintenanceMiddleware = require('./middlewares/maintenance');
const routes = require('./routes/index');

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// The stylesheet and script were tagged with Date.now() on every render, so the
// query string differed on every page view and no browser ever reused what it
// had already downloaded — 116 KB of CSS and JS fetched again on each
// navigation, and the cache header above rendered pointless. The stamp is taken
// once at boot instead: a deploy restarts the process and so still busts the
// cache, but between deploys the URL holds still and the cache can do its job.
const ASSET_VERSION = Date.now().toString(36);

const SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET && IS_PRODUCTION) {
  console.error('FATAL: SESSION_SECRET tanımlı değil. Üretim ortamında oturumlar taklit edilebilir hale gelir.');
  process.exit(1);
}

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "cdn.jsdelivr.net", "cdnjs.cloudflare.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "cdn.jsdelivr.net", "cdnjs.cloudflare.com", "fonts.googleapis.com"],
      fontSrc: ["'self'", "fonts.gstatic.com", "cdnjs.cloudflare.com", "cdn.jsdelivr.net"],
      imgSrc: ["'self'", "data:", "blob:", "http:", "https:"],
      connectSrc: ["'self'"],

      // Helmet turns upgrade-insecure-requests on by default. Over plain http
      // it tells the browser to fetch every same-origin asset over https
      // instead — so a phone opening http://192.168.1.x:3000 gets the HTML but
      // no stylesheet, no script and no images: the upgraded requests hit a
      // port that speaks no TLS and fail silently. Chrome exempts localhost as
      // a trustworthy origin, which is why the same build looks correct on the
      // development machine and broken on a phone on the same network.
      // Production is served over TLS, so it keeps the directive.
      upgradeInsecureRequests: IS_PRODUCTION ? [] : null
    }
  },

  // Same reasoning: a browser only honours HSTS over https, but sending it
  // from a development server invites a stale policy on any hostname the
  // developer later reuses.
  strictTransportSecurity: IS_PRODUCTION,
  crossOriginEmbedderPolicy: false
}));

app.use(compression());

// cypilan.com and www.cypilan.com both served the site, and a cookie set on one
// host is never sent to the other. A session started on www therefore became
// invisible the moment Google returned the visitor to the apex — the address
// GOOGLE_CALLBACK_URL names — so the sign-in completed against a second, empty
// session and the visitor landed back on the site still logged out.
//
// SITE_URL already names the address the rest of the app treats as canonical
// (sitemap, canonical tags, og:image, e-mail links), so that is the host
// everything is funnelled onto. Localhost and bare IPs are left alone, or LAN
// and development testing would be redirected off the machine running them.
const canonicalHost = (() => {
  try {
    return process.env.SITE_URL ? new URL(process.env.SITE_URL).host : null;
  } catch (error) {
    return null;
  }
})();

const isLocalHost = (host) => /^(localhost|127\.|\[?::1\]?|\d+\.\d+\.\d+\.\d+)/i.test(host);

if (canonicalHost && !isLocalHost(canonicalHost)) {
  app.use((req, res, next) => {
    const host = req.get('host');
    if (!host || isLocalHost(host)) return next();

    // Plain http still answered with a page rather than pointing at the secure
    // address, so search engines indexed http://cypilan.com beside the real one
    // and a visitor could stay on an unencrypted connection without noticing.
    //
    // The scheme is trusted only when the proxy states it. A missing header is
    // deliberately read as "already fine": inferring http from its absence would
    // bounce an https request back to https forever, and a redirect loop takes
    // the whole site down to fix a canonical address.
    const overPlainHttp = req.get('x-forwarded-proto') === 'http';

    if (host === canonicalHost && !overPlainHttp) return next();

    return res.redirect(301, `https://${canonicalHost}${req.originalUrl}`);
  });
}


const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: 'Çok fazla istek gönderdiniz. Lütfen daha sonra tekrar deneyin.'
});
app.use('/api/', limiter);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

app.use((req, res, next) => {
  if (req.body && req.body._method) {
    req.method = req.body._method.toUpperCase();
    delete req.body._method;
  }
  next();
});

app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: IS_PRODUCTION ? '7d' : 0,
  etag: true
}));

// Sessions live in the database rather than in memory, so a restart no longer
// signs everybody out and a second worker sees the same sessions.
app.use(session({
  store: new SqliteStore({
    client: getDb(),
    expired: { clear: true, intervalMs: 15 * 60 * 1000 }
  }),
  secret: SESSION_SECRET || 'cypilan-development-only-secret',
  resave: false,
  saveUninitialized: true,
  cookie: {
    secure: 'auto',
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    sameSite: 'lax'
  },
  name: 'cypilan.sid'
}));

const passport = require('./config/passport');
app.use(passport.initialize());
app.use(passport.session());

app.use((req, res, next) => {
  const flashSuccess = req.session ? (req.session.flashSuccess || null) : null;
  const flashError = req.session ? (req.session.flashError || null) : null;
  const flashInfo = req.session ? (req.session.flashInfo || null) : null;

  res.locals.flash = {
    success: flashSuccess,
    error: flashError,
    info: flashInfo
  };
  res.locals.success = flashSuccess;
  res.locals.error = flashError;
  res.locals.info = flashInfo;

  if (req.session) {
    delete req.session.flashSuccess;
    delete req.session.flashError;
    delete req.session.flashInfo;
  }

  // Messages are stored translated: the reader is the same user in the same
  // request cycle, so the language is already known here. Anything that does not
  // look like a locale key is passed through as literal text.
  const LOOKS_LIKE_KEY = /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/;

  req.flash = (type, message, params) => {
    const key = `flash${type.charAt(0).toUpperCase() + type.slice(1)}`;
    const translate = res.locals.t;

    req.session[key] = (typeof translate === 'function' && LOOKS_LIKE_KEY.test(message))
      ? translate(message, params || {})
      : message;
  };

  next();
});

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'layouts/main');
app.set('layout extractScripts', true);
app.set('layout extractStyles', true);

// After i18n so that a rejected request can report the failure in the
// visitor's own language.
const analyticsMiddleware = require('./middlewares/analytics');
app.use(i18nMiddleware);
app.use(themeMiddleware);
app.use(csrfProtection);
app.use(seoMiddleware);
app.use(setUserLocal);
app.use(analyticsMiddleware);

const helpers = require('./utils/helpers');
const cities = require('./config/cities');
// The listing card is included from six templates and every one of them renders
// badges, so the definitions are a global local rather than something each
// controller has to remember to pass.
const listingBadges = require('./config/listingBadges');
app.use((req, res, next) => {
  res.locals.helpers = helpers;
  res.locals.cities = cities;
  res.locals.listingBadges = listingBadges;
  res.locals.currentPath = req.path;
  res.locals.assetVersion = ASSET_VERSION;
  // Absolute URLs in the page (canonical, og:image, structured data) follow the
  // configured site address in production. In development they follow the host
  // the request came in on, so a phone testing over the LAN does not read a
  // page full of links to its own localhost.
  res.locals.siteUrl = IS_PRODUCTION
    ? (process.env.SITE_URL || `http://localhost:${PORT}`)
    : `${req.protocol}://${req.get('host')}`;
  next();
});

// Last gate before the routes: session, language and user are already resolved,
// so the closed-for-maintenance page can be rendered in the visitor's language
// and an admin can be recognised and let through.
app.use(maintenanceMiddleware);

app.use('/', routes);

app.use((req, res, next) => {
  const fallbackT = (k) => {
    const map = {
      'errors.not_found_title': 'Sayfa Bulunamadı',
      'errors.not_found_message': 'Aradığınız sayfa bulunamadı.',
      'nav.home': 'Ana Sayfa',
      'nav.all_listings': 'Tüm İlanlar'
    };
    return map[k] || k;
  };

  const translate = (typeof res.locals.t === 'function') ? res.locals.t : fallbackT;
  res.locals.t = translate;
  res.locals.lang = res.locals.lang || 'tr';
  res.locals.dir = res.locals.dir || 'ltr';
  res.locals.theme = res.locals.theme || 'light';
  res.locals.currentUser = res.locals.currentUser || null;
  res.locals.user = res.locals.user || null;
  res.locals.helpers = res.locals.helpers || helpers;
  res.locals.cities = res.locals.cities || cities;
  res.locals.listingBadges = res.locals.listingBadges || listingBadges;
  res.locals.assetVersion = res.locals.assetVersion || ASSET_VERSION;
  res.locals.meta = {
    ...(res.locals.meta || {}),
    title: 'Sayfa Bulunamadı',
    description: 'Aradığınız sayfa bulunamadı.',
    robots: 'noindex, nofollow'
  };

  res.status(404).render('errors/404', {
    title: 'Sayfa Bulunamadı',
    t: translate,
    lang: res.locals.lang,
    dir: res.locals.dir,
    theme: res.locals.theme,
    currentUser: res.locals.currentUser,
    user: res.locals.user
  }, (err, html) => {
    if (err) return next(err);
    res.send(html);
  });
});

app.use((err, req, res, next) => {
  if (err.code === 'ECONNABORTED' || err.type === 'request.aborted') {
    if (!res.headersSent) {
      return res.status(400).send('Request aborted');
    }
    return;
  }

  console.error('Server Error:', err);

  if (res.headersSent) {
    return next(err);
  }

  const statusCode = err.status || 500;
  const fallbackT = (k) => {
    const map = {
      'errors.server_error_title': 'Sunucu Hatası',
      'errors.server_error_message': 'Beklenmeyen bir hata oluştu.',
      'nav.home': 'Ana Sayfa',
      'common.try_again': 'Tekrar Dene'
    };
    return map[k] || k;
  };

  const translate = (typeof res.locals.t === 'function') ? res.locals.t : fallbackT;
  res.locals.t = translate;
  res.locals.lang = res.locals.lang || 'tr';
  res.locals.dir = res.locals.dir || 'ltr';
  res.locals.theme = res.locals.theme || 'light';
  res.locals.currentUser = res.locals.currentUser || null;
  res.locals.user = res.locals.user || null;
  res.locals.helpers = res.locals.helpers || helpers;
  res.locals.cities = res.locals.cities || cities;
  res.locals.listingBadges = res.locals.listingBadges || listingBadges;
  res.locals.assetVersion = res.locals.assetVersion || ASSET_VERSION;
  res.locals.meta = {
    ...(res.locals.meta || {}),
    title: 'Hata',
    description: 'Bir hata oluştu.',
    robots: 'noindex, nofollow'
  };

  res.status(statusCode).render('errors/500', {
    title: 'Hata',
    t: translate,
    lang: res.locals.lang,
    dir: res.locals.dir,
    theme: res.locals.theme,
    currentUser: res.locals.currentUser,
    user: res.locals.user
  }, (renderErr, html) => {
    if (renderErr) {
      console.error('Error page render failed:', renderErr);
      return res.type('text/plain').send('Bir hata oluştu. Lütfen daha sonra tekrar deneyin.');
    }
    res.send(html);
  });
});

async function startServer() {
  try {
    console.log('🔧 Initializing database...');
    await initialize();

    console.log('🌱 Seeding database...');
    await seed();

    const Listing = require('./models/Listing');
    const sweepExpiredListings = async () => {
      try {
        const expired = await Listing.expireOverdue();
        if (expired > 0) console.log(`⏳ ${expired} ilan süresi doldu olarak işaretlendi.`);
      } catch (error) {
        console.error('Expiry sweep failed:', error);
      }
    };

    await sweepExpiredListings();
    setInterval(sweepExpiredListings, 24 * 60 * 60 * 1000).unref();

    const server = app.listen(PORT, () => {
      console.log('');
      console.log('╔══════════════════════════════════════════════╗');
      console.log('║                                              ║');
      console.log('║   🌊 CYPILAN.COM - Kıbrıs İlan Platformu    ║');
      console.log('║                                              ║');
      console.log(`║   🚀 Server: http://localhost:${PORT}            ║`);
      console.log(`║   📦 Environment: ${(process.env.NODE_ENV || 'development').padEnd(22)}  ║`);
      console.log('║                                              ║');
      console.log('╚══════════════════════════════════════════════╝');
      console.log('');
    });

    // Closing the database checkpoints the write-ahead log, so a restart never
    // leaves recent writes stranded in the -wal file.
    const shutdown = (signal) => {
      console.log(`\n${signal} alındı, kapatılıyor...`);
      server.close(() => {
        closeDb();
        process.exit(0);
      });
    };

    ['SIGINT', 'SIGTERM'].forEach((signal) => process.on(signal, () => shutdown(signal)));
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
