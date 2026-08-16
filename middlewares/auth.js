const User = require('../models/User');
const Message = require('../models/Message');
const Bid = require('../models/Bid');
const Career = require('../models/Career');

const isAuthenticated = (req, res, next) => {
    if ((req.session && req.session.userId) || req.isAuthenticated()) {
        return next();
    }

    if (req.method === 'GET' && !req.xhr) {
        req.session.returnTo = req.originalUrl;
    }
    
    if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1)) {
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
        let isVerified = req.session && typeof req.session.userIsVerified !== 'undefined'
            ? req.session.userIsVerified
            : null;

        if (isVerified === null) {
            const uData = await User.findById(userId);
            isVerified = Boolean(uData && uData.is_verified);
            if (req.session) req.session.userIsVerified = isVerified;
        }

        const userData = {
            id: userId,
            email: (req.session && req.session.userEmail) || (user && user.email),
            name: (req.session && req.session.userName) || (user && user.full_name),
            role: (req.session && req.session.userRole) || (user && user.role),
            is_verified: isVerified
        };
        res.locals.user = userData;
        res.locals.currentUser = userData;
        res.locals.isEmailUnverified = !isVerified;

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
    } else {
        res.locals.user = null;
        res.locals.currentUser = null;
        res.locals.isEmailUnverified = false;
        res.locals.unreadMessages = 0;
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
    setUserLocal
};
