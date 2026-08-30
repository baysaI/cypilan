const Setting = require('../models/Setting');

const MAX_MESSAGE = 500;

const show = async (req, res) => {
    try {
        const Report = require('../models/Report');
        const pendingReports = await Report.countPending();

        res.locals.meta.title = 'Sistem Ayarları | Admin Paneli';
        res.render('admin/maintenance', {
            layout: 'admin/layout',
            enabled: Setting.getBool(Setting.KEYS.MAINTENANCE_ENABLED, false),
            message: Setting.get(Setting.KEYS.MAINTENANCE_MESSAGE, ''),
            until: Setting.get(Setting.KEYS.MAINTENANCE_UNTIL, ''),
            lastChange: Setting.describe(Setting.KEYS.MAINTENANCE_ENABLED),
            unlimitedEnabled: Setting.getBool(Setting.KEYS.UNLIMITED_LISTINGS_MODE, false),
            unlimitedLastChange: Setting.describe(Setting.KEYS.UNLIMITED_LISTINGS_MODE),
            recentListingsEnabled: Setting.getBool(Setting.KEYS.SHOW_RECENT_LISTINGS, false),
            recentListingsLastChange: Setting.describe(Setting.KEYS.SHOW_RECENT_LISTINGS),
            loginRequiredEnabled: Setting.getBool(Setting.KEYS.LOGIN_REQUIRED, false),
            loginRequiredLastChange: Setting.describe(Setting.KEYS.LOGIN_REQUIRED),
            pendingReports,
            activePage: 'maintenance',
            title: 'Sistem Ayarları'
        });
    } catch (error) {
        console.error('Maintenance Page Error:', error);
        req.flash('error', 'flash.action_failed');
        res.redirect('/admin');
    }
};

const update = async (req, res) => {
    try {
        const enabled = Boolean(req.body.enabled);

        Setting.setBool(Setting.KEYS.MAINTENANCE_ENABLED, enabled, req.session.userId);
        Setting.set(
            Setting.KEYS.MAINTENANCE_MESSAGE,
            String(req.body.message || '').trim().slice(0, MAX_MESSAGE) || null,
            req.session.userId
        );

        // Only kept while the site is shut; a stale "back at 18:00" left over
        // from last week's outage would be worse than showing nothing.
        const until = String(req.body.until || '').trim();
        Setting.set(
            Setting.KEYS.MAINTENANCE_UNTIL,
            enabled && until ? until : null,
            req.session.userId
        );

        console.log(
            `[Maintenance] ${enabled ? 'AÇILDI' : 'kapatıldı'} — kullanıcı #${req.session.userId}`
        );

        req.flash('success', enabled ? 'flash.maintenance_on' : 'flash.maintenance_off');
        res.redirect('/admin/bakim');
    } catch (error) {
        console.error('Maintenance Update Error:', error);
        req.flash('error', 'flash.action_failed');
        res.redirect('/admin/bakim');
    }
};

const updateUnlimited = async (req, res) => {
    try {
        const enabled = Boolean(req.body.enabled);
        Setting.setBool(Setting.KEYS.UNLIMITED_LISTINGS_MODE, enabled, req.session.userId);

        console.log(
            `[UnlimitedListings] ${enabled ? 'AÇILDI' : 'kapatıldı'} — kullanıcı #${req.session.userId}`
        );

        req.flash('success', enabled ? 'flash.unlimited_mode_on' : 'flash.unlimited_mode_off');
        res.redirect('/admin/bakim');
    } catch (error) {
        console.error('Unlimited Mode Update Error:', error);
        req.flash('error', 'flash.action_failed');
        res.redirect('/admin/bakim');
    }
};

const updateRecentListings = async (req, res) => {
    try {
        const enabled = Boolean(req.body.enabled);
        Setting.setBool(Setting.KEYS.SHOW_RECENT_LISTINGS, enabled, req.session.userId);

        console.log(
            `[ShowRecentListings] ${enabled ? 'AÇILDI' : 'kapatıldı'} — kullanıcı #${req.session.userId}`
        );

        req.flash('success', enabled ? 'Son Eklenen İlanlar bölümü ana sayfada etkinleştirildi.' : 'Son Eklenen İlanlar bölümü ana sayfada gizlendi (pasife alındı).');
        res.redirect('/admin/bakim');
    } catch (error) {
        console.error('Show Recent Listings Update Error:', error);
        req.flash('error', 'flash.action_failed');
        res.redirect('/admin/bakim');
    }
};

const updateLoginRequired = async (req, res) => {
    try {
        const enabled = Boolean(req.body.enabled);
        Setting.setBool(Setting.KEYS.LOGIN_REQUIRED, enabled, req.session.userId);

        console.log(
            `[LoginRequired] ${enabled ? 'AÇILDI' : 'kapatıldı'} — kullanıcı #${req.session.userId}`
        );

        req.flash('success', enabled ? 'flash.login_required_mode_on' : 'flash.login_required_mode_off');
        res.redirect('/admin/bakim');
    } catch (error) {
        console.error('Login Required Update Error:', error);
        req.flash('error', 'flash.action_failed');
        res.redirect('/admin/bakim');
    }
};

module.exports = {
    show,
    update,
    updateUnlimited,
    updateRecentListings,
    updateLoginRequired,
    MAX_MESSAGE
};
