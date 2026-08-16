const FREE_LISTING_QUOTA = 3;

const QUOTA_CATEGORIES = ['emlak', 'vasita', 'ikinci-el'];
const ALWAYS_FREE_CATEGORIES = ['usta-hizmetler', 'is-ilanlari'];

const PAID_TIERS_LIVE = false;

// Featuring a listing is a paid tier, so it is offered only when the paid tiers
// are. With no payment provider wired up, approving a promotion by hand would
// mean granting for free what the pricing page says costs money — so the request
// is not offered at all rather than being offered and quietly ignored.
const PROMOTION_REQUESTS_LIVE = PAID_TIERS_LIVE;

// Off by default, so behaviour does not change silently: listings go live at
// once, as they do today. Turn it on to route new listings through the admin
// queue that /admin/listings?status=pending already renders.
const REQUIRE_APPROVAL = process.env.LISTING_REQUIRE_APPROVAL === 'true';

const LISTING_LIFETIME_DAYS = parseInt(process.env.LISTING_LIFETIME_DAYS, 10) > 0
  ? parseInt(process.env.LISTING_LIFETIME_DAYS, 10)
  : 90;

const initialStatus = (role) => (REQUIRE_APPROVAL && role !== 'admin') ? 'pending' : 'active';

// SQLite's own datetime format, so comparisons against datetime('now') are
// plain string comparisons that actually order correctly.
const expiresAt = (from = Date.now()) => {
  const at = new Date(from + LISTING_LIFETIME_DAYS * 24 * 60 * 60 * 1000);
  return at.toISOString().slice(0, 19).replace('T', ' ');
};

const PACKAGES = [
  {
    key: 'standart',
    name: 'Standart',
    stars: 1,
    summary: 'Normal listeleme, temel görünürlük'
  },
  {
    key: 'plus',
    name: 'Plus',
    stars: 2,
    summary: 'Öne çıkan sıralama, daha fazla görüntülenme'
  },
  {
    key: 'premium',
    name: 'Premium',
    stars: 3,
    summary: 'En üst sırada vurgu, en hızlı satış şansı',
    highlighted: true
  }
];

const requiresPhotos = (rootSlug) => QUOTA_CATEGORIES.includes(rootSlug);

const requiresPrice = (rootSlug) => QUOTA_CATEGORIES.includes(rootSlug);

const isAlwaysFree = (rootSlug) => ALWAYS_FREE_CATEGORIES.includes(rootSlug);

const usesQuota = (rootSlug) => QUOTA_CATEGORIES.includes(rootSlug);

const evaluate = ({ role, rootSlug, usedCount, isUnlimited = false }) => {
  if (role === 'admin' || isUnlimited) {
    return { allowed: true, free: true, remaining: null, isUnlimited: Boolean(isUnlimited), reason: null };
  }

  if (isAlwaysFree(rootSlug)) {
    return { allowed: true, free: true, remaining: null, isUnlimited: false, reason: null };
  }

  if (!usesQuota(rootSlug)) {
    return { allowed: true, free: true, remaining: null, isUnlimited: false, reason: null };
  }

  const remaining = Math.max(0, FREE_LISTING_QUOTA - usedCount);

  if (remaining > 0) {
    return { allowed: true, free: true, remaining, isUnlimited: false, reason: null };
  }

  if (PAID_TIERS_LIVE) {
    return { allowed: false, free: false, remaining: 0, isUnlimited: false, reason: 'package_required' };
  }

  return { allowed: false, free: false, remaining: 0, isUnlimited: false, reason: 'packages_coming_soon' };
};

module.exports = {
  FREE_LISTING_QUOTA,
  QUOTA_CATEGORIES,
  ALWAYS_FREE_CATEGORIES,
  PAID_TIERS_LIVE,
  PROMOTION_REQUESTS_LIVE,
  REQUIRE_APPROVAL,
  LISTING_LIFETIME_DAYS,
  PACKAGES,
  initialStatus,
  expiresAt,
  requiresPhotos,
  requiresPrice,
  isAlwaysFree,
  usesQuota,
  evaluate
};
