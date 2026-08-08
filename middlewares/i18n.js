const fs = require('fs');
const path = require('path');

// Assuming translations are in config/i18n.json or similar structure
let translations = {};
try {
    const i18nPath = path.join(__dirname, '../config/i18n.js');
    if (fs.existsSync(i18nPath)) {
        translations = require(i18nPath);
    }
} catch (error) {
    console.error('Error loading translations:', error);
}

const SUPPORTED_LANGUAGES = ['tr', 'en', 'el', 'ru', 'fa'];
const DEFAULT_LANGUAGE = 'tr';
const SUPPORTED_CURRENCIES = ['TRY', 'GBP', 'EUR', 'USD'];
const DEFAULT_CURRENCY = 'TRY';

const i18nMiddleware = (req, res, next) => {
    // 1. Detect language
    let lang = req.query.lang || req.cookies.lang;
    
    if (!lang || !SUPPORTED_LANGUAGES.includes(lang)) {
        const acceptLang = req.headers['accept-language'];
        if (acceptLang) {
            const preferredLang = acceptLang.split(',')[0].split('-')[0].toLowerCase();
            if (SUPPORTED_LANGUAGES.includes(preferredLang)) {
                lang = preferredLang;
            } else {
                lang = DEFAULT_LANGUAGE;
            }
        } else {
            lang = DEFAULT_LANGUAGE;
        }
    }

    // Set cookie if changed or not present
    if (req.cookies.lang !== lang) {
        res.cookie('lang', lang, { maxAge: 31536000000, httpOnly: true }); // 1 year
    }

    // 2. Detect currency
    let currency = req.query.currency || req.cookies.currency || DEFAULT_CURRENCY;
    if (!SUPPORTED_CURRENCIES.includes(currency)) {
        currency = DEFAULT_CURRENCY;
    }

    // Set cookie if changed or not present
    if (req.cookies.currency !== currency) {
        res.cookie('currency', currency, { maxAge: 31536000000, httpOnly: true }); // 1 year
    }

    // 3. Setup locals
    res.locals.lang = lang;
    res.locals.currency = currency;
    res.locals.dir = lang === 'fa' ? 'rtl' : 'ltr';
    
    // Translation function
    res.locals.t = (key, params = {}) => {
        let text = key;
        
        if (translations[lang] && translations[lang][key]) {
            text = translations[lang][key];
        } else if (translations[DEFAULT_LANGUAGE] && translations[DEFAULT_LANGUAGE][key]) {
            text = translations[DEFAULT_LANGUAGE][key];
        }
        
        // Replace params
        Object.keys(params).forEach(p => {
            text = text.replace(new RegExp(`{${p}}`, 'g'), params[p]);
        });
        
        return text;
    };

    next();
};

module.exports = i18nMiddleware;
