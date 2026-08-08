const { translate, supportedLanguages } = require('../config/i18n');

const DEFAULT_LANGUAGE = 'tr';
const SUPPORTED_CURRENCIES = ['TRY', 'GBP', 'EUR', 'USD'];
const DEFAULT_CURRENCY = 'TRY';

const i18nMiddleware = (req, res, next) => {
    const cookies = req.cookies || {};
    
    // 1. Detect language
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

    // Set cookie if changed or not present
    if (cookies.lang !== lang) {
        res.cookie('lang', lang, { maxAge: 31536000000, httpOnly: false }); // 1 year
    }

    // 2. Detect currency
    let currency = req.query.currency || cookies.currency || DEFAULT_CURRENCY;
    if (!SUPPORTED_CURRENCIES.includes(currency)) {
        currency = DEFAULT_CURRENCY;
    }

    // Set cookie if changed or not present
    if (cookies.currency !== currency) {
        res.cookie('currency', currency, { maxAge: 31536000000, httpOnly: false }); // 1 year
    }

    // 3. Setup locals
    res.locals.lang = lang;
    res.locals.currency = currency;
    res.locals.dir = lang === 'fa' ? 'rtl' : 'ltr';
    
    // Translation function
    res.locals.t = (key, params = {}) => {
        return translate(key, lang, params);
    };

    next();
};

module.exports = i18nMiddleware;
