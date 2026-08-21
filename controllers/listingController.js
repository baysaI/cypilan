const Listing = require('../models/Listing');
const Category = require('../models/Category');
const User = require('../models/User');
const Review = require('../models/Review');
const Bid = require('../models/Bid');
const Career = require('../models/Career');
const ServiceRequest = require('../models/ServiceRequest');
const { generateSlug, maskPhone, formatDisplayName, getCityName } = require('../utils/helpers');
const { isValidPhone } = require('../utils/validators');
const { discardProcessedImages, removeImagesByUrl } = require('../middlewares/upload');
const Setting = require('../models/Setting');
const PriceAlert = require('../models/PriceAlert');
const listingPolicy = require('../config/listingPolicy');
const listingBadges = require('../config/listingBadges');
const smartSearch = require('../utils/smartSearch');
const cities = require('../config/cities');
const listingDraft = require('../utils/listingDraft');
const seoContent = require('../config/seoContent');

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
    if (req.session && req.body && typeof req.body === 'object') {
        req.session.listingFormData = { ...req.body };
    }
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

        const allowedTypes = ['sale', 'rent', 'wanted', 'job', 'service'];
        const rawType = req.query.type || req.query.listing_type;
        const listingType = allowedTypes.includes(rawType) ? rawType : undefined;

        const filters = {
            q: smartMode ? (parsed.leftover || undefined) : rawQuery,
            category: req.query.category,
            city: req.query.city,
            minPrice: req.query.minPrice,
            maxPrice: req.query.maxPrice,
            listing_type: listingType,
            type: listingType,
            // An unrecognised badge is dropped, so a hand-edited URL falls back to
            // the unfiltered list with "Tümü" selected — the page then matches what
            // it is showing, instead of an empty result with a filter nobody can
            // see. The model refuses to guess for other callers and matches nothing
            // there; only this entry point is allowed to be forgiving.
            badge: listingBadges.isKnownKey(req.query.badge) ? req.query.badge : undefined,
            sort: req.query.sort || 'newest'
        };

        let currentCategoryName = null;
        let currentRootSlug = null;
        if (filters.category) {
            const cat = await Category.getBySlug(filters.category);
            if (cat) {
                currentCategoryName = cat[`name_${res.locals.lang}`] || cat.name_tr;
                currentRootSlug = await Category.getRootSlug(cat.id);
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
        const cityName = filters.city ? (getCityName(filters.city, req.lang || 'tr') || filters.city) : null;
        if (currentCategoryName && cityName) {
            res.locals.meta.title = `${cityName} ${currentCategoryName} İlanları - Kıbrıs KKTC`;
            res.locals.meta.description = `${cityName} bölgesindeki en güncel ${currentCategoryName.toLowerCase()} ilanları. Fiyatlar, fotoğraflar ve satıcı iletişim bilgileri CYPILAN'da.`;
        } else if (currentCategoryName) {
            res.locals.meta.title = `Kıbrıs ${currentCategoryName} İlanları - KKTC`;
            res.locals.meta.description = `Kuzey Kıbrıs genelinde satılık ve kiralık ${currentCategoryName.toLowerCase()} ilanları. Lefkoşa, Girne, Mağusa ilanlarını CYPILAN'da keşfedin.`;
        } else if (cityName) {
            res.locals.meta.title = `${cityName} İlanları - KKTC Emlak, Vasıta, 2. El`;
            res.locals.meta.description = `${cityName} şehrindeki satılık emlak, ikinci el araç, iş ilanları ve hizmetler. En yeni ilanları CYPILAN'da inceleyin.`;
        } else {
            res.locals.meta.title = 'Kıbrıs İlanları - KKTC Emlak, Vasıta, İkinci El ve İş İlanları';
            res.locals.meta.description = 'Kuzey Kıbrıs\'ın en büyük ilan platformu CYPILAN.COM ile binlerce satılık ve kiralık ilana hemen ulaşın, ücretsiz ilan verin.';
        }

        let userFavoriteIds = [];
        if (req.session && req.session.userId) {
            userFavoriteIds = await Listing.getUserFavoriteIds(req.session.userId);
        }

        const categoryTarget = currentRootSlug || filters.category;
        const seoBlock = seoContent.getSeoBlock(categoryTarget, filters.city);
        const faqSchema = seoContent.getFaqSchema(categoryTarget);
        if (faqSchema) {
            if (res.locals.schemaOrg && Array.isArray(res.locals.schemaOrg['@graph'])) {
                res.locals.schemaOrg['@graph'].push(faqSchema);
            } else if (Array.isArray(res.locals.schemaOrg)) {
                res.locals.schemaOrg.push(faqSchema);
            }
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
            currentRootSlug,
            userFavoriteIds,
            smartQuery: smartMode ? rawQuery : null,
            smartParsed: parsed,
            seoBlock,
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

        const Career = require('../models/Career');
        const rootSlug = await Category.getRootSlug(listing.category_id);
        listing.root_slug = rootSlug;
        if (rootSlug === 'is-ilanlari') {
            listing.job_details = await Career.getJobDetails(listing.id);
        }

        listing.seller_name = formatDisplayName(listing.seller_name, listing.seller_show_surname);
        listing.phone_hidden = Number(listing.seller_show_phone) === 0;
        listing.has_phone = Boolean(listing.seller_phone) && !listing.phone_hidden;
        listing.seller_phone_masked = listing.has_phone ? maskPhone(listing.seller_phone) : '';
        delete listing.seller_phone;

        Listing.incrementViews(listing.id).catch(console.error);

        const cityName = getCityName(listing.location_city, req.lang || 'tr') || listing.location_city || 'Kıbrıs';
        const categoryName = listing.category_name || 'İlan';
        const baseUrl = (process.env.SITE_URL || 'https://cypilan.com').replace(/\/$/, '');
        const canonicalUrl = `${baseUrl}/listings/${encodeURIComponent(listing.slug)}`;

        res.locals.meta.title = listing.price 
            ? `${listing.title} - ${cityName} (${Number(listing.price).toLocaleString('tr-TR')} ${listing.currency})`
            : `${listing.title} - ${cityName} ${categoryName}`;
        
        const cleanDesc = listing.description ? listing.description.replace(/<[^>]*>?/gm, '').trim() : '';
        res.locals.meta.description = cleanDesc 
            ? cleanDesc.substring(0, 160) 
            : `${listing.title} ilan detayları, fiyatı ve özellikleri. ${cityName} ${categoryName} ilanları için Kıbrıs'ın güvenilir platformu CYPILAN'ı ziyaret edin.`;
        res.locals.meta.canonical = canonicalUrl;
        res.locals.meta.url = canonicalUrl;

        if (listing.images && listing.images.length > 0) {
            res.locals.meta.ogImage = listing.images[0];
        }

        // Schema.org Rich Snippets
        const sellerObj = {
            "@type": listing.seller_role === 'business' ? "Organization" : "Person",
            "name": listing.seller_company || listing.seller_name || "CYPILAN Üyesi"
        };

        const breadcrumbSchema = {
            "@type": "BreadcrumbList",
            "itemListElement": [
                { "@type": "ListItem", "position": 1, "name": "Ana Sayfa", "item": baseUrl },
                { "@type": "ListItem", "position": 2, "name": categoryName, "item": `${baseUrl}/listings?category=${listing.category_slug || ''}` },
                { "@type": "ListItem", "position": 3, "name": listing.title, "item": canonicalUrl }
            ]
        };

        let mainSchema;
        const catSlug = listing.category_slug || '';

        if (catSlug.startsWith('vasita')) {
            mainSchema = {
                "@type": "Car",
                "@id": `${canonicalUrl}#vehicle`,
                "name": listing.title,
                "description": cleanDesc || listing.title,
                "image": listing.images || [],
                "vehicleModelDate": listing.attributes && listing.attributes.year ? String(listing.attributes.year) : undefined,
                "brand": listing.attributes && listing.attributes.brand ? { "@type": "Brand", "name": listing.attributes.brand } : undefined,
                "model": (listing.attributes && listing.attributes.model) || undefined,
                "offers": {
                    "@type": "Offer",
                    "price": listing.price || 0,
                    "priceCurrency": listing.currency || "GBP",
                    "availability": listing.status === 'active' ? "https://schema.org/InStock" : "https://schema.org/SoldOut",
                    "url": canonicalUrl,
                    "seller": sellerObj
                }
            };
        } else if (catSlug.startsWith('emlak')) {
            mainSchema = {
                "@type": "RealEstateListing",
                "@id": `${canonicalUrl}#realestate`,
                "name": listing.title,
                "description": cleanDesc || listing.title,
                "image": listing.images || [],
                "offers": {
                    "@type": "Offer",
                    "price": listing.price || 0,
                    "priceCurrency": listing.currency || "GBP",
                    "availability": listing.status === 'active' ? "https://schema.org/InStock" : "https://schema.org/SoldOut",
                    "url": canonicalUrl,
                    "seller": sellerObj
                }
            };
        } else if (catSlug.startsWith('is-ilanlari')) {
            mainSchema = {
                "@type": "JobPosting",
                "@id": `${canonicalUrl}#job`,
                "title": listing.title,
                "description": cleanDesc || listing.title,
                "datePosted": listing.created_at ? new Date(listing.created_at).toISOString() : new Date().toISOString(),
                "hiringOrganization": sellerObj,
                "jobLocation": {
                    "@type": "Place",
                    "address": {
                        "@type": "PostalAddress",
                        "addressLocality": cityName,
                        "addressCountry": "CY"
                    }
                },
                "employmentType": (listing.attributes && listing.attributes.employment_type) || "FULL_TIME"
            };
        } else {
            mainSchema = {
                "@type": "Product",
                "@id": `${canonicalUrl}#product`,
                "name": listing.title,
                "description": cleanDesc || listing.title,
                "image": listing.images || [],
                "offers": {
                    "@type": "Offer",
                    "price": listing.price || 0,
                    "priceCurrency": listing.currency || "TRY",
                    "availability": listing.status === 'active' ? "https://schema.org/InStock" : "https://schema.org/SoldOut",
                    "url": canonicalUrl,
                    "seller": sellerObj
                }
            };
        }

        res.locals.schemaOrg = {
            "@context": "https://schema.org",
            "@graph": [mainSchema, breadcrumbSchema]
        };

        let isFavorited = false;
        let isPriceAlertActive = false;
        if (req.session && req.session.userId) {
            const [userFavs, alert] = await Promise.all([
                Listing.getUserFavoriteIds(req.session.userId),
                PriceAlert.findByPair(req.session.userId, listing.id)
            ]);
            isFavorited = userFavs.includes(listing.id);
            isPriceAlertActive = alert !== null;
        }

        const coordinates = cities.getCoordinates(listing.location_city, listing.location_lat, listing.location_lng);

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
            isPriceAlertActive,
            coordinates,
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

        const [categories, categoryTree, user] = await Promise.all([
            Category.getAll(),
            Category.getTree(),
            User.findById(req.session.userId)
        ]);

        if (user && user.corporate_status === 'pending') {
            req.flash('error', 'flash.corporate_pending_approval');
            return res.redirect('/profile');
        }

        const isUnlimitedSetting = Setting.getBool(Setting.KEYS.UNLIMITED_LISTINGS_MODE, false);
        const isCorporate = listingPolicy.isCorporateRole(req.session.userRole);
        const isUnlimited = isUnlimitedSetting || isCorporate;

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

        const formData = (req.session && req.session.listingFormData) || {};
        if (req.session && req.session.listingFormData) {
            delete req.session.listingFormData;
        }

        res.render('listings/create', {
            categories,
            categoryTree,
            draftFeatureMap,
            draftFeatureLabels,
            formData,
            userPhone: (user && user.phone) || '',
            hidePhone: user ? Number(user.show_phone) === 0 : false,
            hideSurname: user ? (typeof user.show_surname === 'undefined' || Number(user.show_surname) === 0) : true,
            quota: {
                limit: isUnlimited ? null : listingPolicy.FREE_LISTING_QUOTA,
                used: usedQuota,
                remaining: isUnlimited ? null : Math.max(0, listingPolicy.FREE_LISTING_QUOTA - usedQuota),
                isUnlimited: isUnlimited,
                isCorporate: isCorporate,
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
        const user = await User.findById(req.session.userId);
        if (user && user.corporate_status === 'pending') {
            return abort(req, res, 'flash.corporate_pending_approval', '/profile');
        }

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

        const category = await Category.getBySlug(parseInt(category_id, 10));
        const rootSlug = category ? await Category.getRootSlug(category.id) : null;

        if (!rootSlug || !category) {
            return abort(req, res, 'flash.select_valid_category', backToForm);
        }

        const images = (req.processedImages || []).map(f => f.path);
        const parsedPrice = (price !== '' && price !== null && price !== undefined) ? parseFloat(price) : null;

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

        const isUnlimited = Setting.getBool(Setting.KEYS.UNLIMITED_LISTINGS_MODE, false);
        const decision = listingPolicy.evaluate({
            role: req.session.userRole,
            rootSlug,
            usedCount: usedQuota,
            isUnlimited
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
            show_phone: req.body.hide_phone ? 0 : 1,
            show_surname: req.body.hide_surname ? 0 : 1
        });

        const status = listingPolicy.initialStatus(req.session.userRole);

        // Opting in turns the ad into a request for offers: registered agents and
        // dealers can then bid on it. Only property and vehicles are eligible, so
        // the flag is ignored elsewhere even if the form is bypassed.
        const collectsBids = Boolean(req.body.collect_bids) && BID_ELIGIBLE_ROOTS.includes(rootSlug);

        const NO_RENT_SLUGS = ['mobilya', 'giyim', 'mobilya-dekorasyon-toptan'];
        let selectedType = req.body.listing_type;
        if (category && NO_RENT_SLUGS.includes(category.slug) && selectedType === 'rent') {
            selectedType = 'sale';
        }

        // Collect and save structured listing attributes (rooms, size, build_year, brand, km, features etc.)
        const attributes = {};
        const directKeys = [
            'rooms', 'size', 'floor', 'build_year', 'buildYear',
            'brand', 'model', 'year', 'km', 'fuel', 'gear', 'condition',
            'body_type', 'engine_power', 'engine_size', 'drivetrain', 'color', 'vehicle_status', 'swap'
        ];
        directKeys.forEach(k => {
            const v = req.body[k] || (req.body.attributes && req.body.attributes[k]);
            if (v !== undefined && v !== null && String(v).trim() !== '') {
                const canonicalKey = (k === 'buildYear') ? 'build_year' : k;
                attributes[canonicalKey] = String(v).trim();
            }
        });

        const rawFeatures = req.body.features || (req.body.attributes && req.body.attributes.features);
        if (rawFeatures) {
            const list = Array.isArray(rawFeatures) ? rawFeatures : [rawFeatures];
            const cleaned = list.filter(f => f && String(f).trim() !== '');
            if (cleaned.length > 0) {
                attributes.features = cleaned.join(',');
            }
        }

        const listing = await Listing.create({
            user_id: req.session.userId,
            category_id,
            title: title.trim(),
            slug: `${generateSlug(title)}-${Date.now().toString(36)}`,
            description: description.trim(),
            price: Number.isFinite(parsedPrice) ? parsedPrice : null,
            currency: ALLOWED_CURRENCIES.includes(currency) ? currency : 'TRY',
            listing_type: collectsBids ? 'bid_request' : (['sale', 'rent', 'wanted', 'job', 'service'].includes(selectedType) ? selectedType : 'sale'),
            city,
            district,
            status,
            is_featured: 1,
            expires_at: listingPolicy.expiresAt(),
            ...listingBadges.fromBody(req.body, rootSlug),
            images,
            attributes,
            // Pay, contract shape and requirements live beside the listing rather
            // than inside it, and only exist for adverts under the jobs tree.
            jobDetails: rootSlug === 'is-ilanlari' ? req.body : null
        });

        // Broadcast targeted notification to matching corporate businesses if user opted in for bids
        if (collectsBids) {
            let targetCorporateType = null;
            if (rootSlug === 'emlak') targetCorporateType = 'real_estate';
            else if (rootSlug === 'vasita') targetCorporateType = 'auto';
            else if (rootSlug === 'usta-hizmetler' || rootSlug === 'ustalar') targetCorporateType = 'service';

            const groupName = rootSlug === 'emlak' ? 'Emlakçılardan' : (rootSlug === 'vasita' ? 'Galericilerden' : 'Kurumsal İşletmelerden');
            try {
                const Notification = require('../models/Notification');
                await Notification.notifyCorporateGroup({
                    corporate_type: targetCorporateType,
                    actor_id: req.session.userId,
                    exclude_user_id: req.session.userId,
                    title: rootSlug === 'emlak' ? 'Yeni Emlak Teklif Talebi 🏡' : (rootSlug === 'vasita' ? 'Yeni Araç Teklif Talebi 🚗' : 'Yeni Teklif Talebi 🤝'),
                    message: `"${listing.title}" ilanı için kullanıcı ${groupName} teklif bekliyor. Hemen teklifinizi sunun!`,
                    link_url: '/teklifler'
                });
            } catch (notifyErr) {
                console.error('Notify corporate group error:', notifyErr);
            }
        }


        if (req.session && req.session.listingFormData) {
            delete req.session.listingFormData;
        }

        req.flash('success', status === 'pending' ? 'flash.listing_pending_review' : 'flash.listing_published');
        res.redirect(status === 'pending' ? '/profile/listings' : `/listings/${listing.slug}`);
    } catch (error) {
        console.error('Listing Create Error:', error);
        await discardProcessedImages(req);
        if (req.session && req.body && typeof req.body === 'object') {
            req.session.listingFormData = { ...req.body };
        }
        req.flash('error', 'flash.listing_create_failed');
        res.redirect(backToForm);
    }
};

const showEdit = async (req, res, next) => {
    try {
        const listing = req.listing;
        const [categories, categoryTree, images, rootSlug, rawAttrs] = await Promise.all([
            Category.getAll(),
            Category.getTree(),
            Listing.getImages(listing.id),
            Category.getRootSlug(listing.category_id),
            Listing.getAttributes(listing.id)
        ]);

        const attrMap = {};
        if (Array.isArray(rawAttrs)) {
            rawAttrs.forEach(a => {
                attrMap[a.attribute_key] = a.attribute_value;
            });
        }
        listing.attributes = attrMap;

        // The draft helper's per-category fields and their labels
        const draftFeatureMap = {};
        const draftFeatureLabels = {};
        Object.keys(listingDraft.FEATURE_LABELS).forEach((rSlug) => {
            draftFeatureMap[rSlug] = listingDraft.featuresFor(rSlug);
            draftFeatureMap[rSlug].forEach((feature) => {
                draftFeatureLabels[feature] = res.locals.t(`draft.features.${feature}`);
            });
        });

        res.locals.meta = res.locals.meta || {};
        res.locals.meta.title = 'İlanı Düzenle';
        res.locals.meta.robots = 'noindex, nofollow';

        res.render('listings/edit', {
            listing,
            categories,
            categoryTree,
            draftFeatureMap,
            draftFeatureLabels,
            images,
            rootSlug,
            currentRootSlug: rootSlug,
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

        const NO_RENT_SLUGS = ['mobilya', 'giyim', 'mobilya-dekorasyon-toptan'];
        let updatedType = req.body.listing_type;
        if (listing.category_slug && NO_RENT_SLUGS.includes(listing.category_slug) && updatedType === 'rent') {
            updatedType = 'sale';
        }

        const updates = {
            title: title.trim(),
            description: description.trim(),
            price: Number.isFinite(parsedPrice) ? parsedPrice : null,
            currency: ALLOWED_CURRENCIES.includes(currency) ? currency : listing.currency,
            listing_type: (updatedType && ['sale', 'rent', 'wanted', 'job', 'service'].includes(updatedType)) ? updatedType : listing.listing_type,
            location_city: cities.isKnown(city) ? city : listing.location_city,
            location_district: district ? district.trim() : null,
            status: nextStatus,
            // Unticking a badge has to clear it, so these are always written —
            // fromBody returns 0 for anything absent from the form.
            ...listingBadges.fromBody(req.body, rootSlug)
        };

        // Reviving an expired listing without a fresh deadline would just let the
        // next expiry sweep bury it again.
        if (nextStatus === 'active' && listing.status === 'expired') {
            updates.expires_at = listingPolicy.expiresAt();
        }

        await Listing.update(listing.id, updates);

        // Update structured attributes
        const attributes = {};
        const directKeys = [
            'rooms', 'size', 'floor', 'build_year', 'buildYear',
            'brand', 'model', 'year', 'km', 'fuel', 'gear', 'condition',
            'body_type', 'engine_power', 'engine_size', 'drivetrain', 'color', 'vehicle_status', 'swap'
        ];
        directKeys.forEach(k => {
            const v = req.body[k] || (req.body.attributes && req.body.attributes[k]);
            if (v !== undefined && v !== null && String(v).trim() !== '') {
                const canonicalKey = (k === 'buildYear') ? 'build_year' : k;
                attributes[canonicalKey] = String(v).trim();
            }
        });

        const rawFeatures = req.body.features || (req.body.attributes && req.body.attributes.features);
        if (rawFeatures) {
            const list = Array.isArray(rawFeatures) ? rawFeatures : [rawFeatures];
            const cleaned = list.filter(f => f && String(f).trim() !== '');
            if (cleaned.length > 0) {
                attributes.features = cleaned.join(',');
            }
        }

        await Listing.setAttributes(listing.id, attributes);

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

        if (result.favorited && listing.user_id && req.session.userId !== listing.user_id) {
            try {
                const Notification = require('../models/Notification');
                const t = res.locals.t || ((k) => k);
                const titleText = t('notifications.favorite_title') !== 'notifications.favorite_title'
                    ? t('notifications.favorite_title')
                    : 'İlanınız Favorilere Eklendi';
                const messageText = t('notifications.favorite_message', { title: listing.title }) !== 'notifications.favorite_message'
                    ? t('notifications.favorite_message', { title: listing.title })
                    : `«${listing.title}» başlıklı ilanınız bir kullanıcı tarafından favorilere eklendi.`;

                await Notification.create({
                    user_id: listing.user_id,
                    actor_id: req.session.userId,
                    type: 'favorite',
                    title: titleText,
                    message: messageText,
                    link_url: `/listings/${listing.slug}`
                });
            } catch (notifyError) {
                console.error('Favorite notification error:', notifyError);
            }
        }

        res.json({ success: true, favorited: result.favorited });
    } catch (error) {
        console.error('Toggle Favorite Error:', error);
        res.status(500).json({ error: res.locals.t('flash.generic_error') });
    }
};

const compare = async (req, res, next) => {
    try {
        let rawIds = req.query.ids;
        let ids = [];
        if (typeof rawIds === 'string') {
            ids = rawIds.split(',').map(s => parseInt(s.trim(), 10)).filter(n => Number.isInteger(n) && n > 0);
        } else if (Array.isArray(rawIds)) {
            ids = rawIds.map(s => parseInt(s, 10)).filter(n => Number.isInteger(n) && n > 0);
        }

        const listings = ids.length > 0 ? await Listing.getCompareListings(ids) : [];

        res.locals.meta = res.locals.meta || {};
        res.locals.meta.title = 'İlan Karşılaştırma | CYPILAN.COM';
        res.locals.meta.robots = 'noindex, nofollow';

        res.render('listings/compare', {
            listings,
            compareIds: ids,
            title: 'İlan Karşılaştırma'
        });
    } catch (error) {
        console.error('Listings Compare Error:', error);
        next(error);
    }
};

const togglePriceAlert = async (req, res) => {
    try {
        if (!req.session || !req.session.userId) {
            return res.status(401).json({ success: false, error: 'Fiyat alarmı kurmak için lütfen giriş yapınız.' });
        }

        const listingId = parseInt(req.params.id, 10);
        if (!Number.isInteger(listingId) || listingId <= 0) {
            return res.status(400).json({ success: false, error: 'Geçersiz ilan ID.' });
        }

        const existing = await PriceAlert.findByPair(req.session.userId, listingId);

        if (existing) {
            await PriceAlert.delete(req.session.userId, listingId);
            return res.json({ success: true, active: false, message: 'Fiyat alarmı kaldırıldı.' });
        } else {
            const targetPrice = req.body.target_price ? parseFloat(req.body.target_price) : null;
            await PriceAlert.create({
                user_id: req.session.userId,
                listing_id: listingId,
                target_price: Number.isFinite(targetPrice) ? targetPrice : null
            });
            return res.json({ success: true, active: true, message: 'Fiyat alarmı kuruldu! Fiyat düştüğünde size bildireceğiz.' });
        }
    } catch (error) {
        console.error('Toggle Price Alert Error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
};

const quickOffer = async (req, res) => {
    try {
        if (!req.session || !req.session.userId) {
            if (req.xhr || (req.headers.accept && req.headers.accept.includes('json'))) {
                return res.status(401).json({ success: false, error: 'Teklif vermek için lütfen giriş yapınız.' });
            }
            req.flash('error', 'flash.login_required');
            return res.redirect('/auth/login');
        }

        const listingId = parseInt(req.params.id, 10);
        const amount = parseFloat(req.body.amount);
        const message = String(req.body.message || '').trim();

        if (!Number.isFinite(amount) || amount <= 0) {
            if (req.xhr || (req.headers.accept && req.headers.accept.includes('json'))) {
                return res.status(400).json({ success: false, error: 'Lütfen geçerli bir teklif tutarı giriniz.' });
            }
            req.flash('error', 'flash.bid_amount_required');
            return res.redirect(req.get('referer') || '/listings');
        }

        const listing = await Listing.findById(listingId);
        if (!listing || listing.status !== 'active') {
            if (req.xhr || (req.headers.accept && req.headers.accept.includes('json'))) {
                return res.status(404).json({ success: false, error: 'İlan bulunamadı veya yayında değil.' });
            }
            req.flash('error', 'flash.listing_not_found');
            return res.redirect('/listings');
        }

        if (listing.user_id === req.session.userId) {
            if (req.xhr || (req.headers.accept && req.headers.accept.includes('json'))) {
                return res.status(400).json({ success: false, error: 'Kendi ilanınıza teklif veremezsiniz.' });
            }
            req.flash('error', 'flash.bid_cannot_bid_own');
            return res.redirect(req.get('referer') || '/listings');
        }

        await Bid.submitQuickOffer({
            listing_id: listingId,
            bidder_id: req.session.userId,
            amount,
            currency: req.body.currency || listing.currency || 'TRY',
            message: message || null
        });

        if (req.xhr || (req.headers.accept && req.headers.accept.includes('json'))) {
            return res.json({ success: true, message: 'Pazarlık teklifiniz satıcıya başarıyla iletildi!' });
        }

        req.flash('success', 'flash.bid_sent');
        return res.redirect(`/listings/${listing.slug}`);
    } catch (error) {
        console.error('Quick Offer Error:', error);
        if (req.xhr || (req.headers.accept && req.headers.accept.includes('json'))) {
            return res.status(500).json({ success: false, error: error.message });
        }
        req.flash('error', 'Teklif gönderilirken bir hata oluştu.');
        return res.redirect(req.get('referer') || '/listings');
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
    toggleFavorite,
    compare,
    togglePriceAlert,
    quickOffer
};
