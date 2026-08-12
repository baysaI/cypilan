const crypto = require('crypto');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const isMultipart = (req) => (req.get('content-type') || '').indexOf('multipart/form-data') === 0;

const wantsJson = (req) => req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1);

const tokensMatch = (supplied, expected) => {
    if (typeof supplied !== 'string' || typeof expected !== 'string') return false;
    const a = Buffer.from(supplied);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
};

const readToken = (req) =>
    (req.body && req.body._csrf) || req.get('x-csrf-token') || null;

const reject = (req, res) => {
    if (wantsJson(req)) {
        return res.status(403).json({
            error: res.locals.t('flash.csrf_failed_json')
        });
    }

    req.flash('error', 'flash.csrf_failed');
    return res.redirect(req.get('referer') || '/');
};

const csrfProtection = (req, res, next) => {
    if (!req.session) return next();

    if (!req.session.csrfToken) {
        req.session.csrfToken = crypto.randomBytes(32).toString('hex');
    }
    res.locals.csrfToken = req.session.csrfToken;

    if (SAFE_METHODS.has(req.method)) return next();

    // Multipart bodies are parsed by multer inside the route, so the token is not
    // readable yet. Those routes run verifyCsrf right after the upload middleware.
    if (isMultipart(req)) return next();

    if (tokensMatch(readToken(req), req.session.csrfToken)) return next();
    return reject(req, res);
};

const verifyCsrf = (req, res, next) => {
    if (tokensMatch(readToken(req), req.session && req.session.csrfToken)) return next();
    return reject(req, res);
};

module.exports = {
    csrfProtection,
    verifyCsrf
};
