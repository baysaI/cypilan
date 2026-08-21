const User = require('../models/User');
const Message = require('../models/Message');
const Bid = require('../models/Bid');
const Career = require('../models/Career');
const Notification = require('../models/Notification');

const isAuthenticated = (req, res, next) => {
    if ((req.session && req.session.userId) || req.isAuthenticated()) {
        return next();
    }

    const isApiOrAjax = req.xhr ||
        (req.headers.accept && req.headers.accept.includes('application/json')) ||
        req.headers['x-requested-with'] === 'XMLHttpRequest' ||
        req.originalUrl.startsWith('/api/') ||
        req.originalUrl.includes('/heartbeat') ||
        req.originalUrl.includes('/poll') ||
        req.originalUrl.includes('/conversations') ||
        req.originalUrl.includes('/messages');

    if (req.method === 'GET' && !isApiOrAjax) {
        req.session.returnTo = req.originalUrl;
    }
    
    if (isApiOrAjax) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    
    req.flash('error', 'flash.login_required_first');
    return res.redirect('/auth/login');
};

const isAdmin = (req, res, next) => {
    const role = (req.session && req.session.userRole) || (req.user && req.user.role);
    if (role === 'admin') {
        return next();
    }
    
    if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1)) {
        return res.status(403).json({ error: 'Admin access required' });
    }
    
    req.flash('error', 'flash.no_page_access');
    return res.redirect('/');
};

const isOwner = (req, res, next) => {
    const userId = (req.session && req.session.userId) || (req.user && req.user.id);
    const role = (req.session && req.session.userRole) || (req.user && req.user.role);
    const listingUserId = req.listing ? req.listing.user_id : null;
    
    if (userId && (userId === listingUserId || role === 'admin')) {
        return next();
    }
    
    if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1)) {
        return res.status(403).json({ error: 'Ownership required' });
    }
    
    req.flash('error', 'flash.no_action_permission');
    return res.redirect('back');
};

const requireVerifiedEmail = async (req, res, next) => {
    const userId = (req.session && req.session.userId) || (req.user && req.user.id);
    if (!userId) {
        req.flash('error', 'flash.login_required_first');
        return res.redirect('/auth/login');
    }

    let isVerified = req.session && typeof req.session.userIsVerified !== 'undefined'
        ? req.session.userIsVerified
        : null;

    if (isVerified === null) {
        const user = await User.findById(userId);
        isVerified = Boolean(user && user.is_verified);
        if (req.session) req.session.userIsVerified = isVerified;
    }

    if (isVerified) {
        return next();
    }

    if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1)) {
        return res.status(403).json({ error: 'Email verification required' });
    }

    req.flash('error', 'flash.email_verification_required_action');
    return res.redirect('/auth/verify-email-pending');
};

// How stale the stored timestamp is allowed to get. Writing on every request
// Update last seen timestamp at most every 5 minutes per user session
const LAST_SEEN_TOUCH_INTERVAL_MS = 5 * 60 * 1000;

const touchLastSeen = async (req, userId) => {
    if (!req.session) return;

    const lastTouch = Number(req.session.lastSeenTouchedAt) || 0;
    if (Date.now() - lastTouch < LAST_SEEN_TOUCH_INTERVAL_MS) return;

    try {
        await User.touchLastSeen(userId);
        req.session.lastSeenTouchedAt = Date.now();
    } catch (error) {
        // Presence is decoration. A failed write must not cost the member the page.
        console.error('Last seen touch error:', error);
    }
};

// A visitor whose account was suspended or removed is still holding a session
// that was perfectly valid when it was issued. It is regenerated rather than
// just emptied, so the old session id cannot be replayed, and the explanation
// is written to the fresh session — writing it to the old one would throw it
// away along with the session.
const endSession = (req, res, messageKey, redirectTo) => {
    const wantsJson = req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1);

    if (wantsJson) {
        const translate = (res.locals && typeof res.locals.t === 'function') ? res.locals.t : null;
        const message = (messageKey && translate) ? translate(messageKey) : 'Session ended';
        return res.status(403).json({ error: message });
    }

    if (!req.session) return res.redirect(redirectTo);

    return req.session.regenerate((error) => {
        if (error) {
            console.error('Session regenerate on sign-out failed:', error);
            return res.redirect(redirectTo);
        }

        if (messageKey && typeof req.flash === 'function') {
            req.flash('error', messageKey);
        }

        req.session.save(() => res.redirect(redirectTo));
    });
};

const setUserLocal = async (req, res, next) => {
    let userId = req.session && req.session.userId;
    let user = req.user;

    if (!userId && user) {
        userId = user.id;
        if (req.session) {
            req.session.userId = user.id;
            req.session.userRole = user.role;
            req.session.userEmail = user.email;
            req.session.userName = user.full_name;
            req.session.userIsVerified = Boolean(user.is_verified);
        }
    }

    if (userId) {
        // The row is read on every authenticated request rather than trusted from
        // the session. Suspension and role changes used to stay invisible until the
        // next sign-in: an account could be banned and go on posting for the rest of
        // the week, and a demoted admin kept the panel. This is a primary-key lookup
        // sitting next to the five counter queries below, so being correct here does
        // not cost anything measurable.
        const uData = await User.findById(userId);

        if (!uData) {
            // The account was deleted while the session was still open. Nothing to
            // tell them about their account, so they are simply signed out.
            return endSession(req, res, null, '/');
        }

        if (Number(uData.is_active) === 0) {
            return endSession(req, res, 'flash.account_suspended', '/auth/login');
        }

        const isVerified = Boolean(uData.is_verified);
        const userAvatar = uData.avatar_url || null;
        const corporateStatus = uData.corporate_status || 'none';

        if (req.session) {
            req.session.userIsVerified = isVerified;
            req.session.userAvatar = userAvatar;
            req.session.userCorporateStatus = corporateStatus;
            req.session.userCorporateType = uData.corporate_type || null;
            req.session.userCompanyName = uData.company_name || null;
            req.session.userRole = uData.role;
            req.session.userEmail = uData.email;
            req.session.userName = uData.full_name;
        }

        const userData = {
            id: userId,
            email: (req.session && req.session.userEmail) || (user && user.email),
            name: (req.session && req.session.userName) || (user && user.full_name),
            full_name: (req.session && req.session.userName) || (user && user.full_name),
            role: (req.session && req.session.userRole) || (user && user.role),
            company_name: (req.session && req.session.userCompanyName) || (user && user.company_name) || null,
            corporate_status: corporateStatus || (user && user.corporate_status) || 'none',
            corporate_type: (req.session && req.session.userCorporateType) || (user && user.corporate_type) || null,
            avatar_url: userAvatar || (user && user.avatar_url) || null,
            is_verified: isVerified,
            show_surname: (user && typeof user.show_surname !== 'undefined') ? user.show_surname : 0
        };
        res.locals.user = userData;
        res.locals.currentUser = userData;
        res.locals.authUser = userData;
        res.locals.isEmailUnverified = !isVerified;
        res.locals.isCorporatePending = userData.corporate_status === 'pending';

        try {
            res.locals.unreadMessages = await Message.getUnreadCount(userId);
        } catch (error) {
            console.error('Unread count error:', error);
            res.locals.unreadMessages = 0;
        }

        try {
            res.locals.pendingBidCount = await Bid.countPendingForOwner(userId);
        } catch (error) {
            console.error('Pending bid count error:', error);
            res.locals.pendingBidCount = 0;
        }

        try {
            res.locals.pendingApplicationCount = await Career.countPendingForEmployer(userId);
        } catch (error) {
            console.error('Pending application count error:', error);
            res.locals.pendingApplicationCount = 0;
        }

        try {
            res.locals.unreadNotifications = await Notification.getUnreadCount(userId);
        } catch (error) {
            console.error('Unread notifications count error:', error);
            res.locals.unreadNotifications = 0;
        }

        await touchLastSeen(req, userId);
    } else {
        res.locals.user = null;
        res.locals.currentUser = null;
        res.locals.isEmailUnverified = false;
        res.locals.unreadMessages = 0;
        res.locals.unreadNotifications = 0;
        res.locals.pendingBidCount = 0;
        res.locals.pendingApplicationCount = 0;
    }
    next();
};

module.exports = {
    isAuthenticated,
    isAdmin,
    isOwner,
    requireVerifiedEmail,
    setUserLocal,
    LAST_SEEN_TOUCH_INTERVAL_MS
};
