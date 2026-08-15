const Listing = require('../models/Listing');
const Category = require('../models/Category');
const User = require('../models/User');
const Review = require('../models/Review');
const Bid = require('../models/Bid');
const Career = require('../models/Career');
const ServiceRequest = require('../models/ServiceRequest');
const { generateSlug, maskPhone } = require('../utils/helpers');
const { isValidPhone } = require('../utils/validators');
const { discardProcessedImages, removeImagesByUrl } = require('../middlewares/upload');
const listingPolicy = require('../config/listingPolicy');
const smartSearch = require('../utils/smartSearch');
const cities = require('../config/cities');
const listingDraft = require('../utils/listingDraft');

const ALLOWED_CURRENCIES = ['TRY', 'GBP'];
const OWNER_EDITABLE_STATUSES = ['active', 'sold'];
const BID_ELIGIBLE_ROOTS = ['emlak', 'vasita'];
const SMART_POOL_SIZE = 200;
const MIN_DESCRIPTION_LENGTH = 20;
const MAX_TITLE_LENGTH = 150;

// Any early exit from an upload-backed action has to clean up the files that
// processImagesWithWatermark already wrote, otherwise they leak onto disk forever.
const abort = async (req, res, message, redirectTo, params) => {
    await discardProcessedImages(req);
    req.flash('error', message, params);
    return res.redirect(redirectTo);
};

const index = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 20;
        const rawQuery = req.query.q ? req.query.q.trim() : undefined;

        // In smart mode the query box held a sentence, and the city/category/price
        // it named were already lifted into the URL. Searching the database for
        // the whole sentence as literal text would then match nothing, so only
        // the words left over after parsing are used as the text term.
        const smartMode = req.query.smart === '1' && Boolean(rawQuery);
        const parsed = smartMode ? smartSearch.parse(rawQuery) : null;

        const filters = {
            q: smartMode ? (parsed.leftover || undefined) : rawQuery,
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
                currentCategoryName = cat[`name_${res.locals.lang}`] || cat.name_tr;
            }
        }

        let result;
        if (smartMode) {
            // Relevance has to be judged across the whole match set, not within one
            // page, so a pool is fetched and ranked before being paged in memory.
            // Beyond the pool the ordering falls back to newest first.
            const pool = await Listing.findAll({ ...filters, sort: 'newest' }, 1, SMART_POOL_SIZE);
            const ranked = smartSearch.rank(pool.data, parsed);
            const offset = (page - 1) * limit;

            result = {
                data: ranked.slice(offset, offset + limit),
                total: pool.total,
                pages: Math.ceil(pool.total / limit) || 1
            };
        } else {
            result = await Listing.findAll(filters, page, limit);
        }

        const categories = await Category.getMainCategoriesWithCount();

        res.locals.meta = res.locals.meta || {};
        res.locals.meta.title = currentCategoryName ? `${currentCategoryName} İlanları` : 'Tüm İlanlar';

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
            smartQuery: smartMode ? rawQuery : null,
            smartParsed: parsed,
            title: currentCategoryName ? `${currentCategoryName} İlanları` : 'İlanlar'
        });
    } catch (error) {
        console.error('Listings Index Error:', error);
        next(error);
    }
};

const show = async (req, res, next) => {
    try {
        const { slug } = req.params;
        const listing = await Listing.findDetailBySlug(slug);

        if (!listing) {
            req.flash('error', 'flash.listing_not_found');
            return res.redirect('/listings');
        }

        listing.phone_hidden = Number(listing.seller_show_phone) === 0;
        listing.has_phone = Boolean(listing.seller_phone) && !listing.phone_hidden;
        listing.seller_phone_masked = listing.has_phone ? maskPhone(listing.seller_phone) : '';
        delete listing.seller_phone;

        Listing.incrementViews(listing.id).catch(console.error);

        res.locals.meta.title = listing.title;
        res.locals.meta.description = listing.description ? listing.description.substring(0, 160) : '';
        if (listing.images && listing.images.length > 0) {
            res.locals.meta.ogImage = listing.images[0];
        }

        let isFavorited = false;
        if (req.session && req.session.userId) {
            const userFavs = await Listing.getUserFavoriteIds(req.session.userId);
            isFavorited = userFavs.includes(listing.id);
        }

        const sellerRating = await Review.getSummary(listing.user_id);
        const bidSummary = listing.listing_type === 'bid_request'
            ? await Bid.summaryForListing(listing.id)
            : { total: 0, best_amount: null };

        // Only the owner is shown the service box, so the lookup is skipped for
        // everybody else rather than running on every public page view.
        const openServiceRequests = {};
        if (req.session && req.session.userId === listing.user_id) {
            const [assurance, promotion] = await Promise.all([
                ServiceRequest.findOpen(listing.id, 'assurance'),
                ServiceRequest.findOpen(listing.id, 'promotion')
            ]);
            openServiceRequests.assurance = assurance;
            openServiceRequests.promotion = promotion;
        }

        res.render('listings/show', {
            listing,
            isFavorited,
            sellerRating,
            bidSummary,
            openServiceRequests,
            offeredServices: listingPolicy.PROMOTION_REQUESTS_LIVE
                ? ['assurance', 'promotion']
                : ['assurance'],
            title: listing.title
        });
    } catch (error) {
        console.error('Listing Show Error:', error);
        next(error);
    }
};

const showCreate = async (req, res, next) => {
    try {
        res.locals.meta = res.locals.meta || {};
        res.locals.meta.title = 'İlan Ver';

        const categories = await Category.getAll();
        const user = await User.findById(req.session.userId);

        const usedQuota = await Listing.countByUserInRootCategories(
            req.session.userId,
            listingPolicy.QUOTA_CATEGORIES
        );

        // The draft helper's per-category fields and their labels, resolved server
        // side so the wording is translated rather than hard-coded in the script.
        const draftFeatureMap = {};
        const draftFeatureLabels = {};
        Object.keys(listingDraft.FEATURE_LABELS).forEach((rootSlug) => {
            draftFeatureMap[rootSlug] = listingDraft.featuresFor(rootSlug);
            draftFeatureMap[rootSlug].forEach((feature) => {
                draftFeatureLabels[feature] = res.locals.t(`draft.features.${feature}`);
            });
        });

        res.render('listings/create', {
            categories,
            draftFeatureMap,
            draftFeatureLabels,
            userPhone: (user && user.phone) || '',
            hidePhone: user ? Number(user.show_phone) === 0 : false,
            quota: {
                limit: listingPolicy.FREE_LISTING_QUOTA,
                used: usedQuota,
                remaining: Math.max(0, listingPolicy.FREE_LISTING_QUOTA - usedQuota),
                categories: listingPolicy.QUOTA_CATEGORIES,
                freeCategories: listingPolicy.ALWAYS_FREE_CATEGORIES
            },
            title: 'Ücretsiz İlan Ver'
        });
    } catch (error) {
        console.error('Listing Create Form Error:', error);
        next(error);
    }
};

const create = async (req, res, next) => {
    const backToForm = '/listings/create';

    try {
        const { title, description, category_id, price, currency, city, district, phone } = req.body;

        if (!title || !title.trim() || !category_id || !city) {
            return abort(req, res, 'flash.fill_mandatory_fields', backToForm);
        }

        // The dropdown is built from config/cities.js, but a posted form is not
        // bound by it, and a free-text city would never match any filter again.
        if (!cities.isKnown(city)) {
            return abort(req, res, 'flash.select_valid_city', backToForm);
        }

        if (title.trim().length > MAX_TITLE_LENGTH) {
            return abort(req, res, 'flash.title_too_long', backToForm, { max: MAX_TITLE_LENGTH });
        }

        if (!phone || !isValidPhone(phone)) {
            return abort(req, res, 'flash.listing_phone_required', backToForm);
        }

        const rootSlug = await Category.getRootSlug(parseInt(category_id, 10));

        if (!rootSlug) {
            return abort(req, res, 'flash.select_valid_category', backToForm);
        }

        const images = (req.processedImages || []).map(f => f.path);
        const parsedPrice = parseFloat(price);

        if (listingPolicy.requiresPhotos(rootSlug) && images.length === 0) {
            return abort(req, res, 'flash.photo_required', backToForm);
        }

        if (!description || description.trim().length < MIN_DESCRIPTION_LENGTH) {
            return abort(req, res, 'flash.description_too_short', backToForm, { min: MIN_DESCRIPTION_LENGTH });
        }

        if (listingPolicy.requiresPrice(rootSlug) && (!Number.isFinite(parsedPrice) || parsedPrice <= 0)) {
            return abort(req, res, 'flash.price_required', backToForm);
        }

        const usedQuota = await Listing.countByUserInRootCategories(
            req.session.userId,
            listingPolicy.QUOTA_CATEGORIES
        );

        const decision = listingPolicy.evaluate({
            role: req.session.userRole,
            rootSlug,
            usedCount: usedQuota
        });

        if (!decision.allowed) {
            return abort(
                req,
                res,
                'flash.quota_exhausted',
                '/ilan-paketleri',
                { quota: listingPolicy.FREE_LISTING_QUOTA }
            );
        }

        await User.update(req.session.userId, {
            phone: phone.trim(),
            show_phone: req.body.hide_phone ? 0 : 1
        });

        const status = listingPolicy.initialStatus(req.session.userRole);

        // Opting in turns the ad into a request for offers: registered agents and
        // dealers can then bid on it. Only property and vehicles are eligible, so
        // the flag is ignored elsewhere even if the form is bypassed.
        const collectsBids = Boolean(req.body.collect_bids) && BID_ELIGIBLE_ROOTS.includes(rootSlug);

        const listing = await Listing.create({
            user_id: req.session.userId,
            category_id,
            title: title.trim(),
            slug: `${generateSlug(title)}-${Date.now().toString(36)}`,
            description: description.trim(),
            price: Number.isFinite(parsedPrice) ? parsedPrice : null,
            currency: ALLOWED_CURRENCIES.includes(currency) ? currency : 'TRY',
            listing_type: collectsBids ? 'bid_request' : 'sale',
            city,
            district,
            status,
            expires_at: listingPolicy.expiresAt(),
            images
        });

        // Pay, contract shape and requirements live beside the listing rather than
        // inside it, and only exist for adverts under the jobs tree.
        if (rootSlug === 'is-ilanlari') {
            await Career.saveJobDetails(listing.id, req.body);
        }

        req.flash('success', status === 'pending' ? 'flash.listing_pending_review' : 'flash.listing_published');
        res.redirect(status === 'pending' ? '/profile/listings' : `/listings/${listing.slug}`);
    } catch (error) {
        console.error('Listing Create Error:', error);
        await discardProcessedImages(req);
        req.flash('error', 'flash.listing_create_failed');
        res.redirect(backToForm);
    }
};

const showEdit = async (req, res, next) => {
    try {
        const listing = req.listing;
        const [categories, images, rootSlug] = await Promise.all([
            Category.getAll(),
            Listing.getImages(listing.id),
            Category.getRootSlug(listing.category_id)
        ]);

        res.locals.meta = res.locals.meta || {};
        res.locals.meta.title = 'İlanı Düzenle';
        res.locals.meta.robots = 'noindex, nofollow';

        res.render('listings/edit', {
            listing,
            categories,
            images,
            requiresPrice: listingPolicy.requiresPrice(rootSlug),
            requiresPhotos: listingPolicy.requiresPhotos(rootSlug),
            ownerStatuses: OWNER_EDITABLE_STATUSES,
            title: 'İlanı Düzenle'
        });
    } catch (error) {
        console.error('Listing Edit Show Error:', error);
        next(error);
    }
};

const update = async (req, res, next) => {
    const listing = req.listing;
    const backToForm = `/listings/${listing.slug}/edit`;

    try {
        const { title, description, price, currency, city, district, status } = req.body;

        if (!title || !title.trim()) {
            return abort(req, res, 'flash.title_required', backToForm);
        }

        if (title.trim().length > MAX_TITLE_LENGTH) {
            return abort(req, res, 'flash.title_too_long', backToForm, { max: MAX_TITLE_LENGTH });
        }

        if (!description || description.trim().length < MIN_DESCRIPTION_LENGTH) {
            return abort(req, res, 'flash.description_too_short', backToForm, { min: MIN_DESCRIPTION_LENGTH });
        }

        const rootSlug = await Category.getRootSlug(listing.category_id);
        const parsedPrice = parseFloat(price);

        if (listingPolicy.requiresPrice(rootSlug) && (!Number.isFinite(parsedPrice) || parsedPrice <= 0)) {
            return abort(req, res, 'flash.price_required', backToForm);
        }

        const newImages = (req.processedImages || []).map(f => f.path);
        const existingImages = await Listing.getImages(listing.id);

        if (listingPolicy.requiresPhotos(rootSlug) && newImages.length === 0 && existingImages.length === 0) {
            return abort(req, res, 'flash.photo_required_short', backToForm);
        }

        const nextStatus = OWNER_EDITABLE_STATUSES.includes(status) ? status : listing.status;

        const updates = {
            title: title.trim(),
            description: description.trim(),
            price: Number.isFinite(parsedPrice) ? parsedPrice : null,
            currency: ALLOWED_CURRENCIES.includes(currency) ? currency : listing.currency,
            location_city: cities.isKnown(city) ? city : listing.location_city,
            location_district: district ? district.trim() : null,
            status: nextStatus
        };

        // Reviving an expired listing without a fresh deadline would just let the
        // next expiry sweep bury it again.
        if (nextStatus === 'active' && listing.status === 'expired') {
            updates.expires_at = listingPolicy.expiresAt();
        }

        await Listing.update(listing.id, updates);

        if (newImages.length > 0) {
            await Listing.replaceImages(listing.id, newImages);
            await removeImagesByUrl(existingImages);
        }

        req.flash('success', 'flash.listing_updated');
        res.redirect(`/listings/${listing.slug}`);
    } catch (error) {
        console.error('Listing Update Error:', error);
        await discardProcessedImages(req);
        req.flash('error', 'flash.listing_update_failed');
        res.redirect(backToForm);
    }
};

const deleteListing = async (req, res, next) => {
    try {
        const listing = req.listing;
        const images = await Listing.getImages(listing.id);

        await Listing.delete(listing.id);
        await removeImagesByUrl(images);

        req.flash('success', 'flash.listing_deleted');
        res.redirect('/profile/listings');
    } catch (error) {
        console.error('Listing Delete Error:', error);
        req.flash('error', 'flash.delete_failed');
        res.redirect('/profile/listings');
    }
};

const revealPhone = async (req, res) => {
    try {
        const listing = await Listing.findById(req.params.id);

        if (!listing || listing.status !== 'active') {
            return res.status(404).json({ error: res.locals.t('flash.listing_not_found') });
        }

        const owner = await User.findById(listing.user_id);

        if (!owner || !owner.phone) {
            return res.status(404).json({ error: res.locals.t('flash.phone_not_available') });
        }

        if (Number(owner.show_phone) === 0) {
            return res.status(403).json({
                error: res.locals.t('flash.phone_hidden')
            });
        }

        res.json({
            phone: owner.phone,
            whatsapp: owner.phone.replace(/\D/g, '')
        });
    } catch (error) {
        console.error('Reveal Phone Error:', error);
        res.status(500).json({ error: res.locals.t('flash.phone_fetch_failed') });
    }
};

const toggleFavorite = async (req, res) => {
    try {
        if (!req.session.userId) {
            return res.status(401).json({ error: res.locals.t('flash.login_required') });
        }

        const listingId = parseInt(req.params.id, 10);
        if (!Number.isInteger(listingId)) {
            return res.status(400).json({ error: res.locals.t('flash.invalid_listing') });
        }

        const listing = await Listing.findById(listingId);
        if (!listing) {
            return res.status(404).json({ error: res.locals.t('flash.listing_not_found') });
        }

        const result = await Listing.toggleFavorite(listingId, req.session.userId);

        res.json({ success: true, favorited: result.favorited });
    } catch (error) {
        console.error('Toggle Favorite Error:', error);
        res.status(500).json({ error: res.locals.t('flash.generic_error') });
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
