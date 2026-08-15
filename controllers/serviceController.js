const ServiceRequest = require('../models/ServiceRequest');
const Listing = require('../models/Listing');
const Message = require('../models/Message');

const MAX_NOTE = 800;

// A member asks for assurance or promotion on a listing they own. Neither is
// self-served yet — there is no payment provider — so what the platform can
// honestly do is record the request and show where it stands.
const request = async (req, res) => {
    const backTo = req.get('referer') || '/profile/listings';

    try {
        const type = req.params.type;
        if (!ServiceRequest.TYPES.includes(type)) {
            req.flash('error', 'flash.service_unknown_type');
            return res.redirect(backTo);
        }

        const listingId = parseInt(req.params.listingId, 10);
        if (!Number.isInteger(listingId)) {
            req.flash('error', 'flash.listing_not_found');
            return res.redirect(backTo);
        }

        const listing = await Listing.findById(listingId);
        if (!listing) {
            req.flash('error', 'flash.listing_not_found');
            return res.redirect(backTo);
        }

        if (listing.user_id !== req.session.userId) {
            req.flash('error', 'flash.no_action_permission');
            return res.redirect(backTo);
        }

        const created = await ServiceRequest.create({
            user_id: req.session.userId,
            listing_id: listingId,
            type,
            note: String(req.body.note || '').trim().slice(0, MAX_NOTE) || null
        });

        if (!created) {
            req.flash('info', 'flash.service_already_open');
            return res.redirect(backTo);
        }

        req.flash('success', 'flash.service_request_sent');
        res.redirect('/profile/taleplerim');
    } catch (error) {
        console.error('Service Request Error:', error);
        req.flash('error', 'flash.service_request_failed');
        res.redirect(backTo);
    }
};

const myRequests = async (req, res, next) => {
    try {
        const requests = await ServiceRequest.findForUser(req.session.userId);

        res.locals.meta = res.locals.meta || {};
        res.locals.meta.title = res.locals.t('service.my_requests');
        res.locals.meta.robots = 'noindex, nofollow';

        res.render('service/mine', { requests, title: res.locals.t('service.my_requests') });
    } catch (error) {
        console.error('My Service Requests Error:', error);
        next(error);
    }
};

// ---- Admin side -------------------------------------------------------------

const adminQueue = async (req, res) => {
    try {
        const page = parseInt(req.query.page, 10) || 1;
        const filters = { status: req.query.status, type: req.query.type };

        const result = await ServiceRequest.findAll(filters, page, 20);
        const Report = require('../models/Report');
        const pendingReports = await Report.countPending();

        res.locals.meta.title = 'Hizmet Talepleri | Admin Paneli';
        res.render('admin/services', {
            layout: 'admin/layout',
            requests: result.data,
            pagination: { page, totalItems: result.total, totalPages: result.pages },
            filters,
            statuses: ServiceRequest.STATUSES,
            types: ServiceRequest.TYPES,
            pendingReports,
            activePage: 'services',
            title: 'Hizmet Talepleri'
        });
    } catch (error) {
        console.error('Admin Service Queue Error:', error);
        req.flash('error', 'flash.action_failed');
        res.redirect('/admin');
    }
};

const adminSetStatus = async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const { status, admin_note } = req.body;

        const updated = Number.isInteger(id)
            ? await ServiceRequest.setStatus(id, status, (admin_note || '').trim().slice(0, MAX_NOTE) || null)
            : null;

        if (!updated) {
            req.flash('error', 'flash.action_failed');
            return res.redirect('/admin/hizmet-talepleri');
        }

        // The member asked for something and a person decided; they should hear
        // the outcome without having to check a page.
        try {
            await Message.create({
                sender_id: req.session.userId,
                receiver_id: updated.user_id,
                listing_id: updated.listing_id,
                content: res.locals.t(`service.notify_${status}`, {
                    service: res.locals.t(`service.type_${updated.type}`)
                })
            });
        } catch (notifyError) {
            console.error('Service status notification failed:', notifyError);
        }

        req.flash('success', 'flash.service_status_updated');
        res.redirect(req.get('referer') || '/admin/hizmet-talepleri');
    } catch (error) {
        console.error('Admin Service Status Error:', error);
        req.flash('error', 'flash.action_failed');
        res.redirect('/admin/hizmet-talepleri');
    }
};

module.exports = {
    request,
    myRequests,
    adminQueue,
    adminSetStatus,
    MAX_NOTE
};
