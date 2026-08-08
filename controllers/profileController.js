// Mock models
const User = {
    findById: async (id) => ({ id, name: 'User' }),
    update: async (id, data) => true
};
const Listing = {
    findByUser: async (userId) => [],
    findFavoritesByUser: async (userId) => []
};
const Message = {
    findByUser: async (userId) => []
};
const Review = {
    findByUser: async (userId) => []
};

const show = async (req, res) => {
    try {
        const userId = req.params.id;
        const user = await User.findById(userId);
        
        if (!user) {
            req.flash('error', 'Kullanıcı bulunamadı.');
            return res.redirect('/');
        }

        const listings = await Listing.findByUser(userId);
        const reviews = await Review.findByUser(userId);

        res.locals.meta.title = `${user.firstName} ${user.lastName} Profili | CYPILAN.COM`;

        res.render('profile/show', {
            profileUser: user,
            listings,
            reviews,
            title: 'Kullanıcı Profili'
        });
    } catch (error) {
        console.error('Profile Show Error:', error);
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

        // Update session data
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
        const listings = await Listing.findByUser(req.session.userId);
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
