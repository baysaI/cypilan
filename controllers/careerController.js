const Career = require('../models/Career');
const Listing = require('../models/Listing');
const Category = require('../models/Category');
const Message = require('../models/Message');
const cities = require('../config/cities');

const MAX_COVER_LETTER = 1500;

const isJobListing = async (listing) => {
    if (!listing) return false;
    const rootSlug = await Category.getRootSlug(listing.category_id);
    return rootSlug === 'is-ilanlari';
};

// ---- Candidate side ---------------------------------------------------------

const editProfile = async (req, res, next) => {
    try {
        const profile = await Career.getProfile(req.session.userId);

        res.locals.meta = res.locals.meta || {};
        res.locals.meta.title = res.locals.t('career.my_cv');
        res.locals.meta.robots = 'noindex, nofollow';

        res.render('career/profile', {
            profile,
            completeness: Career.profileCompleteness(profile),
            workTypes: Career.WORK_TYPES,
            cityNames: cities.names(),
            title: res.locals.t('career.my_cv')
        });
    } catch (error) {
        console.error('CV Edit Error:', error);
        next(error);
    }
};

const saveProfile = async (req, res) => {
    try {
        const headline = String(req.body.headline || '').trim();

        if (!headline) {
            req.flash('error', 'flash.cv_headline_required');
            return res.redirect('/kariyer/cv');
        }

        await Career.saveProfile(req.session.userId, {
            headline: headline.slice(0, 120),
            summary: String(req.body.summary || '').trim().slice(0, 2000),
            experience_years: req.body.experience_years,
            education: String(req.body.education || '').trim().slice(0, 1000),
            skills: String(req.body.skills || '').trim().slice(0, 600),
            languages: String(req.body.languages || '').trim().slice(0, 300),
            certificates: String(req.body.certificates || '').trim().slice(0, 800),
            preferred_city: cities.isKnown(req.body.preferred_city) ? req.body.preferred_city : null,
            preferred_work_type: req.body.preferred_work_type,
            is_open_to_work: Boolean(req.body.is_open_to_work),
            is_public: Boolean(req.body.is_public)
        });

        req.flash('success', 'flash.cv_saved');
        res.redirect('/kariyer/cv');
    } catch (error) {
        console.error('CV Save Error:', error);
        req.flash('error', 'flash.cv_save_failed');
        res.redirect('/kariyer/cv');
    }
};

// Openings ordered by how well they fit the visitor's CV. Without a CV the page
// still works — it just falls back to newest first and says why.
const openings = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page, 10) || 1;
        const filters = { city: req.query.city, workType: req.query.workType };

        const [result, profile] = await Promise.all([
            Career.openings(filters, page, 20),
            req.session && req.session.userId ? Career.getProfile(req.session.userId) : null
        ]);

        const ranked = profile ? Career.rankOpenings(result.data, profile) : result.data;

        let appliedListingIds = [];
        if (req.session && req.session.userId) {
            const applications = await Career.applicationsForApplicant(req.session.userId);
            appliedListingIds = applications
                .filter((application) => application.status !== 'withdrawn')
                .map((application) => application.listing_id);
        }

        res.locals.meta = res.locals.meta || {};
        res.locals.meta.title = res.locals.t('career.openings');

        res.render('career/openings', {
            openings: ranked,
            pagination: { currentPage: page, totalPages: result.pages, totalItems: result.total },
            filters,
            profile,
            profileReady: Career.isProfileReady(profile),
            appliedListingIds,
            workTypes: Career.WORK_TYPES,
            title: res.locals.t('career.openings')
        });
    } catch (error) {
        console.error('Openings Error:', error);
        next(error);
    }
};

const apply = async (req, res) => {
    const backTo = req.get('referer') || '/kariyer';

    try {
        const listingId = parseInt(req.params.listingId, 10);
        if (!Number.isInteger(listingId)) {
            req.flash('error', 'flash.listing_not_found');
            return res.redirect('/kariyer');
        }

        const listing = await Listing.findById(listingId);
        if (!listing || listing.status !== 'active' || !(await isJobListing(listing))) {
            req.flash('error', 'flash.job_not_open');
            return res.redirect('/kariyer');
        }

        if (listing.user_id === req.session.userId) {
            req.flash('error', 'flash.cannot_apply_own_job');
            return res.redirect(backTo);
        }

        // This is what makes one-click apply possible at all: the CV is the
        // application, so it has to say something before it can be sent.
        const profile = await Career.getProfile(req.session.userId);
        if (!Career.isProfileReady(profile)) {
            req.flash('error', 'flash.cv_incomplete');
            return res.redirect('/kariyer/cv');
        }

        const existing = await Career.findApplication(listingId, req.session.userId);

        await Career.apply({
            listing_id: listingId,
            applicant_id: req.session.userId,
            cover_letter: String(req.body.cover_letter || '').trim().slice(0, MAX_COVER_LETTER) || null
        });

        if (!existing) {
            try {
                await Message.create({
                    sender_id: req.session.userId,
                    receiver_id: listing.user_id,
                    listing_id: listingId,
                    content: res.locals.t('career.notify_employer', { title: listing.title })
                });
            } catch (notifyError) {
                console.error('Application notification failed:', notifyError);
            }
        }

        req.flash('success', existing ? 'flash.application_updated' : 'flash.application_sent');
        res.redirect('/kariyer/basvurularim');
    } catch (error) {
        console.error('Apply Error:', error);
        req.flash('error', 'flash.application_failed');
        res.redirect(backTo);
    }
};

const myApplications = async (req, res, next) => {
    try {
        const applications = await Career.applicationsForApplicant(req.session.userId);
        const profile = await Career.getProfile(req.session.userId);

        res.locals.meta = res.locals.meta || {};
        res.locals.meta.title = res.locals.t('career.my_applications');
        res.locals.meta.robots = 'noindex, nofollow';

        res.render('career/applications', {
            applications,
            completeness: Career.profileCompleteness(profile),
            title: res.locals.t('career.my_applications')
        });
    } catch (error) {
        console.error('My Applications Error:', error);
        next(error);
    }
};

const withdraw = async (req, res) => {
    try {
        const applicationId = parseInt(req.params.id, 10);
        const done = Number.isInteger(applicationId)
            && await Career.withdraw(applicationId, req.session.userId);

        req.flash(done ? 'success' : 'error', done ? 'flash.application_withdrawn' : 'flash.application_not_found');
        res.redirect('/kariyer/basvurularim');
    } catch (error) {
        console.error('Withdraw Application Error:', error);
        req.flash('error', 'flash.application_failed');
        res.redirect('/kariyer/basvurularim');
    }
};

// ---- Employer side ----------------------------------------------------------

const employerPanel = async (req, res, next) => {
    try {
        const applications = await Career.applicationsForEmployer(req.session.userId);

        // Grouped per advert so an employer reads one shortlist at a time.
        const groups = [];
        const indexBySlug = new Map();

        applications.forEach((application) => {
            if (!indexBySlug.has(application.listing_slug)) {
                indexBySlug.set(application.listing_slug, groups.length);
                groups.push({
                    listingTitle: application.listing_title,
                    listingSlug: application.listing_slug,
                    listingStatus: application.listing_status,
                    applications: []
                });
            }
            groups[indexBySlug.get(application.listing_slug)].applications.push(application);
        });

        res.locals.meta = res.locals.meta || {};
        res.locals.meta.title = res.locals.t('career.employer_panel');
        res.locals.meta.robots = 'noindex, nofollow';

        res.render('career/employer', {
            groups,
            statuses: Career.APPLICATION_STATUSES.filter((status) => status !== 'withdrawn'),
            title: res.locals.t('career.employer_panel')
        });
    } catch (error) {
        console.error('Employer Panel Error:', error);
        next(error);
    }
};

const setApplicationStatus = async (req, res) => {
    try {
        const applicationId = parseInt(req.params.id, 10);
        const done = Number.isInteger(applicationId)
            && await Career.setStatus(applicationId, req.session.userId, req.body.status);

        req.flash(done ? 'success' : 'error', done ? 'flash.application_status_updated' : 'flash.application_not_found');
        res.redirect('/kariyer/basvurular');
    } catch (error) {
        console.error('Application Status Error:', error);
        req.flash('error', 'flash.application_failed');
        res.redirect('/kariyer/basvurular');
    }
};

module.exports = {
    editProfile,
    saveProfile,
    openings,
    apply,
    myApplications,
    withdraw,
    employerPanel,
    setApplicationStatus,
    MAX_COVER_LETTER
};
