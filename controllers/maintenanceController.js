const Setting = require('../models/Setting');

const MAX_MESSAGE = 500;

const show = async (req, res) => {
    try {
        const Report = require('../models/Report');
        const pendingReports = await Report.countPending();

        res.locals.meta.title = 'Bakım Modu | Admin Paneli';
        res.render('admin/maintenance', {
            layout: 'admin/layout',
            enabled: Setting.getBool(Setting.KEYS.MAINTENANCE_ENABLED, false),
            message: Setting.get(Setting.KEYS.MAINTENANCE_MESSAGE, ''),
            until: Setting.get(Setting.KEYS.MAINTENANCE_UNTIL, ''),
            lastChange: Setting.describe(Setting.KEYS.MAINTENANCE_ENABLED),
            pendingReports,
            activePage: 'maintenance',
            title: 'Bakım Modu'
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

module.exports = {
    show,
    update,
    MAX_MESSAGE
};
