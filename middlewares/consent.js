const consentConfig = require('../config/consent');

// Onayı okuyup istek boyunca taşıyor. Karar veren tek yer burası; analitik ve
// şablon aynı nesneye bakıyor, böylece "banner kapandı ama analitik hâlâ
// çalışıyor" gibi bir ayrışma mümkün olmuyor.
const consentMiddleware = (req, res, next) => {
    const cookies = req.cookies || {};
    const consent = consentConfig.parse(cookies[consentConfig.COOKIE_NAME]);

    req.consent = consent;
    res.locals.consent = consent;

    // Onay geri alinabilir olmali. '?cerez=ayarla' karar verilmis olsa bile
    // banner'i yeniden aciyor; footer'daki "Cerez tercihleri" baglantisi bunu
    // kullaniyor. Istek hicbir seyi degistirmiyor, yalnizca soruyu tekrar
    // soruyor - degisiklik yine formun gonderimiyle oluyor.
    const reopened = Boolean(req.query && req.query.cerez === 'ayarla');
    res.locals.consentBannerOpen = !consent.decided || reopened;

    // Secimden sonra ziyaretci bulundugu yere donuyor ama parametre olmadan:
    // yoksa ayni adrese donup banner'i yeniden acik bulurdu.
    const back = new URL(req.originalUrl || '/', 'http://yerel');
    back.searchParams.delete('cerez');
    res.locals.consentReturnTo = back.pathname + back.search;

    next();
};

module.exports = consentMiddleware;
