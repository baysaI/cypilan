const User = require('../models/User');
const Listing = require('../models/Listing');
const listingPolicy = require('../config/listingPolicy');
const Review = require('../models/Review');
const Warning = require('../models/Warning');
const reviewController = require('./reviewController');
const { isValidPhone, isValidPassword, isValidEmail } = require('../utils/validators');
const { removeAvatarByUrl } = require('../middlewares/upload');

const index = async (req, res) => {
    if (req.session && req.session.userId) {
        return res.redirect(`/profile/${req.session.userId}`);
    }
    return res.redirect('/auth/login');
};

const show = async (req, res) => {
    try {
        const userId = parseInt(req.params.id, 10);

        if (!Number.isInteger(userId)) {
            req.flash('error', 'flash.user_not_found');
            return res.redirect('/');
        }

        const user = await User.findById(userId);

        if (!user) {
            req.flash('error', 'flash.user_not_found');
            return res.redirect('/');
        }

        const listings = await Listing.getByUser(userId);
        const stats = await User.getStats(userId);

        const [reviewSummary, reviews] = await Promise.all([
            Review.getSummary(userId),
            Review.getByUser(userId, 20)
        ]);

        // The rating form is only drawn for someone who has actually messaged this
        // user. reviewController re-checks the same rule before writing.
        const viewerId = req.session && req.session.userId;
        let canReview = false;
        let myReview = null;

        if (viewerId && viewerId !== userId) {
            canReview = await Review.hasInteracted(viewerId, userId);
            myReview = await Review.findByPair(viewerId, userId);
        }

        user.has_phone = Boolean(user.phone);
        delete user.phone;
        delete user.password_hash;
        delete user.email;

        const { formatDisplayName } = require('../utils/helpers');
        const displayName = user.company_name || formatDisplayName(user.full_name, user.show_surname);

        res.locals.meta = res.locals.meta || {};
        res.locals.meta.title = `${displayName} | CYPILAN.COM`;

        res.render('profile/show', {
            profileUser: user,
            listings,
            stats,
            reviewSummary,
            reviews,
            canReview,
            myReview,
            maxCommentLength: reviewController.MAX_COMMENT_LENGTH,
            title: displayName
        });
    } catch (error) {
        console.error('Profile Show Error:', error);
        req.flash('error', 'flash.profile_load_failed');
        res.redirect('/');
    }
};

const edit = async (req, res, next) => {
    try {
        const user = await User.findById(req.session.userId);

        if (!user) {
            req.flash('error', 'flash.user_not_found');
            return res.redirect('/');
        }

        res.locals.meta = res.locals.meta || {};
        res.locals.meta.title = 'Profilimi Düzenle';
        res.locals.meta.robots = 'noindex, nofollow';

        res.render('profile/edit', { user, title: 'Profili Düzenle' });
    } catch (error) {
        console.error('Profile Edit Error:', error);
        next(error);
    }
};

const update = async (req, res) => {
    try {
        const { full_name, phone, bio, remove_avatar } = req.body;
        const user = await User.findById(req.session.userId);

        if (!user) {
            req.flash('error', 'flash.user_not_found');
            return res.redirect('/');
        }

        const updates = {};

        if (full_name && full_name.trim()) {
            updates.full_name = full_name.trim();
        }

        if (bio !== undefined) {
            updates.bio = bio.trim() || null;
        }

        if (phone !== undefined) {
            const trimmed = phone.trim();
            if (trimmed && !isValidPhone(trimmed)) {
                req.flash('error', 'flash.invalid_phone');
                return res.redirect('/profile/edit');
            }
            updates.phone = trimmed || null;
        }

        if (req.body.company_name !== undefined) {
            updates.company_name = req.body.company_name.trim() || null;
        }

        if (req.body.corporate_type !== undefined) {
            const allowed = ['real_estate', 'auto', 'service', 'construction', 'shopping', 'other'];
            updates.corporate_type = allowed.includes(req.body.corporate_type) ? req.body.corporate_type : null;
        }

        if (req.body.corporate_tax_no !== undefined) {
            updates.corporate_tax_no = req.body.corporate_tax_no.trim() || null;
        }

        updates.show_phone = req.body.hide_phone ? 0 : 1;
        updates.show_surname = req.body.hide_surname ? 0 : 1;

        if (req.processedAvatar) {
            if (user.avatar_url) {
                await removeAvatarByUrl(user.avatar_url);
            }
            updates.avatar_url = req.processedAvatar;
        } else if (remove_avatar === '1' || remove_avatar === 'true') {
            if (user.avatar_url) {
                await removeAvatarByUrl(user.avatar_url);
            }
            updates.avatar_url = null;
        }

        await User.update(req.session.userId, updates);

        if (updates.full_name) {
            req.session.userName = updates.full_name;
        }

        if (updates.avatar_url !== undefined) {
            req.session.userAvatar = updates.avatar_url;
        }

        req.flash('success', 'flash.profile_updated');
        res.redirect('/profile/edit');
    } catch (error) {
        console.error('Profile Update Error:', error);
        req.flash('error', 'flash.profile_update_failed');
        res.redirect('/profile/edit');
    }
};

const changePassword = async (req, res) => {
    try {
        const { current_password, new_password, confirm_password } = req.body;
        const user = await User.findById(req.session.userId);

        if (!user) {
            req.flash('error', 'flash.user_not_found');
            return res.redirect('/profile/edit');
        }

        const needsCurrent = Number(user.has_password) !== 0;

        if (needsCurrent) {
            if (!current_password) {
                req.flash('error', 'flash.current_password_required');
                return res.redirect('/profile/edit');
            }
            const matches = await User.verifyPassword(current_password, user.password_hash);
            if (!matches) {
                req.flash('error', 'flash.current_password_wrong');
                return res.redirect('/profile/edit');
            }
        }

        if (!new_password || !isValidPassword(new_password)) {
            req.flash('error', 'flash.new_password_weak');
            return res.redirect('/profile/edit');
        }

        if (new_password !== confirm_password) {
            req.flash('error', 'flash.new_passwords_do_not_match');
            return res.redirect('/profile/edit');
        }

        await User.setPassword(user.id, new_password);

        req.flash('success', needsCurrent ? 'flash.password_updated' : 'flash.password_created');
        res.redirect('/profile/edit');
    } catch (error) {
        console.error('Change Password Error:', error);
        req.flash('error', 'flash.password_update_failed');
        res.redirect('/profile/edit');
    }
};

const changeEmail = async (req, res) => {
    try {
        const { new_email, current_password } = req.body;
        const user = await User.findById(req.session.userId);

        if (!user) {
            req.flash('error', 'flash.user_not_found');
            return res.redirect('/profile/edit');
        }

        if (Number(user.has_password) === 0) {
            req.flash('error', 'flash.set_password_before_email');
            return res.redirect('/profile/edit');
        }

        const matches = await User.verifyPassword(current_password, user.password_hash);
        if (!matches) {
            req.flash('error', 'flash.password_wrong');
            return res.redirect('/profile/edit');
        }

        const email = (new_email || '').trim().toLowerCase();

        if (!isValidEmail(email)) {
            req.flash('error', 'flash.invalid_email');
            return res.redirect('/profile/edit');
        }

        if (email === (user.email || '').toLowerCase()) {
            req.flash('info', 'flash.email_unchanged');
            return res.redirect('/profile/edit');
        }

        if (await User.isEmailTaken(email, user.id)) {
            req.flash('error', 'flash.email_in_use_by_other');
            return res.redirect('/profile/edit');
        }

        await User.update(user.id, { email });
        req.session.userEmail = email;

        req.flash('success', 'flash.email_updated');
        res.redirect('/profile/edit');
    } catch (error) {
        console.error('Change Email Error:', error);
        req.flash('error', 'flash.email_update_failed');
        res.redirect('/profile/edit');
    }
};

const myListings = async (req, res, next) => {
    try {
        const listings = await Listing.getByUser(req.session.userId);

        const boostQuota = listingPolicy.boostQuotaFor(req.session.userRole);
        const boostsUsed = await Listing.boostsUsed(req.session.userId);
        const nextBoostAt = boostsUsed >= boostQuota
            ? await Listing.nextBoostAt(req.session.userId)
            : null;

        // A warning the member never sees teaches them nothing, so it is surfaced
        // where they manage the listings that caused it.
        const warnings = await Warning.forUser(req.session.userId, 10);
        const activeWarnings = warnings.filter((warning) => Number(warning.is_active) === 1);

        res.locals.meta = res.locals.meta || {};
        res.locals.meta.title = 'İlanlarım';
        res.locals.meta.robots = 'noindex, nofollow';

        res.render('profile/listings', {
            listings,
            boostQuota,
            boostsUsed,
            boostWindowDays: listingPolicy.BOOST_WINDOW_DAYS,
            nextBoostAt,
            warnings: activeWarnings,
            warningsRemaining: Warning.remainingBeforeSuspension(activeWarnings.length),
            suspensionThreshold: Warning.SUSPENSION_THRESHOLD,
            title: 'İlanlarım'
        });
    } catch (error) {
        console.error('My Listings Error:', error);
        next(error);
    }
};

const myFavorites = async (req, res, next) => {
    try {
        const favorites = await Listing.findFavoritesByUser(req.session.userId);

        res.locals.meta = res.locals.meta || {};
        res.locals.meta.title = 'Favorilerim';
        res.locals.meta.robots = 'noindex, nofollow';

        res.render('profile/favorites', { favorites, title: 'Favorilerim' });
    } catch (error) {
        console.error('My Favorites Error:', error);
        next(error);
    }
};

const myPriceAlerts = async (req, res, next) => {
    try {
        const PriceAlert = require('../models/PriceAlert');
        const alerts = await PriceAlert.getUserAlerts(req.session.userId);

        res.locals.meta = res.locals.meta || {};
        res.locals.meta.title = 'Fiyat Alarmlarım | CYPILAN.COM';
        res.locals.meta.robots = 'noindex, nofollow';

        res.render('profile/alerts', { alerts, title: 'Fiyat Alarmlarım' });
    } catch (error) {
        console.error('My Price Alerts Error:', error);
        next(error);
    }
};

const deleteAccount = async (req, res) => {
    try {
        const userId = req.session && req.session.userId;
        if (!userId) {
            return res.redirect('/auth/login');
        }

        const user = await User.findById(userId);
        if (!user) {
            req.flash('error', 'flash.user_not_found');
            return res.redirect('/auth/login');
        }

        const { current_password, confirmation } = req.body;

        // If account has a password, verify password
        if (Number(user.has_password) === 1) {
            if (!current_password) {
                req.flash('error', 'flash.current_password_required');
                return res.redirect('/profile/edit');
            }
            const matches = await User.verifyPassword(current_password, user.password_hash);
            if (!matches) {
                req.flash('error', 'flash.password_wrong');
                return res.redirect('/profile/edit');
            }
        } else {
            // If OAuth / social login user without password, require typing "SIL"
            if (!confirmation || String(confirmation).trim().toUpperCase() !== 'SIL') {
                req.flash('error', 'flash.delete_confirmation_required');
                return res.redirect('/profile/edit');
            }
        }

        await User.delete(userId);

        req.session.destroy((err) => {
            if (err) console.error('Session destroy error on account delete:', err);
            res.clearCookie('connect.sid');
            res.redirect('/?account_deleted=1');
        });
    } catch (error) {
        console.error('Delete Account Error:', error);
        req.flash('error', 'flash.action_failed');
        res.redirect('/profile/edit');
    }
};

module.exports = {
    index,
    show,
    edit,
    update,
    changePassword,
    changeEmail,
    myListings,
    myFavorites,
    myPriceAlerts,
    deleteAccount
};
