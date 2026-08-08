const { translate, supportedLanguages } = require('../config/i18n');

const DEFAULT_LANGUAGE = 'tr';
const SUPPORTED_CURRENCIES = ['TRY', 'GBP', 'EUR', 'USD'];
const DEFAULT_CURRENCY = 'TRY';

const i18nMiddleware = (req, res, next) => {
    const cookies = req.cookies || {};

    let lang = req.query.lang || cookies.lang;
    
    if (!lang || !supportedLanguages.includes(lang)) {
        const acceptLang = req.headers['accept-language'];
        if (acceptLang) {
            const preferredLang = acceptLang.split(',')[0].split('-')[0].toLowerCase();
            if (supportedLanguages.includes(preferredLang)) {
                lang = preferredLang;
            } else {
                lang = DEFAULT_LANGUAGE;
            }
        } else {
            lang = DEFAULT_LANGUAGE;
        }
    }

    if (cookies.lang !== lang) {
        res.cookie('lang', lang, { maxAge: 31536000000, httpOnly: false });
    }

    let currency = req.query.currency || cookies.currency || DEFAULT_CURRENCY;
    if (!SUPPORTED_CURRENCIES.includes(currency)) {
        currency = DEFAULT_CURRENCY;
    }

    if (cookies.currency !== currency) {
        res.cookie('currency', currency, { maxAge: 31536000000, httpOnly: false });
    }

    res.locals.lang = lang;
    res.locals.currency = currency;
    res.locals.dir = lang === 'fa' ? 'rtl' : 'ltr';

    res.locals.t = (key, params = {}) => {
        return translate(key, lang, params);
    };

    next();
};

module.exports = i18nMiddleware;
