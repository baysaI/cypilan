const Listing = require('../models/Listing');
const Category = require('../models/Category');
const User = require('../models/User');
const { generateSlug, maskPhone } = require('../utils/helpers');
const { isValidPhone } = require('../utils/validators');

const ALLOWED_CURRENCIES = ['TRY', 'GBP'];

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

        let currentCategoryName = null;
        if (filters.category) {
            const cat = await Category.getBySlug(filters.category);
            if (cat) {
                const lang = (req.session && req.session.lang) || 'tr';
                currentCategoryName = cat[`name_${lang}`] || cat.name_tr;
            }
        }

        const result = await Listing.findAll(filters, page, limit);
        const categories = await Category.getMainCategoriesWithCount();

        res.locals.meta = res.locals.meta || {};
        res.locals.meta.title = currentCategoryName ? `${currentCategoryName} İlanları | CYPILAN.COM` : 'Tüm İlanlar | CYPILAN.COM';
        
        let userFavoriteIds = [];
        if (req.session && req.session.userId) {
            userFavoriteIds = await Listing.getUserFavoriteIds(req.session.userId);
        }

        res.render('listings/index', {
            listings: result.data,
            pagination: {
                currentPage: page,
                totalPages: result.pages,
                totalItems: result.total
            },
            categories,
            filters,
            currentCategoryName,
            userFavoriteIds,
            title: currentCategoryName ? `${currentCategoryName} İlanları` : 'İlanlar'
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
        const listing = await Listing.findDetailBySlug(slug);

        if (!listing) {
            req.flash('error', 'İlan bulunamadı.');
            return res.redirect('/listings');
        }

        listing.phone_hidden = Number(listing.seller_show_phone) === 0;
        listing.has_phone = Boolean(listing.seller_phone) && !listing.phone_hidden;
        listing.seller_phone_masked = listing.has_phone ? maskPhone(listing.seller_phone) : '';
        delete listing.seller_phone;

        Listing.incrementViews(listing.id).catch(console.error);

        res.locals.meta.title = `${listing.title} | CYPILAN.COM`;
        res.locals.meta.description = listing.description ? listing.description.substring(0, 160) : '';
        if (listing.images && listing.images.length > 0) {
            res.locals.meta.ogImage = listing.images[0];
        }

        let isFavorited = false;
        if (req.session && req.session.userId) {
            const userFavs = await Listing.getUserFavoriteIds(req.session.userId);
            isFavorited = userFavs.includes(listing.id);
        }

        res.render('listings/show', {
            listing,
            isFavorited,
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
    const user = await User.findById(req.session.userId);
    res.render('listings/create', {
        categories,
        userPhone: (user && user.phone) || '',
        hidePhone: user ? Number(user.show_phone) === 0 : false,
        title: 'Ücretsiz İlan Ver'
    });
};

const create = async (req, res) => {
    try {
        const { title, description, category_id, price, currency, city, district, phone } = req.body;

        if (!title || !category_id || !city) {
            req.flash('error', 'Lütfen zorunlu alanları doldurun.');
            return res.redirect('/listings/create');
        }

        if (!phone || !isValidPhone(phone)) {
            req.flash('error', 'İlan verebilmek için geçerli bir iletişim telefonu girmelisiniz.');
            return res.redirect('/listings/create');
        }

        await User.update(req.session.userId, {
            phone: phone.trim(),
            show_phone: req.body.hide_phone ? 0 : 1
        });

        const images = (req.processedImages || []).map(f => f.path);
        const parsedPrice = parseFloat(price);

        const listing = await Listing.create({
            user_id: req.session.userId,
            category_id,
            title,
            slug: `${generateSlug(title)}-${Date.now().toString(36)}`,
            description,
            price: Number.isFinite(parsedPrice) ? parsedPrice : null,
            currency: ALLOWED_CURRENCIES.includes(currency) ? currency : 'TRY',
            city,
            district,
            status: 'active',
            images
        });

        req.flash('success', 'İlanınız başarıyla yayınlandı.');
        res.redirect(`/listings/${listing.slug}`);
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

const revealPhone = async (req, res) => {
    try {
        const listing = await Listing.findById(req.params.id);

        if (!listing || listing.status !== 'active') {
            return res.status(404).json({ error: 'İlan bulunamadı.' });
        }

        const owner = await User.findById(listing.user_id);

        if (!owner || !owner.phone) {
            return res.status(404).json({ error: 'Bu ilan için telefon numarası yok.' });
        }

        if (Number(owner.show_phone) === 0) {
            return res.status(403).json({
                error: 'Satıcı telefonunu gizlemiş. Mesaj göndererek iletişime geçebilirsiniz.'
            });
        }

        res.json({
            phone: owner.phone,
            whatsapp: owner.phone.replace(/\D/g, '')
        });
    } catch (error) {
        console.error('Reveal Phone Error:', error);
        res.status(500).json({ error: 'Numara alınamadı.' });
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
    revealPhone,
    toggleFavorite
};
