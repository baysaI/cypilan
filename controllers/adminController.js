const fs = require('fs');
const path = require('path');
const User = require('../models/User');
const Listing = require('../models/Listing');
const Report = require('../models/Report');
const Message = require('../models/Message');

const PAGE_SIZE = 20;

const wantsJson = (req) => req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1);

const dashboard = async (req, res) => {
    try {
        const [listingCounts, totalUsers, pendingReports, recent] = await Promise.all([
            Listing.countByStatus(),
            User.countAll(),
            Report.countPending(),
            Listing.adminFindAll({}, 1, 8)
        ]);

        res.locals.meta.title = 'Admin Paneli | CYPILAN.COM';
        res.render('admin/dashboard', {
            layout: 'admin/layout',
            stats: {
                totalUsers,
                totalListings: listingCounts.total || 0,
                activeListings: listingCounts.active || 0,
                pendingListings: listingCounts.pending || 0,
                rejectedListings: listingCounts.rejected || 0,
                pendingReports
            },
            recentListings: recent.data,
            pendingReports,
            activePage: 'dashboard',
            title: 'Dashboard'
        });
    } catch (error) {
        console.error('Admin Dashboard Error:', error);
        req.flash('error', 'flash.admin_dashboard_failed');
        res.redirect('/');
    }
};

const users = async (req, res) => {
    try {
        const page = parseInt(req.query.page, 10) || 1;
        const filters = { role: req.query.role, q: req.query.q };
        const result = await User.findAll(page, PAGE_SIZE, filters);
        const pendingReports = await Report.countPending();

        res.locals.meta.title = 'Kullanıcı Yönetimi | Admin Paneli';
        res.render('admin/users', {
            layout: 'admin/layout',
            users: result.data,
            pagination: { page, totalItems: result.total, totalPages: result.pages },
            filters,
            pendingReports,
            activePage: 'users',
            title: 'Kullanıcılar'
        });
    } catch (error) {
        console.error('Admin Users Error:', error);
        req.flash('error', 'flash.admin_users_failed');
        res.redirect('/admin');
    }
};

const listings = async (req, res) => {
    try {
        const page = parseInt(req.query.page, 10) || 1;
        const filters = { status: req.query.status, q: req.query.q };
        const result = await Listing.adminFindAll(filters, page, PAGE_SIZE);
        const counts = await Listing.countByStatus();
        const pendingReports = await Report.countPending();

        res.locals.meta.title = 'İlan Yönetimi | Admin Paneli';
        res.render('admin/listings', {
            layout: 'admin/layout',
            listings: result.data,
            pagination: { page, totalItems: result.total, totalPages: result.pages },
            filters,
            counts,
            pendingReports,
            activePage: 'listings',
            title: 'İlanlar'
        });
    } catch (error) {
        console.error('Admin Listings Error:', error);
        req.flash('error', 'flash.admin_listings_failed');
        res.redirect('/admin');
    }
};

const reports = async (req, res) => {
    try {
        const page = parseInt(req.query.page, 10) || 1;
        const filters = { status: req.query.status || 'pending' };
        const result = await Report.findAll(filters, page, PAGE_SIZE);
        const pendingReports = await Report.countPending();

        res.locals.meta.title = 'Şikayet Yönetimi | Admin Paneli';
        res.render('admin/reports', {
            layout: 'admin/layout',
            reports: result.data,
            pagination: { page, totalItems: result.total, totalPages: result.pages },
            filters,
            pendingReports,
            activePage: 'reports',
            title: 'Şikayetler'
        });
    } catch (error) {
        console.error('Admin Reports Error:', error);
        req.flash('error', 'flash.admin_reports_failed');
        res.redirect('/admin');
    }
};

const reportConversation = async (req, res) => {
    try {
        const report = await Report.findById(parseInt(req.params.id, 10));

        if (!report) {
            req.flash('error', 'flash.report_not_found');
            return res.redirect('/admin/reports');
        }

        if (!report.reported_user_id) {
            req.flash('error', 'flash.report_not_conversation');
            return res.redirect('/admin/reports');
        }

        const messages = await Message.getConversation(
            report.reporter_id,
            report.reported_user_id,
            report.listing_id != null ? report.listing_id : null
        );

        const pendingReports = await Report.countPending();

        res.locals.meta.title = 'Şikayet Edilen Sohbet | Admin Paneli';
        res.render('admin/conversation', {
            layout: 'admin/layout',
            report,
            messages,
            pendingReports,
            activePage: 'reports',
            title: 'Şikayet Edilen Sohbet'
        });
    } catch (error) {
        console.error('Admin Report Conversation Error:', error);
        req.flash('error', 'flash.conversation_load_failed');
        res.redirect('/admin/reports');
    }
};

const toggleListingStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        if (!['active', 'pending', 'rejected'].includes(status)) {
            if (wantsJson(req)) return res.status(400).json({ error: res.locals.t('flash.invalid_status') });
            req.flash('error', 'flash.invalid_status');
            return res.redirect('/admin/listings');
        }

        const updated = await Listing.updateStatus(id, status);
        if (!updated) {
            if (wantsJson(req)) return res.status(404).json({ error: res.locals.t('flash.listing_not_found') });
            req.flash('error', 'flash.listing_not_found');
            return res.redirect('/admin/listings');
        }

        if (wantsJson(req)) return res.json({ success: true, status });

        req.flash('success', `flash.listing_set_${status}`);
        res.redirect(req.get('referer') || '/admin/listings');
    } catch (error) {
        console.error('Admin Toggle Listing Error:', error);
        if (wantsJson(req)) return res.status(500).json({ error: res.locals.t('flash.action_failed') });
        req.flash('error', 'flash.action_failed');
        res.redirect('/admin/listings');
    }
};

const deleteListing = async (req, res) => {
    try {
        const { id } = req.params;
        const listing = await Listing.findById(id);

        if (!listing) {
            if (wantsJson(req)) return res.status(404).json({ error: res.locals.t('flash.listing_not_found') });
            req.flash('error', 'flash.listing_not_found');
            return res.redirect('/admin/listings');
        }

        const images = await Listing.getImages(id);
        await Listing.delete(id);

        images.forEach((imageUrl) => {
            if (typeof imageUrl !== 'string' || !imageUrl.startsWith('/uploads/listings/')) return;
            const filePath = path.join(__dirname, '..', 'public', imageUrl);
            fs.promises.unlink(filePath).catch(() => {});
        });

        if (wantsJson(req)) return res.json({ success: true });

        req.flash('success', 'flash.listing_permanently_deleted');
        res.redirect(req.get('referer') || '/admin/listings');
    } catch (error) {
        console.error('Admin Delete Listing Error:', error);
        if (wantsJson(req)) return res.status(500).json({ error: res.locals.t('flash.delete_failed') });
        req.flash('error', 'flash.delete_failed');
        res.redirect('/admin/listings');
    }
};

const toggleUserStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        if (!['active', 'suspended'].includes(status)) {
            if (wantsJson(req)) return res.status(400).json({ error: res.locals.t('flash.invalid_status') });
            req.flash('error', 'flash.invalid_status');
            return res.redirect('/admin/users');
        }

        if (parseInt(id, 10) === req.session.userId) {
            if (wantsJson(req)) return res.status(400).json({ error: res.locals.t('flash.cannot_suspend_self') });
            req.flash('error', 'flash.cannot_suspend_self');
            return res.redirect('/admin/users');
        }

        const updated = await User.setActive(id, status === 'active');
        if (!updated) {
            if (wantsJson(req)) return res.status(404).json({ error: res.locals.t('flash.user_not_found') });
            req.flash('error', 'flash.user_not_found');
            return res.redirect('/admin/users');
        }

        if (wantsJson(req)) return res.json({ success: true, status });

        req.flash('success', status === 'active' ? 'flash.user_activated' : 'flash.user_suspended');
        res.redirect(req.get('referer') || '/admin/users');
    } catch (error) {
        console.error('Admin Toggle User Error:', error);
        if (wantsJson(req)) return res.status(500).json({ error: res.locals.t('flash.action_failed') });
        req.flash('error', 'flash.action_failed');
        res.redirect('/admin/users');
    }
};

const resolveReport = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, admin_note } = req.body;

        if (!['reviewed', 'resolved', 'dismissed'].includes(status)) {
            req.flash('error', 'flash.invalid_status');
            return res.redirect('/admin/reports');
        }

        await Report.updateStatus(id, status, admin_note || null);

        req.flash('success', status === 'dismissed' ? 'flash.report_dismissed' : 'flash.report_processed');
        res.redirect(req.get('referer') || '/admin/reports');
    } catch (error) {
        console.error('Admin Resolve Report Error:', error);
        req.flash('error', 'flash.action_failed');
        res.redirect('/admin/reports');
    }
};

module.exports = {
    dashboard,
    users,
    listings,
    reports,
    reportConversation,
    toggleListingStatus,
    deleteListing,
    toggleUserStatus,
    resolveReport
};
