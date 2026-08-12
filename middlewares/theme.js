const THEMES = ['light', 'dark'];
const DEFAULT_THEME = 'light';
const COOKIE_MAX_AGE = 31536000000;

// Resolved server-side so the document is rendered with the right theme from the
// first byte, with no client-side correction and so no flash. Light is the
// baseline; dark is opt-in and remembered per browser.
const themeMiddleware = (req, res, next) => {
    const cookies = req.cookies || {};
    let theme = req.query.theme || cookies.theme;

    // Also catches the retired 'auto' value, which falls back to light.
    if (!THEMES.includes(theme)) {
        theme = DEFAULT_THEME;
    }

    if (cookies.theme !== theme) {
        res.cookie('theme', theme, { maxAge: COOKIE_MAX_AGE, httpOnly: false, sameSite: 'lax' });
    }

    res.locals.theme = theme;

    next();
};

module.exports = themeMiddleware;
module.exports.THEMES = THEMES;
module.exports.DEFAULT_THEME = DEFAULT_THEME;
