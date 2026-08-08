const User = require('../models/User');
const Listing = require('../models/Listing');

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
        res.locals.meta.title = 'Profilimi Düzenle | CYPILAN.COM';
        res.render('profile/edit', { user, title: 'Profili Düzenle' });
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

        req.session.userName = `${firstName} ${lastName}`;

        req.flash('success', 'Profiliniz güncellendi.');
        res.redirect('/profile/edit');
    } catch (error) {
        console.error('Profile Update Error:', error);
        req.flash('error', 'Profil güncellenirken hata oluştu.');
        res.redirect('/profile/edit');
    }
};

const myListings = async (req, res) => {
    try {
        const listings = await Listing.getByUser(req.session.userId);
        res.locals.meta.title = 'İlanlarım | CYPILAN.COM';
        res.render('profile/listings', { listings, title: 'İlanlarım' });
    } catch (error) {
        console.error('My Listings Error:', error);
        res.redirect('/profile');
    }
};

const myFavorites = async (req, res) => {
    try {
        const favorites = await Listing.findFavoritesByUser(req.session.userId);
        res.locals.meta.title = 'Favorilerim | CYPILAN.COM';
        res.render('profile/favorites', { favorites, title: 'Favorilerim' });
    } catch (error) {
        console.error('My Favorites Error:', error);
        res.redirect('/profile');
    }
};

const myMessages = async (req, res) => {
    try {
        const messages = await Message.findByUser(req.session.userId);
        res.locals.meta.title = 'Mesajlarım | CYPILAN.COM';
        res.render('profile/messages', { messages, title: 'Mesajlarım' });
    } catch (error) {
        console.error('My Messages Error:', error);
        res.redirect('/profile');
    }
};

module.exports = {
    show,
    edit,
    update,
    myListings,
    myFavorites,
    myMessages
};
