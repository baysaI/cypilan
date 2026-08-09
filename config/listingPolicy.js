const FREE_LISTING_QUOTA = 3;

const QUOTA_CATEGORIES = ['emlak', 'vasita', 'ikinci-el'];
const ALWAYS_FREE_CATEGORIES = ['usta-hizmetler', 'is-ilanlari'];

const PAID_TIERS_LIVE = false;

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

const evaluate = ({ role, rootSlug, usedCount }) => {
  if (role === 'admin') {
    return { allowed: true, free: true, remaining: null, reason: null };
  }

  if (isAlwaysFree(rootSlug)) {
    return { allowed: true, free: true, remaining: null, reason: null };
  }

  if (!usesQuota(rootSlug)) {
    return { allowed: true, free: true, remaining: null, reason: null };
  }

  const remaining = Math.max(0, FREE_LISTING_QUOTA - usedCount);

  if (remaining > 0) {
    return { allowed: true, free: true, remaining, reason: null };
  }

  if (PAID_TIERS_LIVE) {
    return { allowed: false, free: false, remaining: 0, reason: 'package_required' };
  }

  return { allowed: false, free: false, remaining: 0, reason: 'packages_coming_soon' };
};

module.exports = {
  FREE_LISTING_QUOTA,
  QUOTA_CATEGORIES,
  ALWAYS_FREE_CATEGORIES,
  PAID_TIERS_LIVE,
  PACKAGES,
  requiresPhotos,
  requiresPrice,
  isAlwaysFree,
  usesQuota,
  evaluate
};
