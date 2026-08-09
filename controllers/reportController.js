const Report = require('../models/Report');
const Listing = require('../models/Listing');
const User = require('../models/User');

const MAX_DESCRIPTION = 1000;

const backTo = (req, fallback) => req.get('referer') || fallback;

const reportListing = async (req, res) => {
    try {
        const listingId = parseInt(req.params.id, 10);
        const { reason, description } = req.body;

        const listing = await Listing.findById(listingId);
        if (!listing) {
            req.flash('error', 'İlan bulunamadı.');
            return res.redirect('/listings');
        }

        if (listing.user_id === req.session.userId) {
            req.flash('error', 'Kendi ilanınızı şikayet edemezsiniz.');
            return res.redirect(backTo(req, `/listings/${listing.slug}`));
        }

        if (!Report.listingReasons.includes(reason)) {
            req.flash('error', 'Lütfen geçerli bir şikayet nedeni seçin.');
            return res.redirect(backTo(req, `/listings/${listing.slug}`));
        }

        const already = await Report.hasPending({
            reporter_id: req.session.userId,
            type: 'listing',
            listing_id: listing.id
        });

        if (already) {
            req.flash('info', 'Bu ilanı zaten şikayet ettiniz. Ekibimiz inceliyor.');
            return res.redirect(backTo(req, `/listings/${listing.slug}`));
        }

        await Report.create({
            reporter_id: req.session.userId,
            type: 'listing',
            listing_id: listing.id,
            reported_user_id: listing.user_id,
            reason,
            description: (description || '').trim().slice(0, MAX_DESCRIPTION) || null
        });

        req.flash('success', 'Şikayetiniz alındı. Ekibimiz en kısa sürede inceleyecek.');
        res.redirect(backTo(req, `/listings/${listing.slug}`));
    } catch (error) {
        console.error('Report Listing Error:', error);
        req.flash('error', 'Şikayet gönderilemedi.');
        res.redirect('/listings');
    }
};

const reportUser = async (req, res) => {
    try {
        const userId = parseInt(req.params.userId, 10);
        const { reason, description, message_id, thread_listing_id } = req.body;

        if (userId === req.session.userId) {
            req.flash('error', 'Kendinizi şikayet edemezsiniz.');
            return res.redirect('/messages');
        }

        const target = await User.findById(userId);
        if (!target) {
            req.flash('error', 'Kullanıcı bulunamadı.');
            return res.redirect('/messages');
        }

        if (!Report.userReasons.includes(reason)) {
            req.flash('error', 'Lütfen geçerli bir şikayet nedeni seçin.');
            return res.redirect(backTo(req, `/messages/${userId}`));
        }

        const already = await Report.hasPending({
            reporter_id: req.session.userId,
            type: 'user',
            reported_user_id: userId
        });

        if (already) {
            req.flash('info', 'Bu kullanıcıyı zaten şikayet ettiniz. Ekibimiz inceliyor.');
            return res.redirect(backTo(req, `/messages/${userId}`));
        }

        const threadListingId = thread_listing_id ? parseInt(thread_listing_id, 10) : null;

        await Report.create({
            reporter_id: req.session.userId,
            type: 'user',
            listing_id: Number.isInteger(threadListingId) ? threadListingId : null,
            reported_user_id: userId,
            message_id: message_id ? parseInt(message_id, 10) : null,
            reason,
            description: (description || '').trim().slice(0, MAX_DESCRIPTION) || null
        });

        req.flash('success', 'Şikayetiniz alındı. Ekibimiz en kısa sürede inceleyecek.');
        res.redirect(backTo(req, `/messages/${userId}`));
    } catch (error) {
        console.error('Report User Error:', error);
        req.flash('error', 'Şikayet gönderilemedi.');
        res.redirect('/messages');
    }
};

module.exports = {
    reportListing,
    reportUser
};
