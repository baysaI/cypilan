require('dotenv').config();

const express = require('express');
const path = require('path');
const expressLayouts = require('express-ejs-layouts');
const session = require('express-session');
const MemoryStore = require('memorystore')(session);
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');

const { initialize, seed, getDb } = require('./config/database');
const seoMiddleware = require('./middlewares/seo');
const i18nMiddleware = require('./middlewares/i18n');
const { setUserLocal } = require('./middlewares/auth');
const { csrfProtection } = require('./middlewares/csrf');
const routes = require('./routes/index');

const app = express();
const PORT = process.env.PORT || 3000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

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
      connectSrc: ["'self'"]
    }
  },
  crossOriginEmbedderPolicy: false
}));

app.use(compression());

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

app.use(session({
  store: new MemoryStore({
    checkPeriod: 86400000
  }),
  secret: SESSION_SECRET || 'cypilan-development-only-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: IS_PRODUCTION,
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
  res.locals.flash = {
    success: req.session.flashSuccess || null,
    error: req.session.flashError || null,
    info: req.session.flashInfo || null
  };
  delete req.session.flashSuccess;
  delete req.session.flashError;
  delete req.session.flashInfo;

  req.flash = (type, message) => {
    const key = `flash${type.charAt(0).toUpperCase() + type.slice(1)}`;
    req.session[key] = message;
  };

  next();
});

app.use(csrfProtection);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'layouts/main');
app.set('layout extractScripts', true);
app.set('layout extractStyles', true);

app.use(i18nMiddleware);
app.use(seoMiddleware);
app.use(setUserLocal);

const helpers = require('./utils/helpers');
app.use((req, res, next) => {
  res.locals.helpers = helpers;
  res.locals.currentPath = req.path;
  res.locals.siteUrl = process.env.SITE_URL || `http://localhost:${PORT}`;
  next();
});

app.use('/', routes);

app.use((req, res, next) => {
  res.locals.meta = {
    ...(res.locals.meta || {}),
    title: 'Sayfa Bulunamadı',
    description: 'Aradığınız sayfa bulunamadı.',
    robots: 'noindex, nofollow'
  };

  res.status(404).render('errors/404', { title: 'Sayfa Bulunamadı' }, (err, html) => {
    if (err) return next(err);
    res.send(html);
  });
});

app.use((err, req, res, next) => {
  console.error('Server Error:', err);

  if (res.headersSent) {
    return next(err);
  }

  const statusCode = err.status || 500;
  res.locals.meta = {
    ...(res.locals.meta || {}),
    title: 'Hata',
    description: 'Bir hata oluştu.',
    robots: 'noindex, nofollow'
  };

  res.status(statusCode).render('errors/500', { title: 'Hata' }, (renderErr, html) => {
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

    app.listen(PORT, () => {
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
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
