const fs = require('fs');
const path = require('path');
const User = require('../models/User');
const Listing = require('../models/Listing');
const listingPolicy = require('../config/listingPolicy');
const Report = require('../models/Report');
const Message = require('../models/Message');
const Warning = require('../models/Warning');
const Notification = require('../models/Notification');
const UserBadge = require('../models/UserBadge');
const badgeCatalog = require('../config/userBadges');
const owner = require('../config/owner');
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

const wantsJson = (req) => Boolean(req && (req.xhr || (req.headers && req.headers.accept && req.headers.accept.indexOf('json') > -1)));

// Sahip hesabina dokunmaya calisan her yonetici eylemi ayni cevabi veriyor.
// Model zaten engelliyor; buradaki kontrol yoneticiye neden olmadigini
// soylemek icin: sessizce basarisiz olan bir dugme, calismayan bir dugmeden
// daha kotu.
const refuseIfOwner = async (req, res, targetId) => {
    const target = await User.findById(targetId);
    if (!owner.isOwner(target)) return false;

    if (wantsJson(req)) {
        res.status(403).json({ error: res.locals.t('flash.owner_protected') });
        return true;
    }

    req.flash('error', 'flash.owner_protected');
    res.redirect(req.get('referer') || '/admin/users');
    return true;
};

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
        const filters = {
            role: req.query.role,
            q: req.query.q,
            corporate_type: req.query.corporate_type || req.query.corporateType
        };
        const result = await User.findAll(page, PAGE_SIZE, filters);
        const pendingReports = await Report.countPending();

        // Warnings for exactly the rows on screen: the badge shows how close each
        // member is to an automatic suspension, and the expandable row beneath it
        // shows the warnings themselves — reason, note, who issued it and when.
        // The history already contains the standing count, so asking countActive
        // for it as well would be a second query per row for a number in hand.
        const warningHistory = {};
        const warningCounts = {};
        // Sahip satiri listede isaretleniyor: yoneticinin calismayacak bir
        // dugmeye basmasindansa dugmeyi hic gormemesi daha iyi.
        result.data.forEach((user) => { user.is_owner = owner.isOwner(user); });

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
        if (status === 'active') {
            await Listing.update(id, { is_featured: 1 });
        }
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

        if (await refuseIfOwner(req, res, parseInt(id, 10))) return;

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

const deleteUser = async (req, res) => {
    try {
        const targetUserId = parseInt(req.params.id, 10);

        if (!targetUserId || !Number.isInteger(targetUserId)) {
            if (wantsJson(req)) return res.status(400).json({ error: res.locals.t('flash.user_not_found') });
            req.flash('error', 'flash.user_not_found');
            return res.redirect('/admin/users');
        }

        if (targetUserId === req.session.userId) {
            if (wantsJson(req)) return res.status(400).json({ error: res.locals.t('flash.cannot_delete_self') });
            req.flash('error', 'flash.cannot_delete_self');
            return res.redirect('/admin/users');
        }

        if (await refuseIfOwner(req, res, targetUserId)) return;

        const user = await User.findById(targetUserId);
        if (!user) {
            if (wantsJson(req)) return res.status(404).json({ error: res.locals.t('flash.user_not_found') });
            req.flash('error', 'flash.user_not_found');
            return res.redirect('/admin/users');
        }

        await User.delete(targetUserId);

        if (wantsJson(req)) return res.json({ success: true });

        req.flash('success', 'flash.user_deleted_success');
        res.redirect(req.get('referer') || '/admin/users');
    } catch (error) {
        console.error('Admin Delete User Error:', error);
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
    {
        const guarded = parseInt(req.params.id, 10);
        if (Number.isInteger(guarded) && await refuseIfOwner(req, res, guarded)) return;
    }
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

        // Sahip hesabina yalnizca sahibin kendisi dokunabiliyor.
        const actor = await User.findById(req.session.userId);
        if (!owner.canModify(user, actor)) {
            req.flash('error', 'flash.owner_protected');
            return res.redirect(req.get('referer') || '/admin/users');
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
        // Sahibin rolu panelden degistirilemiyor - kendisi tarafindan da. Yanlislikla
        // rolunu dusurmek, paneli acan tek hesabi kaybetmek demek olurdu.
        const targetRole = owner.isOwner(user)
            ? 'admin'
            : (allowedRoles.includes(role) ? role : user.role);

        const allowedCorporateStatuses = ['none', 'pending', 'approved', 'rejected'];
        let targetCorporateStatus = user.corporate_status || 'none';
        if (req.body.corporateStatus && allowedCorporateStatuses.includes(req.body.corporateStatus)) {
            targetCorporateStatus = req.body.corporateStatus;
        } else if (targetRole === 'business' || targetRole === 'agent') {
            targetCorporateStatus = 'approved';
        }

        const allowedCorporateTypes = ['real_estate', 'auto', 'service', 'construction', 'shopping', 'other'];
        let targetCorporateType = user.corporate_type || null;
        if (req.body.corporateType !== undefined) {
            targetCorporateType = allowedCorporateTypes.includes(req.body.corporateType) ? req.body.corporateType : null;
        }

        const updateData = {
            full_name: String(fullName || user.full_name).trim(),
            email,
            phone: phone ? String(phone).trim() : null,
            role: targetRole,
            company_name: companyName ? String(companyName).trim() : null,
            corporate_status: targetCorporateStatus,
            corporate_type: targetCorporateType,
            is_verified: (isVerified === '1' || isVerified === 1 || isVerified === 'on' || isVerified === true) ? 1 : 0
        };

        await User.update(id, updateData);

        // Sifre panelden hic degistirilmiyor: sahip kendi sifresini profil
        // sayfasindan, mevcut sifresini girerek degistiriyor. Paneldeki alan
        // baska bir yoneticinin oturumu ele gecirildiginde en kisa yol olurdu.
        if (!owner.isOwner(user) && password && String(password).trim().length > 0) {
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

const approveCorporate = async (req, res) => {
    {
        const guarded = parseInt(req.params.id, 10);
        if (Number.isInteger(guarded) && await refuseIfOwner(req, res, guarded)) return;
    }
    try {
        const id = parseInt(req.params.id, 10);
        const targetRole = req.body.role === 'agent' ? 'agent' : 'business';
        const user = await User.findById(id);

        if (!user) {
            req.flash('error', 'flash.user_not_found');
            return res.redirect('/admin/users');
        }

        const corporateType = req.body.corporateType || user.corporate_type || null;
        await User.approveCorporate(id, targetRole, corporateType);

        const notifyT = translatorFor(user);
        await Notification.create({
            user_id: id,
            type: 'system',
            title: notifyT('notifications.corporate_approved_title') || 'Kurumsal Hesabınız Onaylandı 🎉',
            message: notifyT('notifications.corporate_approved_msg') || 'Kurumsal hesap başvurunuz yönetici tarafından onaylandı. Artık ilanlarınızı oluşturabilir ve kurumsal mağazanızı yönetebilirsiniz.',
            link_url: '/listings/create'
        });

        req.flash('success', 'flash.corporate_approved_success');
        res.redirect(req.get('referer') || '/admin/users');
    } catch (error) {
        console.error('Approve corporate error:', error);
        req.flash('error', 'flash.action_failed');
        res.redirect('/admin/users');
    }
};

const rejectCorporate = async (req, res) => {
    {
        const guarded = parseInt(req.params.id, 10);
        if (Number.isInteger(guarded) && await refuseIfOwner(req, res, guarded)) return;
    }
    try {
        const id = parseInt(req.params.id, 10);
        const user = await User.findById(id);

        if (!user) {
            req.flash('error', 'flash.user_not_found');
            return res.redirect('/admin/users');
        }

        await User.rejectCorporate(id);

        const notifyT = translatorFor(user);
        await Notification.create({
            user_id: id,
            type: 'system',
            title: notifyT('notifications.corporate_rejected_title') || 'Kurumsal Başvurunuz Hakkında',
            message: notifyT('notifications.corporate_rejected_msg') || 'Kurumsal hesap başvurunuz onaylanmadı. Detaylı bilgi almak için Canlı Destek ile iletişime geçebilirsiniz.',
            link_url: '/profile'
        });

        req.flash('info', 'flash.corporate_rejected_notice');
        res.redirect(req.get('referer') || '/admin/users');
    } catch (error) {
        console.error('Reject corporate error:', error);
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

// Firlatma ucretsiz ve haftalik bir hak; kotuye kullanimi gormenin tek yolu
// kayitlara bakabilmek. Buradan kimin neyi ne siklikta one cikardigini
// gormek, kotanin dogru ayarlanip ayarlanmadigini da soyluyor.
const boosts = async (req, res, next) => {
    try {
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = 50;

        const [history, total, thisWeek] = await Promise.all([
            Listing.boostHistory({ limit, offset: (page - 1) * limit }),
            Listing.boostHistoryCount(),
            Listing.boostsThisWeek()
        ]);

        res.locals.meta = res.locals.meta || {};
        res.locals.meta.title = 'Öne Çıkarmalar | Admin Paneli';

        res.render('admin/boosts', {
            layout: 'admin/layout',
            history,
            total,
            thisWeek,
            windowDays: listingPolicy.BOOST_WINDOW_DAYS,
            quotaNormal: listingPolicy.WEEKLY_BOOST_QUOTA,
            quotaCorporate: listingPolicy.WEEKLY_BOOST_QUOTA_CORPORATE,
            pagination: { page, totalPages: Math.max(1, Math.ceil(total / limit)), totalItems: total },
            activePage: 'boosts',
            title: 'Öne Çıkarmalar'
        });
    } catch (error) {
        console.error('Admin Boosts Error:', error);
        next(error);
    }
};

const userBadges = async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const user = await User.findById(id);

        if (!user) {
            req.flash('error', 'flash.user_not_found');
            return res.redirect('/admin/users');
        }

        res.locals.meta.title = 'Kullanıcı Rozetleri | Admin Paneli';
        res.render('admin/userBadges', {
            layout: 'admin/layout',
            targetUser: user,
            badgeRows: UserBadge.adminListForUser(id),
            catalog: badgeCatalog.BADGES,
            // Donemsel bir unvani verirken yoneticinin bilmesi gereken tek sey
            // su an kimde oldugu; ayni unvani iki kisiye birden vermek onu
            // anlamsizlastirir.
            holders: badgeCatalog.BADGES.reduce((acc, badge) => {
                acc[badge.key] = UserBadge.holdersOf(badge.key).filter((h) => h.user_id !== id);
                return acc;
            }, {}),
            activePage: 'users',
            title: 'Kullanıcı Rozetleri'
        });
    } catch (error) {
        console.error('User Badges Page Error:', error);
        req.flash('error', 'flash.action_failed');
        res.redirect('/admin/users');
    }
};

// Bitis tarihi ucu acik degil: yonetici ya rozetin kendi varsayilan suresini
// kullaniyor, ya kalici veriyor, ya da bir tarih seciyor. Bos birakilan bir
// alani "kalici" saymak, donemsel bir unvani kazara omur boyu vermenin en
// kolay yoluydu.
const resolveExpiry = (badgeKey, mode, rawDate) => {
    if (mode === 'never') return null;

    if (mode === 'custom') {
        const date = String(rawDate || '').trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return badgeCatalog.defaultExpiry(badgeKey);
        // Secilen gunun sonuna kadar gecerli: yoneticinin "31 Ocak" demesi
        // rozetin 31 Ocak sabahi dusmesi anlamina gelmemeli.
        return date + ' 23:59:59';
    }

    return badgeCatalog.defaultExpiry(badgeKey);
};

const grantUserBadge = async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const backUrl = '/admin/users/' + id + '/rozetler';

    try {
        const user = await User.findById(id);
        if (!user) {
            req.flash('error', 'flash.user_not_found');
            return res.redirect('/admin/users');
        }

        const badgeKey = String(req.body.badgeKey || '');
        if (!badgeCatalog.isKnownKey(badgeKey)) {
            req.flash('error', 'Böyle bir rozet yok.');
            return res.redirect(backUrl);
        }

        const note = String(req.body.note || '').trim().slice(0, 200) || null;
        const expiresAt = resolveExpiry(badgeKey, req.body.expiryMode, req.body.expiresAt);

        const result = UserBadge.grant(id, badgeKey, {
            grantedBy: req.session.userId,
            note,
            expiresAt
        });

        // Bildirim uyenin kendi dilinde saklaniyor: bildirimler yazildiklari
        // haliyle duruyor ve okundugu anda cevrilmiyor.
        const notifyT = translatorFor(user);
        const badgeName = notifyT(badgeCatalog.translationKey(badgeKey));

        await Notification.create({
            user_id: id,
            actor_id: req.session.userId,
            type: 'badge',
            title: notifyT('notifications.badge_granted_title'),
            message: result && result.isNew
                ? notifyT('notifications.badge_granted_msg', { badge: badgeName })
                : notifyT('notifications.badge_extended_msg', { badge: badgeName }),
            link_url: '/profile'
        });

        console.log(
            `[UserBadge] ${badgeKey} -> kullanıcı #${id} (yönetici #${req.session.userId})`
        );

        req.flash('success', 'Rozet verildi ve kullanıcıya bildirim gönderildi.');
        res.redirect(backUrl);
    } catch (error) {
        console.error('Grant Badge Error:', error);
        req.flash('error', 'flash.action_failed');
        res.redirect(backUrl);
    }
};

const revokeUserBadge = async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const backUrl = '/admin/users/' + id + '/rozetler';

    try {
        const badgeKey = String(req.body.badgeKey || '');
        const removed = UserBadge.revoke(id, badgeKey);

        // Geri alma sessiz: rozeti kaybettigini bildiren bir mesaj, kimseye
        // yardimi olmayan bir kotu haber olurdu. Suresi dolan unvanlar da
        // zaten kendiliginden ve sessizce dusuyor.
        console.log(
            `[UserBadge] ${badgeKey} kaldırıldı <- kullanıcı #${id} (yönetici #${req.session.userId})`
        );

        req.flash(removed ? 'success' : 'info', removed ? 'Rozet kaldırıldı.' : 'Kaldırılacak rozet bulunamadı.');
        res.redirect(backUrl);
    } catch (error) {
        console.error('Revoke Badge Error:', error);
        req.flash('error', 'flash.action_failed');
        res.redirect(backUrl);
    }
};

const badgeOverview = async (req, res) => {
    try {
        const page = parseInt(req.query.page, 10) || 1;
        const grants = UserBadge.recentGrants(page, 25);
        const holderCounts = UserBadge.summary();

        res.locals.meta.title = 'Rozetler | Admin Paneli';
        res.render('admin/badges', {
            layout: 'admin/layout',
            stats: UserBadge.stats(),
            catalog: badgeCatalog.BADGES,
            // Katalogda olup kimseye verilmemis rozet de listede duruyor:
            // "hangi rozetler var" sorusunun cevabi dagitilanlarla sinirli degil.
            holderCounts,
            grants,
            activePage: 'badges',
            title: 'Rozetler'
        });
    } catch (error) {
        console.error('Badge Overview Error:', error);
        req.flash('error', 'flash.action_failed');
        res.redirect('/admin');
    }
};

const messages = async (req, res) => {
    try {
        const page = parseInt(req.query.page, 10) || 1;
        const q = String(req.query.q || '').trim();

        res.locals.meta.title = 'Mesajlaşma | Admin Paneli';
        res.render('admin/messages', {
            layout: 'admin/layout',
            stats: Message.adminStats(),
            daily: Message.adminDailyCounts(14),
            conversations: Message.adminConversations({ q, page, limit: 25 }),
            filters: { q },
            activePage: 'messages',
            title: 'Mesajlaşma'
        });
    } catch (error) {
        console.error('Admin Messages Error:', error);
        req.flash('error', 'flash.action_failed');
        res.redirect('/admin');
    }
};

const messageConversation = async (req, res) => {
    try {
        const userA = parseInt(req.params.userA, 10);
        const userB = parseInt(req.params.userB, 10);
        const listingId = req.query.listing ? parseInt(req.query.listing, 10) : null;

        if (!Number.isInteger(userA) || !Number.isInteger(userB)) {
            req.flash('error', 'flash.action_failed');
            return res.redirect('/admin/mesajlar');
        }

        const [partyA, partyB] = await Promise.all([User.findById(userA), User.findById(userB)]);
        if (!partyA || !partyB) {
            req.flash('error', 'flash.user_not_found');
            return res.redirect('/admin/mesajlar');
        }

        const conversation = await Message.getConversation(userA, userB, listingId, 500, 0);

        // Ozel yazismaya bakmak sessizce olmamali. Sunucu gunlugu bunun tek
        // kaydi: kimin, hangi sohbeti, ne zaman actigi burada duruyor.
        console.log(
            `[AdminMessages] #${req.session.userId} -> #${userA}/#${userB} (ilan: ${listingId || '-'}) sohbeti goruntuledi`
        );

        res.locals.meta.title = 'Sohbet | Admin Paneli';
        res.render('admin/messageThread', {
            layout: 'admin/layout',
            partyA,
            partyB,
            listingId,
            messages: conversation,
            activePage: 'messages',
            title: 'Sohbet'
        });
    } catch (error) {
        console.error('Admin Conversation Error:', error);
        req.flash('error', 'flash.action_failed');
        res.redirect('/admin/mesajlar');
    }
};

module.exports = {
    dashboard,
    boosts,
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
    sendListingNotice,
    approveCorporate,
    rejectCorporate,
    deleteUser,
    userBadges,
    grantUserBadge,
    revokeUserBadge,
    badgeOverview,
    messages,
    messageConversation
};
