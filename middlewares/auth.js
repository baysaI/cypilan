const User = require('../models/User');

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
    
    req.flash('error', 'Lütfen önce giriş yapın.');
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
    
    req.flash('error', 'Bu sayfaya erişim yetkiniz yok.');
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
    
    req.flash('error', 'Bu işlemi yapmaya yetkiniz yok.');
    return res.redirect('back');
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
        }
    }

    if (userId) {
        const userData = {
            id: userId,
            email: (req.session && req.session.userEmail) || (user && user.email),
            name: (req.session && req.session.userName) || (user && user.full_name),
            role: (req.session && req.session.userRole) || (user && user.role)
        };
        res.locals.user = userData;
        res.locals.currentUser = userData;
    } else {
        res.locals.user = null;
        res.locals.currentUser = null;
    }
    next();
};

module.exports = {
    isAuthenticated,
    isAdmin,
    isOwner,
    setUserLocal
};
