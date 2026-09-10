const { translate, supportedLanguages } = require('../config/i18n');
const appConfig = require('../config/app');

const DEFAULT_LANGUAGE = 'tr';
const SUPPORTED_CURRENCIES = ['TRY', 'GBP', 'EUR', 'USD'];
// Kibris'ta fiyatlar sterlin uzerinden konusuluyor, varsayilan o. Deger
// config/app.js icinden geliyor: orada zaten tanimliydi ama kimse okumuyordu,
// ve site para birimi ortama gore degisen bir sey degil - .env'e baglamak,
// sunucudaki dosyada eski deger kaldigi gun degisikligin sessizce etkisiz
// kalmasi demek olurdu.
const DEFAULT_CURRENCY = SUPPORTED_CURRENCIES.includes(appConfig.currencies.default)
    ? appConfig.currencies.default
    : 'GBP';

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

    // Cerez yalnizca acik bir secimde yaziliyor - para biriminde oldugu gibi.
    // Onceden hicbir sey secmemis ziyaretciye de ilk istekte bir yillik cerez
    // birakiliyordu; o cerez bir tercihi degil, yalnizca tarayicinin dil
    // basligindan cikarilan tahmini temsil ediyordu. Tahmin her istekte
    // yeniden yapilabilir, saklanmasi gerekmiyor.
    const chosenLang = req.query.lang;
    if (chosenLang && supportedLanguages.includes(chosenLang) && cookies.lang !== chosenLang) {
        res.cookie('lang', chosenLang, { maxAge: 31536000000, httpOnly: false, sameSite: 'lax' });
    }

    // Para birimi cerezi, ziyaretci hicbir sey secmese bile ilk istekte
    // yaziliyordu. Bedeli, varsayilani degistirmenin eski ziyaretcilere hicbir
    // sey ifade etmemesiydi: hepsinin tarayicisinda bir yil gecerli bir cerez
    // vardi ve o cerez bir tercihi degil, yalnizca o gunku varsayilani
    // temsil ediyordu - ikisini birbirinden ayirmanin da yolu yoktu.
    //
    // Artik cerez yalnizca acik bir secimde yaziliyor; secici her zaman
    // ?currency= ile geliyor. Secim yapmamis ziyaretci varsayilani goruyor ve
    // varsayilan degistiginde onunki de degisiyor.
    const chosenCurrency = req.query.currency;
    let currency = chosenCurrency || cookies.currency_choice || DEFAULT_CURRENCY;

    if (!SUPPORTED_CURRENCIES.includes(currency)) {
        currency = DEFAULT_CURRENCY;
    }

    if (chosenCurrency && SUPPORTED_CURRENCIES.includes(chosenCurrency)) {
        res.cookie('currency_choice', currency, { maxAge: 31536000000, httpOnly: false });
    }

    // Eskiden otomatik yazilan cerez artik okunmuyor; tarayicida bir yil daha
    // bosuna durmasin diye siliniyor.
    if (cookies.currency) {
        res.clearCookie('currency');
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
