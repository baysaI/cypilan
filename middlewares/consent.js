const consentConfig = require('../config/consent');

// Onayı okuyup istek boyunca taşıyor. Karar veren tek yer burası; analitik ve
// şablon aynı nesneye bakıyor, böylece "banner kapandı ama analitik hâlâ
// çalışıyor" gibi bir ayrışma mümkün olmuyor.
const consentMiddleware = (req, res, next) => {
    const cookies = req.cookies || {};
    const consent = consentConfig.parse(cookies[consentConfig.COOKIE_NAME]);

    req.consent = consent;
    res.locals.consent = consent;

    next();
};

module.exports = consentMiddleware;
