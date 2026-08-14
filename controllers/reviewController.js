const Review = require('../models/Review');
const User = require('../models/User');
const Listing = require('../models/Listing');

const MAX_COMMENT_LENGTH = 600;

const backTo = (userId) => `/profile/${userId}`;

const submit = async (req, res) => {
    try {
        const reviewerId = req.session.userId;
        const reviewedUserId = parseInt(req.params.userId, 10);

        if (!Number.isInteger(reviewedUserId)) {
            req.flash('error', 'flash.user_not_found');
            return res.redirect('/');
        }

        if (reviewedUserId === reviewerId) {
            req.flash('error', 'flash.cannot_review_self');
            return res.redirect(backTo(reviewedUserId));
        }

        const target = await User.findById(reviewedUserId);
        if (!target) {
            req.flash('error', 'flash.user_not_found');
            return res.redirect('/');
        }

        if (!Review.isValidRating(req.body.rating)) {
            req.flash('error', 'flash.review_rating_required');
            return res.redirect(backTo(reviewedUserId));
        }

        // Same rule the form is drawn against, re-checked here: the button being
        // hidden is not a control, it is only a hint.
        const interacted = await Review.hasInteracted(reviewerId, reviewedUserId);
        if (!interacted) {
            req.flash('error', 'flash.review_requires_contact');
            return res.redirect(backTo(reviewedUserId));
        }

        // A review is pinned to a listing only when that listing really belongs to
        // the person being reviewed, so the reference on the profile cannot be
        // pointed at somebody else's ad.
        let listingId = null;
        const submittedListingId = parseInt(req.body.listing_id, 10);
        if (Number.isInteger(submittedListingId)) {
            const listing = await Listing.findById(submittedListingId);
            if (listing && listing.user_id === reviewedUserId) {
                listingId = listing.id;
            }
        }

        const comment = String(req.body.comment || '').trim().slice(0, MAX_COMMENT_LENGTH);
        const existing = await Review.findByPair(reviewerId, reviewedUserId);

        await Review.upsert({
            reviewer_id: reviewerId,
            reviewed_user_id: reviewedUserId,
            listing_id: listingId,
            rating: Number(req.body.rating),
            comment: comment || null
        });

        req.flash('success', existing ? 'flash.review_updated' : 'flash.review_saved');
        res.redirect(backTo(reviewedUserId));
    } catch (error) {
        console.error('Review Submit Error:', error);
        req.flash('error', 'flash.review_failed');
        res.redirect('/');
    }
};

const remove = async (req, res) => {
    try {
        const reviewedUserId = parseInt(req.params.userId, 10);

        if (!Number.isInteger(reviewedUserId)) {
            req.flash('error', 'flash.user_not_found');
            return res.redirect('/');
        }

        await Review.remove(req.session.userId, reviewedUserId);

        req.flash('success', 'flash.review_removed');
        res.redirect(backTo(reviewedUserId));
    } catch (error) {
        console.error('Review Remove Error:', error);
        req.flash('error', 'flash.review_failed');
        res.redirect('/');
    }
};

module.exports = {
    submit,
    remove,
    MAX_COMMENT_LENGTH
};
