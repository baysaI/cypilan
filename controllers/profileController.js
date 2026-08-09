const fs = require('fs');
const path = require('path');
const User = require('../models/User');
const Listing = require('../models/Listing');

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
            req.flash('error', 'Kullanıcı bulunamadı.');
            return res.redirect('/');
        }

        const user = await User.findById(userId);

        if (!user) {
            req.flash('error', 'Kullanıcı bulunamadı.');
            return res.redirect('/');
        }

        const listings = await Listing.getByUser(userId);
        const stats = await User.getStats(userId);

        user.has_phone = Boolean(user.phone);
        delete user.phone;
        delete user.password_hash;
        delete user.email;

        res.locals.meta = res.locals.meta || {};
        res.locals.meta.title = `${user.full_name} | CYPILAN.COM`;

        res.render('profile/show', {
            profileUser: user,
            listings,
            stats,
            title: user.full_name
        });
    } catch (error) {
        console.error('Profile Show Error:', error);
        req.flash('error', 'Profil yüklenirken bir hata oluştu.');
        res.redirect('/');
    }
};

const edit = async (req, res) => {
    try {
        const user = await User.findById(req.session.userId);
        res.locals.meta = res.locals.meta || {};
        res.locals.meta.title = 'Profilimi Düzenle | CYPILAN.COM';
        
        const viewPath = path.join(__dirname, '..', 'views', 'profile', 'edit.ejs');
        if (fs.existsSync(viewPath)) {
            return res.render('profile/edit', { user, title: 'Profili Düzenle' });
        }
        res.redirect(`/profile/${req.session.userId}`);
    } catch (error) {
        console.error('Profile Edit Error:', error);
        res.redirect('/');
    }
};

const update = async (req, res) => {
    try {
        const { firstName, lastName, phone, city } = req.body;
        
        await User.update(req.session.userId, {
            firstName,
            lastName,
            phone,
            city,
            updatedAt: new Date().toISOString()
        });

        if (firstName || lastName) {
            req.session.userName = `${firstName || ''} ${lastName || ''}`.trim();
        }

        req.flash('success', 'Profiliniz güncellendi.');
        res.redirect(`/profile/${req.session.userId}`);
    } catch (error) {
        console.error('Profile Update Error:', error);
        req.flash('error', 'Profil güncellenirken hata oluştu.');
        res.redirect(`/profile/${req.session.userId}`);
    }
};

const myListings = async (req, res) => {
    try {
        const viewPath = path.join(__dirname, '..', 'views', 'profile', 'listings.ejs');
        if (fs.existsSync(viewPath)) {
            const listings = await Listing.getByUser(req.session.userId);
            res.locals.meta = res.locals.meta || {};
            res.locals.meta.title = 'İlanlarım | CYPILAN.COM';
            return res.render('profile/listings', { listings, title: 'İlanlarım' });
        }
        res.redirect(`/profile/${req.session.userId}`);
    } catch (error) {
        console.error('My Listings Error:', error);
        res.redirect('/');
    }
};

const myFavorites = async (req, res) => {
    try {
        const viewPath = path.join(__dirname, '..', 'views', 'profile', 'favorites.ejs');
        if (fs.existsSync(viewPath)) {
            const favorites = await Listing.findFavoritesByUser ? await Listing.findFavoritesByUser(req.session.userId) : [];
            res.locals.meta = res.locals.meta || {};
            res.locals.meta.title = 'Favorilerim | CYPILAN.COM';
            return res.render('profile/favorites', { favorites, title: 'Favorilerim' });
        }
        res.redirect(`/profile/${req.session.userId}`);
    } catch (error) {
        console.error('My Favorites Error:', error);
        res.redirect('/');
    }
};

const myMessages = async (req, res) => {
    try {
        const viewPath = path.join(__dirname, '..', 'views', 'profile', 'messages.ejs');
        if (fs.existsSync(viewPath)) {
            const messages = [];
            res.locals.meta = res.locals.meta || {};
            res.locals.meta.title = 'Mesajlarım | CYPILAN.COM';
            return res.render('profile/messages', { messages, title: 'Mesajlarım' });
        }
        res.redirect(`/profile/${req.session.userId}`);
    } catch (error) {
        console.error('My Messages Error:', error);
        res.redirect('/');
    }
};

module.exports = {
    index,
    show,
    edit,
    update,
    myListings,
    myFavorites,
    myMessages
};
