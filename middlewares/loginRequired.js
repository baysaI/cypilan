const Setting = require('../models/Setting');

// Closes the site to visitors who are not signed in.
//
// This is not maintenance mode wearing a different hat. Maintenance shuts the
// site for everyone but an admin and answers 503, because the outage is
// temporary and a search engine should come back later. This is a standing
// policy instead: the site works fine, it is simply members-only. So the answer
// is a redirect to the login page, and the visitor is told why they were moved.
//
// Four things it has to get right:
//
// 1. The routes that let somebody become a member stay open. Gating /auth would
//    produce a site nobody can ever enter — including the admin who turned the
//    switch on from another machine and now has no session on this one.
// 2. Where the visitor was heading is kept in req.session.returnTo, the same
//    field the login flow already reads. Signing in then lands on the listing
//    they clicked rather than dumping them on the home page.
// 3. XHR and /api callers get 401 JSON, not a redirect. A fetch() follows a 302
//    without complaining and would parse the login page as if it were data.
// 4. If the switch cannot be read the site stays open, matching maintenance
//    mode. Failing closed would turn a database hiccup into a locked door.
//
// One limit worth knowing: uploaded images stay reachable by direct URL.
// express.static serves /uploads earlier in the pipeline, before this gate ever
// runs. Closing that off means serving uploads through a handler that checks the
// session, which is a real change rather than a switch.

// /admin is on the list because its own isAuthenticated + isAdmin guards are
// stricter than this one; letting it through keeps a single explanation for why
// an admin was refused, instead of two gates answering at once.
const ALWAYS_OPEN = [
  '/auth',
  '/admin',
  '/robots.txt'
];

const isAlwaysOpen = (path) =>
  ALWAYS_OPEN.some((prefix) => path === prefix || path.startsWith(prefix + '/'));

const isSignedIn = (req) =>
  Boolean((req.session && req.session.userId) || (req.user && req.user.id));

const isAdmin = (req) => {
  const role = (req.session && req.session.userRole) || (req.user && req.user.role);
  return role === 'admin';
};

// Mirrors the test middlewares/auth.js already applies, so a caller that gets
// 401 from one gate does not get a redirect from the other.
const wantsJson = (req) =>
  Boolean(
    req.xhr ||
    (req.headers && req.headers.accept && req.headers.accept.includes('application/json')) ||
    (req.headers && req.headers['x-requested-with'] === 'XMLHttpRequest') ||
    (req.originalUrl && req.originalUrl.startsWith('/api/'))
  );

const loginRequiredMiddleware = (req, res, next) => {
  let enabled = false;

  try {
    enabled = Setting.getBool(Setting.KEYS.LOGIN_REQUIRED, false);
  } catch (error) {
    console.error('Login-required flag read failed:', error);
    return next();
  }

  if (!enabled) return next();

  if (isSignedIn(req)) {
    // Only the admin gets the banner. Every signed-in member passes this gate,
    // and telling all of them that guests are shut out is noise they cannot act
    // on anyway.
    if (isAdmin(req)) res.locals.loginRequiredBypass = true;
    return next();
  }

  if (isAlwaysOpen(req.path)) return next();

  if (wantsJson(req)) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  if (req.method === 'GET' && req.session) {
    req.session.returnTo = req.originalUrl;
  }

  // 'info', 'error' degil: ziyaretci bir sey yanlis yapmadi. Kirmizi hata
  // kutusu sitenin bozuldugunu dusundurur; buradaki mesaj bir aciklama.
  if (typeof req.flash === 'function') {
    req.flash('info', 'flash.site_login_required');
  }

  return res.redirect('/auth/login');
};

module.exports = loginRequiredMiddleware;
module.exports.ALWAYS_OPEN = ALWAYS_OPEN;
module.exports.isAlwaysOpen = isAlwaysOpen;
module.exports.wantsJson = wantsJson;
