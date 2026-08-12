const THEMES = ['auto', 'light', 'dark'];
const DEFAULT_THEME = 'auto';
const COOKIE_MAX_AGE = 31536000000;

// Resolved server-side so the document is rendered with the right theme from the
// first byte. 'auto' is the exception: the browser is the only one that knows the
// OS preference, so the layout resolves that one inline before first paint.
const themeMiddleware = (req, res, next) => {
    const cookies = req.cookies || {};
    let theme = req.query.theme || cookies.theme;

    if (!THEMES.includes(theme)) {
        theme = DEFAULT_THEME;
    }

    if (cookies.theme !== theme) {
        res.cookie('theme', theme, { maxAge: COOKIE_MAX_AGE, httpOnly: false, sameSite: 'lax' });
    }

    res.locals.theme = theme;
    res.locals.resolvedTheme = theme === 'auto' ? null : theme;

    next();
};

module.exports = themeMiddleware;
module.exports.THEMES = THEMES;
