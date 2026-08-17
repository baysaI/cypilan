const fs = require('fs');
const path = require('path');
const User = require('../models/User');
const Listing = require('../models/Listing');
const Report = require('../models/Report');
const Message = require('../models/Message');
const Warning = require('../models/Warning');
const Notification = require('../models/Notification');
const ServiceRequest = require('../models/ServiceRequest');
const Analytics = require('../models/Analytics');
const mailer = require('../config/mailer');
const { translate } = require('../config/i18n');

const PAGE_SIZE = 20;

// A notification is stored translated, but unlike a flash message its reader is
// somebody other than the admin who triggered it. Using res.locals.t here would
// write the text in the moderator's language and send it to a member who may not
// read it. Their own preference is on the row.
const translatorFor = (user) => (key, params) => translate(key, (user && user.language_pref) || 'tr', params);

const wantsJson = (req) => req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1);

const dashboard = async (req, res) => {
    try {
        const [listingCounts, totalUsers, pendingReports, recent, analyticsSummary, dailyTrends, categoryDist, roleDist, statusDist] = await Promise.all([
            Listing.countByStatus(),
            User.countAll(),
            Report.countPending(),
            Listing.adminFindAll({}, 1, 8),
            Analytics.getSummary(),
            Analytics.getDailyTrends(30),
            Analytics.getCategoryDistribution(),
            Analytics.getRoleDistribution(),
            Analytics.getStatusDistribution()
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
            analytics: {
                summary: analyticsSummary,
                trends: dailyTrends,
                categories: categoryDist,
                roles: roleDist,
                statuses: statusDist
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

        // Warnings for exactly the rows on screen: the badge shows how close each
        // member is to an automatic suspension, and the expandable row beneath it
        // shows the warnings themselves — reason, note, who issued it and when.
        // The history already contains the standing count, so asking countActive
        // for it as well would be a second query per row for a number in hand.
        const warningHistory = {};
        const warningCounts = {};
        await Promise.all(result.data.map(async (user) => {
            const history = await Warning.forUser(user.id, 20);
            warningHistory[user.id] = history;
            warningCounts[user.id] = history.filter((warning) => Number(warning.is_active) === 1).length;
        }));

        res.locals.meta.title = 'Kullanıcı Yönetimi | Admin Paneli';
        res.render('admin/users', {
            layout: 'admin/layout',
            users: result.data,
            pagination: { page, totalItems: result.total, totalPages: result.pages },
            filters,
            pendingReports,
            warningCounts,
            warningHistory,
            suspensionThreshold: Warning.SUSPENSION_THRESHOLD,
            reportReasons: Report.listingReasons,
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

        const listingObj = await Listing.findById(id);
        if (listingObj && listingObj.user_id) {
            const owner = await User.findById(listingObj.user_id);
            const reason = req.body.reason || req.body.rejection_reason || null;
            if (owner && owner.email) {
                const listingUrl = `${mailer.baseUrlFor(req)}/listings/${id}`;
                mailer.sendListingStatusEmail({
                    to: owner.email,
                    listingTitle: listingObj.title,
                    status,
                    reason,
                    listingUrl
                }).catch(err => console.error('Listing status email error:', err));
            }

            // In-app notification for listing approval/rejection
            try {
                const Notification = require('../models/Notification');
                const t = res.locals.t || ((k) => k);
                if (status === 'rejected') {
                    const reasonText = reason ? ` (Neden: ${reason})` : '';
                    await Notification.create({
                        user_id: listingObj.user_id,
                        actor_id: req.session.userId,
                        type: 'warning',
                        title: t('notifications.listing_rejected_title') !== 'notifications.listing_rejected_title' ? t('notifications.listing_rejected_title') : 'İlanınız Reddedildi',
                        message: t('notifications.listing_rejected_message', { title: listingObj.title, reason: reasonText }) !== 'notifications.listing_rejected_message'
                            ? t('notifications.listing_rejected_message', { title: listingObj.title, reason: reasonText })
                            : `«${listingObj.title}» başlıklı ilanınız incelendi ve reddedildi.${reasonText}`,
                        link_url: '/profile/listings'
                    });
                } else if (status === 'active') {
                    await Notification.create({
                        user_id: listingObj.user_id,
                        actor_id: req.session.userId,
                        type: 'system',
                        title: t('notifications.listing_approved_title') !== 'notifications.listing_approved_title' ? t('notifications.listing_approved_title') : 'İlanınız Yayında',
                        message: t('notifications.listing_approved_message', { title: listingObj.title }) !== 'notifications.listing_approved_message'
                            ? t('notifications.listing_approved_message', { title: listingObj.title })
                            : `«${listingObj.title}» başlıklı ilanınız onaylandı ve yayına alındı.`,
                        link_url: `/listings/${listingObj.slug}`
                    });
                }
            } catch (notifyErr) {
                console.error('Listing status notification error:', notifyErr);
            }
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

// Warning a member is the step that was missing between doing nothing and
// suspending them. The third standing warning suspends the account by itself,
// inside Warning.issue, so the count and the account state stay in step.
const issueWarning = async (req, res) => {
    try {
        const userId = parseInt(req.params.id, 10);
        const { reason, note, report_id } = req.body;

        if (!Number.isInteger(userId)) {
            req.flash('error', 'flash.user_not_found');
            return res.redirect('/admin/users');
        }

        if (userId === req.session.userId) {
            req.flash('error', 'flash.cannot_warn_self');
            return res.redirect(req.get('referer') || '/admin/users');
        }

        if (!Report.listingReasons.includes(reason) && !Report.userReasons.includes(reason)) {
            req.flash('error', 'flash.select_report_reason');
            return res.redirect(req.get('referer') || '/admin/users');
        }

        const target = await User.findById(userId);
        if (!target) {
            req.flash('error', 'flash.user_not_found');
            return res.redirect('/admin/users');
        }

        const reportId = parseInt(report_id, 10);
        const result = await Warning.issue({
            user_id: userId,
            issued_by: req.session.userId,
            report_id: Number.isInteger(reportId) ? reportId : null,
            reason,
            note: (note || '').trim().slice(0, 500) || null
        });

        // Create system warning notification for the user
        try {
            const Notification = require('../models/Notification');
            const t = translatorFor(target);

            // The reasons live under report_modal.reasons — the same keys the
            // moderator's own dropdown renders from. The earlier 'reports.reason_*'
            // namespace does not exist, so every notification fell through to the
            // raw enum value and told the member their content broke rule "other".
            const reasonLabel = t('report_modal.reasons.' + reason);

            const title = result.suspended
                ? t('notifications.warning_suspended_title')
                : t('notifications.warning_title');

            const noteText = (note && note.trim())
                ? ` ${t('notifications.warning_note', { note: note.trim() })}`
                : '';

            const message = result.suspended
                ? t('notifications.warning_suspended_message', { reason: reasonLabel, note: noteText })
                : t('notifications.warning_message', {
                    reason: reasonLabel,
                    note: noteText,
                    remaining: Warning.remainingBeforeSuspension(result.count)
                });

            await Notification.create({
                user_id: userId,
                actor_id: req.session.userId,
                type: 'warning',
                title,
                message,
                // Straight to the banner that already lists every standing warning
                // with its reason, note and remaining strikes. It used to point at
                // /panel — the listing performance dashboard, which says nothing
                // about warnings at all.
                link_url: '/profile/listings'
            });
        } catch (notifyError) {
            console.error('Warning notification failed:', notifyError);
        }

        req.flash('success', result.suspended ? 'flash.warning_issued_suspended' : 'flash.warning_issued');
        res.redirect(req.get('referer') || '/admin/users');
    } catch (error) {
        console.error('Issue Warning Error:', error);
        req.flash('error', 'flash.action_failed');
        res.redirect('/admin/users');
    }
};

// Issuing a warning notifies the member, so clearing one should too — otherwise
// their account quietly comes back from suspension with no explanation, and the
// notification accusing them is still the last word they have on the matter.
const notifyWarningLifted = async (warning, actorId) => {
    const target = await User.findById(warning.user_id);
    if (!target) return;

    const t = translatorFor(target);

    await Notification.create({
        user_id: warning.user_id,
        actor_id: actorId,
        type: 'system',
        title: t('notifications.warning_lifted_title'),
        message: t('notifications.warning_lifted_message', {
            reason: t('report_modal.reasons.' + warning.reason)
        }),
        link_url: '/profile/listings'
    });
};

const revokeWarning = async (req, res) => {
    try {
        const warningId = parseInt(req.params.id, 10);
        const warning = Number.isInteger(warningId) ? await Warning.revoke(warningId) : null;

        if (warning) {
            try {
                await notifyWarningLifted(warning, req.session.userId);
            } catch (notifyError) {
                console.error('Warning lifted notification failed:', notifyError);
            }
        }

        req.flash(warning ? 'success' : 'error', warning ? 'flash.warning_revoked' : 'flash.action_failed');
        res.redirect(req.get('referer') || '/admin/users');
    } catch (error) {
        console.error('Revoke Warning Error:', error);
        req.flash('error', 'flash.action_failed');
        res.redirect('/admin/users');
    }
};

// For a warning that should never have been recorded at all. Revoking keeps the
// row as part of the trail; this erases it, so the member's history does not
// carry an entry nobody stands behind.
const deleteWarning = async (req, res) => {
    try {
        const warningId = parseInt(req.params.id, 10);
        const warning = Number.isInteger(warningId) ? await Warning.remove(warningId) : null;

        if (warning && Number(warning.is_active) === 1) {
            try {
                await notifyWarningLifted(warning, req.session.userId);
            } catch (notifyError) {
                console.error('Warning lifted notification failed:', notifyError);
            }
        }

        req.flash(warning ? 'success' : 'error', warning ? 'flash.warning_deleted' : 'flash.action_failed');
        res.redirect(req.get('referer') || '/admin/users');
    } catch (error) {
        console.error('Delete Warning Error:', error);
        req.flash('error', 'flash.action_failed');
        res.redirect('/admin/users');
    }
};

const updateUser = async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const { fullName, phone, role, companyName, password, isVerified } = req.body;
        const email = String(req.body.email || '').trim().toLowerCase();

        const user = await User.findById(id);
        if (!user) {
            req.flash('error', 'flash.user_not_found');
            return res.redirect('/admin/users');
        }

        const { isValidEmail, isValidPassword } = require('../utils/validators');

        if (!email || !isValidEmail(email)) {
            req.flash('error', 'flash.invalid_email');
            return res.redirect('/admin/users');
        }

        const emailTaken = await User.isEmailTaken(email, id);
        if (emailTaken) {
            req.flash('error', 'flash.email_taken');
            return res.redirect('/admin/users');
        }

        const allowedRoles = ['user', 'business', 'agent', 'admin'];
        const targetRole = allowedRoles.includes(role) ? role : user.role;

        const updateData = {
            full_name: String(fullName || user.full_name).trim(),
            email,
            phone: phone ? String(phone).trim() : null,
            role: targetRole,
            company_name: companyName ? String(companyName).trim() : null,
            is_verified: (isVerified === '1' || isVerified === 1 || isVerified === 'on' || isVerified === true) ? 1 : 0
        };

        await User.update(id, updateData);

        if (password && String(password).trim().length > 0) {
            const cleanPass = String(password).trim();
            if (!isValidPassword(cleanPass)) {
                req.flash('error', 'flash.weak_password');
                return res.redirect('/admin/users');
            }
            await User.setPassword(id, cleanPass);
        }

        req.flash('success', 'flash.user_updated');
        res.redirect(req.get('referer') || '/admin/users');
    } catch (error) {
        console.error('Admin Update User Error:', error);
        req.flash('error', 'flash.action_failed');
        res.redirect('/admin/users');
    }
};

const analytics = async (req, res) => {
    try {
        const page = parseInt(req.query.page, 10) || 1;
        const [logs, topPages, topVisitors, summary] = await Promise.all([
            Analytics.getRecentLogs(page, 50),
            Analytics.getTopPages(15),
            Analytics.getTopVisitors(15),
            Analytics.getSummary()
        ]);

        res.locals.meta.title = 'Ziyaretçi Günlüğü & Analitik | CYPILAN.COM';
        res.render('admin/analytics', {
            layout: 'admin/layout',
            logs: logs.data,
            pagination: { page, totalPages: logs.pages, total: logs.total },
            topPages,
            topVisitors,
            summary,
            activePage: 'analytics',
            title: 'Ziyaretçi Günlüğü'
        });
    } catch (error) {
        console.error('Admin Analytics Error:', error);
        req.flash('error', 'flash.action_failed');
        res.redirect('/admin');
    }
};

const sendListingNotice = async (req, res) => {
    try {
        const listingId = parseInt(req.params.id, 10);
        const { title, message } = req.body;

        if (!listingId || !message || String(message).trim().length === 0) {
            if (wantsJson(req)) {
                return res.status(400).json({ success: false, error: 'Uyarı mesajı boş bırakılamaz.' });
            }
            req.flash('error', 'flash.action_failed');
            return res.redirect(req.get('referer') || '/');
        }

        const listing = await Listing.findById(listingId);
        if (!listing) {
            if (wantsJson(req)) {
                return res.status(404).json({ success: false, error: 'İlan bulunamadı.' });
            }
            req.flash('error', 'flash.listing_not_found');
            return res.redirect(req.get('referer') || '/');
        }

        const cleanTitle = String(title || 'İlanınız Hakkında Yönetici Uyarısı').trim().slice(0, 200);
        const cleanMessage = String(message).trim().slice(0, 1500);

        await Notification.create({
            user_id: listing.user_id,
            actor_id: req.session.userId,
            type: 'warning',
            title: cleanTitle,
            message: `"${listing.title}" başlıklı ilanınız için yönetici uyarısı: ${cleanMessage}`,
            link_url: `/listings/${listing.slug}/edit`
        });

        if (wantsJson(req)) {
            return res.json({
                success: true,
                message: 'İlan sahibine düzeltme bildirimi başarıyla iletildi.'
            });
        }

        req.flash('success', 'İlan sahibine düzeltme bildirimi başarıyla iletildi.');
        res.redirect(req.get('referer') || `/listings/${listing.slug}`);
    } catch (error) {
        console.error('Send Listing Notice Error:', error);
        if (wantsJson(req)) {
            return res.status(500).json({ success: false, error: error.message });
        }
        req.flash('error', 'flash.action_failed');
        res.redirect(req.get('referer') || '/');
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
    updateUser,
    resolveReport,
    issueWarning,
    revokeWarning,
    deleteWarning,
    analytics,
    sendListingNotice
};
