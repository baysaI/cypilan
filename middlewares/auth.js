const User = require('../models/User');

const isAuthenticated = (req, res, next) => {
    if (req.session && req.session.userId) {
        return next();
    }
    
    // Store requested URL to redirect after login
    if (req.method === 'GET' && !req.xhr) {
        req.session.returnTo = req.originalUrl;
    }
    
    if (req.xhr || req.headers.accept.indexOf('json') > -1) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    
    req.flash('error', 'Lütfen önce giriş yapın.');
    return res.redirect('/auth/login');
};

const isAdmin = (req, res, next) => {
    if (req.session && req.session.userRole === 'admin') {
        return next();
    }
    
    if (req.xhr || req.headers.accept.indexOf('json') > -1) {
        return res.status(403).json({ error: 'Admin access required' });
    }
    
    req.flash('error', 'Bu sayfaya erişim yetkiniz yok.');
    return res.redirect('/');
};

// Check if current user is owner of the listing
const isOwner = (req, res, next) => {
    const listingUserId = req.listing ? req.listing.user_id : null;
    
    if (req.session && req.session.userId && (req.session.userId === listingUserId || req.session.userRole === 'admin')) {
        return next();
    }
    
    if (req.xhr || req.headers.accept.indexOf('json') > -1) {
        return res.status(403).json({ error: 'Ownership required' });
    }
    
    req.flash('error', 'Bu işlemi yapmaya yetkiniz yok.');
    return res.redirect('back');
};

const setUserLocal = async (req, res, next) => {
    if (req.session && req.session.userId) {
        try {
            // Simplified for performance, normally would fetch full user
            res.locals.currentUser = {
                id: req.session.userId,
                email: req.session.userEmail,
                name: req.session.userName,
                role: req.session.userRole
            };
        } catch (error) {
            console.error('Error setting user local:', error);
            res.locals.currentUser = null;
        }
    } else {
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
