const fs = require('fs');
const path = require('path');
const User = require('../models/User');
const Listing = require('../models/Listing');
const { isValidPhone, isValidPassword, isValidEmail } = require('../utils/validators');

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
        const { full_name, phone, bio } = req.body;
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
                req.flash('error', 'Geçerli bir telefon numarası girin.');
                return res.redirect('/profile/edit');
            }
            updates.phone = trimmed || null;
        }

        updates.show_phone = req.body.hide_phone ? 0 : 1;

        await User.update(req.session.userId, updates);

        if (updates.full_name) {
            req.session.userName = updates.full_name;
        }

        req.flash('success', 'Profiliniz güncellendi.');
        res.redirect('/profile/edit');
    } catch (error) {
        console.error('Profile Update Error:', error);
        req.flash('error', 'Profil güncellenirken hata oluştu.');
        res.redirect('/profile/edit');
    }
};

const changePassword = async (req, res) => {
    try {
        const { current_password, new_password, confirm_password } = req.body;
        const user = await User.findById(req.session.userId);

        if (!user) {
            req.flash('error', 'Kullanıcı bulunamadı.');
            return res.redirect('/profile/edit');
        }

        const needsCurrent = Number(user.has_password) !== 0;

        if (needsCurrent) {
            if (!current_password) {
                req.flash('error', 'Mevcut şifrenizi girin.');
                return res.redirect('/profile/edit');
            }
            const matches = await User.verifyPassword(current_password, user.password_hash);
            if (!matches) {
                req.flash('error', 'Mevcut şifreniz hatalı.');
                return res.redirect('/profile/edit');
            }
        }

        if (!new_password || !isValidPassword(new_password)) {
            req.flash('error', 'Yeni şifre en az 8 karakter olmalı, 1 büyük harf ve 1 rakam içermelidir.');
            return res.redirect('/profile/edit');
        }

        if (new_password !== confirm_password) {
            req.flash('error', 'Yeni şifreler birbiriyle eşleşmiyor.');
            return res.redirect('/profile/edit');
        }

        await User.setPassword(user.id, new_password);

        req.flash('success', needsCurrent ? 'Şifreniz güncellendi.' : 'Şifreniz belirlendi. Artık e-posta ile de giriş yapabilirsiniz.');
        res.redirect('/profile/edit');
    } catch (error) {
        console.error('Change Password Error:', error);
        req.flash('error', 'Şifre güncellenirken hata oluştu.');
        res.redirect('/profile/edit');
    }
};

const changeEmail = async (req, res) => {
    try {
        const { new_email, current_password } = req.body;
        const user = await User.findById(req.session.userId);

        if (!user) {
            req.flash('error', 'Kullanıcı bulunamadı.');
            return res.redirect('/profile/edit');
        }

        if (Number(user.has_password) === 0) {
            req.flash('error', 'E-posta adresinizi değiştirmeden önce bir şifre belirlemelisiniz.');
            return res.redirect('/profile/edit');
        }

        const matches = await User.verifyPassword(current_password, user.password_hash);
        if (!matches) {
            req.flash('error', 'Şifreniz hatalı.');
            return res.redirect('/profile/edit');
        }

        const email = (new_email || '').trim().toLowerCase();

        if (!isValidEmail(email)) {
            req.flash('error', 'Geçerli bir e-posta adresi girin.');
            return res.redirect('/profile/edit');
        }

        if (email === (user.email || '').toLowerCase()) {
            req.flash('info', 'E-posta adresiniz zaten bu.');
            return res.redirect('/profile/edit');
        }

        if (await User.isEmailTaken(email, user.id)) {
            req.flash('error', 'Bu e-posta adresi başka bir hesap tarafından kullanılıyor.');
            return res.redirect('/profile/edit');
        }

        await User.update(user.id, { email });
        req.session.userEmail = email;

        req.flash('success', 'E-posta adresiniz güncellendi. Bundan sonra bu adresle giriş yapacaksınız.');
        res.redirect('/profile/edit');
    } catch (error) {
        console.error('Change Email Error:', error);
        req.flash('error', 'E-posta güncellenirken hata oluştu.');
        res.redirect('/profile/edit');
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
        const favorites = await Listing.findFavoritesByUser(req.session.userId);
        res.locals.meta = res.locals.meta || {};
        res.locals.meta.title = 'Favorilerim | CYPILAN.COM';
        return res.render('profile/favorites', { favorites, title: 'Favorilerim' });
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
    changePassword,
    changeEmail,
    myListings,
    myFavorites,
    myMessages
};
