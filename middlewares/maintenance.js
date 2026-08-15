const Setting = require('../models/Setting');

// Closes the site to visitors while an admin works on it.
//
// Three things this has to get right, all of them about not making a bad
// situation worse:
//
// 1. The admin who switched it on must still be able to switch it off. The
//    panel and the login routes stay open, otherwise the only way back is
//    editing the database by hand — from a machine that may not be to hand.
// 2. The answer is 503, not 200. A 200 tells a search engine that the page's
//    real content is now "we are closed", and it will index that. A 503 with
//    Retry-After says "temporarily unavailable, come back", and rankings
//    survive the outage.
// 3. Static files are served earlier in the pipeline, so the closed-for-
//    maintenance page still has its stylesheet. A maintenance page that
//    arrives unstyled reads as a broken site rather than a planned pause.

const DEFAULT_RETRY_SECONDS = 3600;

// Paths that stay reachable. Login is on the list because a locked-out admin
// arriving on a fresh browser has no session to prove themselves with yet.
const ALWAYS_OPEN = [
  '/admin',
  '/auth/login',
  '/auth/logout',
  '/auth/google'
];

const isAlwaysOpen = (path) =>
  ALWAYS_OPEN.some((prefix) => path === prefix || path.startsWith(prefix + '/'));

const isAdmin = (req) => {
  const role = (req.session && req.session.userRole) || (req.user && req.user.role);
  return role === 'admin';
};

const retryAfterSeconds = (until) => {
  if (!until) return DEFAULT_RETRY_SECONDS;

  const target = Date.parse(until);
  if (!Number.isFinite(target)) return DEFAULT_RETRY_SECONDS;

  const seconds = Math.round((target - Date.now()) / 1000);
  // A negative or absurd value would be worse than the default: it tells a
  // crawler either to retry instantly, forever, or not for a month.
  if (seconds <= 0) return 60;
  return Math.min(seconds, 24 * 60 * 60);
};

const maintenanceMiddleware = (req, res, next) => {
  let enabled = false;

  try {
    enabled = Setting.getBool(Setting.KEYS.MAINTENANCE_ENABLED, false);
  } catch (error) {
    // If the switch cannot be read the site stays open. Failing closed here
    // would turn a database hiccup into a full outage.
    console.error('Maintenance flag read failed:', error);
    return next();
  }

  if (!enabled) return next();
  if (isAlwaysOpen(req.path)) return next();

  if (isAdmin(req)) {
    // The banner is what stops an admin from forgetting the site is shut.
    res.locals.maintenanceBypass = true;
    return next();
  }

  const message = Setting.get(Setting.KEYS.MAINTENANCE_MESSAGE, '') || '';
  const until = Setting.get(Setting.KEYS.MAINTENANCE_UNTIL, '') || '';

  res.set('Retry-After', String(retryAfterSeconds(until)));
  res.locals.meta = Object.assign({}, res.locals.meta, {
    title: res.locals.t ? res.locals.t('maintenance.title') : 'Bakım',
    robots: 'noindex, nofollow'
  });

  return res.status(503).render('errors/maintenance', {
    maintenanceMessage: message,
    maintenanceUntil: until,
    title: res.locals.t ? res.locals.t('maintenance.title') : 'Bakım'
  }, (renderErr, html) => {
    if (renderErr) {
      console.error('Maintenance page render failed:', renderErr);
      return res.type('text/plain').send(message || 'Site is temporarily unavailable for maintenance.');
    }
    res.send(html);
  });
};

module.exports = maintenanceMiddleware;
module.exports.ALWAYS_OPEN = ALWAYS_OPEN;
module.exports.isAlwaysOpen = isAlwaysOpen;
module.exports.retryAfterSeconds = retryAfterSeconds;
