const User = {
    countAll: async () => 0,
    findAll: async (page, limit) => ({ data: [], total: 0 }),
    updateStatus: async (id, status) => true
};
const Listing = {
    countAll: async () => 0,
    findAll: async (filters, page, limit) => ({ data: [], total: 0 }),
    updateStatus: async (id, status) => true
};

const dashboard = async (req, res) => {
    try {
        const stats = {
            totalUsers: await User.countAll(),
            totalListings: await Listing.countAll(),
            activeListings: 0,
            pendingListings: 0,
            reports: 0
        };

        res.locals.meta.title = 'Admin Paneli | CYPILAN.COM';
        res.render('admin/dashboard', { layout: 'admin/layout', stats, title: 'Dashboard' });
    } catch (error) {
        console.error('Admin Dashboard Error:', error);
        res.redirect('/');
    }
};

const users = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 20;
        
        const result = await User.findAll(page, limit);
        
        res.locals.meta.title = 'Kullanıcı Yönetimi | Admin Paneli';
        res.render('admin/users', { 
            layout: 'admin/layout',
            users: result.data,
            pagination: { page, totalItems: result.total, totalPages: Math.ceil(result.total / limit) },
            title: 'Kullanıcılar'
        });
    } catch (error) {
        console.error('Admin Users Error:', error);
        req.flash('error', 'Kullanıcılar yüklenemedi.');
        res.redirect('/admin');
    }
};

const listings = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 20;
        
        const result = await Listing.findAll({ status: req.query.status }, page, limit);
        
        res.locals.meta.title = 'İlan Yönetimi | Admin Paneli';
        res.render('admin/listings', {
            layout: 'admin/layout',
            listings: result.data,
            pagination: { page, totalItems: result.total, totalPages: Math.ceil(result.total / limit) },
            title: 'İlanlar'
        });
    } catch (error) {
        console.error('Admin Listings Error:', error);
        req.flash('error', 'İlanlar yüklenemedi.');
        res.redirect('/admin');
    }
};

const reports = async (req, res) => {
    try {
        res.locals.meta.title = 'Şikayet Yönetimi | Admin Paneli';
        res.render('admin/reports', {
            layout: 'admin/layout',
            reports: [],
            title: 'Şikayetler'
        });
    } catch (error) {
        console.error('Admin Reports Error:', error);
        res.redirect('/admin');
    }
};

const toggleListingStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        
        if (!['active', 'pending', 'rejected'].includes(status)) {
            return res.status(400).json({ error: 'Geçersiz durum.' });
        }
        
        await Listing.updateStatus(id, status);
        res.json({ success: true, message: 'İlan durumu güncellendi.' });
    } catch (error) {
        console.error('Admin Toggle Listing Error:', error);
        res.status(500).json({ error: 'İşlem başarısız.' });
    }
};

const toggleUserStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        
        if (!['active', 'suspended'].includes(status)) {
            return res.status(400).json({ error: 'Geçersiz durum.' });
        }
        
        await User.updateStatus(id, status);
        res.json({ success: true, message: 'Kullanıcı durumu güncellendi.' });
    } catch (error) {
        console.error('Admin Toggle User Error:', error);
        res.status(500).json({ error: 'İşlem başarısız.' });
    }
};

module.exports = {
    dashboard,
    users,
    listings,
    reports,
    toggleListingStatus,
    toggleUserStatus
};
