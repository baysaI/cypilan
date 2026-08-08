const Listing = require('../models/Listing');
const Category = require('../models/Category');

const index = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 20;
        const filters = {
            category: req.query.category,
            city: req.query.city,
            minPrice: req.query.minPrice,
            maxPrice: req.query.maxPrice,
            sort: req.query.sort || 'newest'
        };

        const result = await Listing.findAll(filters, page, limit);
        const categories = await Category.getMainCategoriesWithCount();

        res.locals.meta = res.locals.meta || {};
        res.locals.meta.title = 'Tüm İlanlar | CYPILAN.COM';
        
        res.render('listings/index', {
            listings: result.data,
            pagination: {
                page,
                totalPages: result.pages,
                totalItems: result.total
            },
            categories,
            filters,
            title: 'İlanlar'
        });
    } catch (error) {
        console.error('Listings Index Error:', error);
        req.flash('error', 'İlanlar yüklenirken bir hata oluştu.');
        res.redirect('/');
    }
};

const show = async (req, res) => {
    try {
        const { slug } = req.params;
        const listing = await Listing.findBySlug(slug);

        if (!listing) {
            req.flash('error', 'İlan bulunamadı.');
            return res.redirect('/listings');
        }

        Listing.incrementViews(listing.id).catch(console.error);

        res.locals.meta.title = `${listing.title} | CYPILAN.COM`;
        res.locals.meta.description = listing.description ? listing.description.substring(0, 160) : '';
        if (listing.images && listing.images.length > 0) {
            res.locals.meta.ogImage = `/uploads/listings/${listing.images[0]}`;
        }

        res.render('listings/show', {
            listing,
            title: listing.title
        });
    } catch (error) {
        console.error('Listing Show Error:', error);
        res.status(500).render('errors/500');
    }
};

const showCreate = async (req, res) => {
    res.locals.meta = res.locals.meta || {};
    res.locals.meta.title = 'İlan Ver | CYPILAN.COM';
    const categories = await Category.getAll();
    res.render('listings/create', { categories, title: 'Ücretsiz İlan Ver' });
};

const create = async (req, res) => {
    try {
        const { title, description, category_id, price, currency, city, condition } = req.body;
        
        const images = req.processedImages
            ? req.processedImages.map(f => f.filename)
            : (req.files ? req.files.map(f => f.filename) : []);

        const newListing = await Listing.create({
            user_id: req.session.userId,
            title,
            description,
            category_id,
            price: parseFloat(price),
            currency: currency || 'TRY',
            city,
            condition,
            images: JSON.stringify(images),
            status: 'active',
            slug: title.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Date.now().toString().slice(-4),
            createdAt: new Date().toISOString()
        });

        req.flash('success', 'İlanınız başarıyla yayınlandı.');
        res.redirect(`/listings/${newListing.slug || 'my-listings'}`);
    } catch (error) {
        console.error('Listing Create Error:', error);
        req.flash('error', 'İlan eklenirken bir hata oluştu.');
        res.redirect('/listings/create');
    }
};

const showEdit = async (req, res) => {
    try {
        const listing = await Listing.findBySlug(req.params.slug);
        if (!listing) {
            return res.redirect('/listings');
        }

        if (listing.user_id !== req.session.userId && req.session.userRole !== 'admin') {
            req.flash('error', 'Yetkisiz erişim.');
            return res.redirect('/');
        }

        res.locals.meta.title = 'İlanı Düzenle | CYPILAN.COM';
        res.render('listings/edit', { listing, title: 'İlanı Düzenle' });
    } catch (error) {
        console.error('Listing Edit Show Error:', error);
        res.redirect('/profile/listings');
    }
};

const update = async (req, res) => {
    try {
        const { slug } = req.params;
        const { title, description, price, currency } = req.body;
        
        const listing = await Listing.findBySlug(slug);
        if (!listing) return res.redirect('/listings');

        if (listing.user_id !== req.session.userId && req.session.userRole !== 'admin') {
            req.flash('error', 'Yetkisiz erişim.');
            return res.redirect('/');
        }

        await Listing.update(listing.id, {
            title,
            description,
            price: parseFloat(price),
            currency,
            updatedAt: new Date().toISOString()
        });

        req.flash('success', 'İlan başarıyla güncellendi.');
        res.redirect(`/listings/${slug}`);
    } catch (error) {
        console.error('Listing Update Error:', error);
        req.flash('error', 'Güncelleme sırasında hata oluştu.');
        res.redirect(`/listings/${req.params.slug}/edit`);
    }
};

const deleteListing = async (req, res) => {
    try {
        const { slug } = req.params;
        const listing = await Listing.findBySlug(slug);
        
        if (!listing) return res.redirect('/profile/listings');

        if (listing.user_id !== req.session.userId && req.session.userRole !== 'admin') {
            req.flash('error', 'Yetkisiz erişim.');
            return res.redirect('/');
        }

        await Listing.delete(listing.id);
        req.flash('success', 'İlan silindi.');
        res.redirect('/profile/listings');
    } catch (error) {
        console.error('Listing Delete Error:', error);
        req.flash('error', 'Silme işlemi başarısız.');
        res.redirect('back');
    }
};

const toggleFavorite = async (req, res) => {
    try {
        if (!req.session.userId) {
            return res.status(401).json({ error: 'Lütfen giriş yapın.' });
        }
        
        const listingId = req.params.id;
        const result = await Listing.toggleFavorite(listingId, req.session.userId);
        
        res.json({ success: true, favorited: result.favorited });
    } catch (error) {
        console.error('Toggle Favorite Error:', error);
        res.status(500).json({ error: 'Bir hata oluştu.' });
    }
};

module.exports = {
    index,
    show,
    showCreate,
    create,
    showEdit,
    update,
    delete: deleteListing,
    toggleFavorite
};
