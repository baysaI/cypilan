const faq = (req, res) => {
    res.locals.meta = res.locals.meta || {};
    res.locals.meta.title = `${res.locals.t('footer.faq')} | CYPILAN.COM`;
    res.render('pages/faq', { title: res.locals.t('footer.faq') });
};

const howToPost = (req, res) => {
    res.locals.meta = res.locals.meta || {};
    res.locals.meta.title = `${res.locals.t('footer.how_to_post')} | CYPILAN.COM`;
    res.render('pages/how-to-post', { title: res.locals.t('footer.how_to_post') });
};

const safety = (req, res) => {
    res.locals.meta = res.locals.meta || {};
    res.locals.meta.title = `${res.locals.t('footer.safety_tips')} | CYPILAN.COM`;
    res.render('pages/safety-tips', { title: res.locals.t('footer.safety_tips') });
};

const corporate = (req, res) => {
    res.locals.meta = res.locals.meta || {};
    res.locals.meta.title = `${res.locals.t('footer.corporate_membership')} | CYPILAN.COM`;
    res.render('pages/corporate', { title: res.locals.t('footer.corporate_membership') });
};

const advertise = (req, res) => {
    res.locals.meta = res.locals.meta || {};
    res.locals.meta.title = `${res.locals.t('footer.advertise')} | CYPILAN.COM`;
    res.render('pages/advertise', { title: res.locals.t('footer.advertise') });
};

const privacy = (req, res) => {
    res.locals.meta = res.locals.meta || {};
    res.locals.meta.title = `${res.locals.t('footer.privacy')} | CYPILAN.COM`;
    res.render('pages/privacy', { title: res.locals.t('footer.privacy') });
};

const terms = (req, res) => {
    res.locals.meta = res.locals.meta || {};
    res.locals.meta.title = `${res.locals.t('footer.terms')} | CYPILAN.COM`;
    res.render('pages/terms', { title: res.locals.t('footer.terms') });
};

const cookiePolicy = (req, res) => {
    res.locals.meta = res.locals.meta || {};
    res.locals.meta.title = `${res.locals.t('footer.cookie_policy')} | CYPILAN.COM`;
    res.render('pages/cookie-policy', { title: res.locals.t('footer.cookie_policy') });
};

module.exports = {
    faq,
    howToPost,
    safety,
    corporate,
    advertise,
    privacy,
    terms,
    cookiePolicy
};
