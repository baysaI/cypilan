// The attention flags a seller sets on their own listing: "Acil Satılık",
// "Fırsat Ürünü", "Pazarlıklı".
//
// Kept apart from is_premium and is_featured on purpose. Those are paid tiers a
// seller cannot grant themselves; these are free, self-declared and unverified,
// and the difference has to stay visible in the code or somebody will eventually
// treat a ticked checkbox as a purchase.
//
// Deliberately NOT part of the default sort order. A flag anyone can tick stops
// meaning anything the moment ticking it moves you up the page — every listing
// becomes urgent and the visitor learns to ignore the colour. They earn their
// attention two honest ways instead: they are loud on the card, and they are
// filterable, so somebody who came for the deals asks for them by name.
//
// One place decides what a badge is, because five places render one.

const EXCLUDED_ROOTS = ['is-ilanlari', 'usta-hizmetler', 'ustalar'];

const BADGES = [
  {
    key: 'urgent',
    column: 'is_urgent',
    icon: 'fa-bolt',
    variant: 'danger',
    requiresPrice: false,
    excludedRoots: EXCLUDED_ROOTS
  },
  {
    key: 'opportunity',
    column: 'is_opportunity',
    icon: 'fa-tags',
    variant: 'success',
    requiresPrice: false,
    excludedRoots: EXCLUDED_ROOTS
  },
  {
    key: 'negotiable',
    column: 'is_negotiable',
    icon: 'fa-comments-dollar',
    variant: 'primary',
    // "Negotiable" is a claim about a number, so it is only shown where there is
    // one. A job advert with no salary has nothing to haggle over, and the badge
    // would read as noise rather than an invitation.
    requiresPrice: true,
    excludedRoots: EXCLUDED_ROOTS
  }
];

const KEYS = BADGES.map((badge) => badge.key);
const COLUMNS = BADGES.map((badge) => badge.column);

const byKey = (key) => BADGES.find((badge) => badge.key === key) || null;

const isKnownKey = (key) => KEYS.includes(key);

const isExcludedCategory = (root) => {
  if (!root) return false;
  const normalized = String(root).toLowerCase().trim();
  return EXCLUDED_ROOTS.some(ex => normalized === ex || normalized.startsWith(ex + '-'));
};

// Form body → column values. Only the keys on the list above are read, so a
// hand-made POST cannot reach is_premium or is_featured through this door.
// Excluded categories (jobs, services) never receive commercial attention badges.
const fromBody = (body = {}, categoryRoot = null) => {
  const isExcluded = categoryRoot && isExcludedCategory(categoryRoot);
  return BADGES.reduce((values, badge) => {
    values[badge.column] = (!isExcluded && body[`badge_${badge.key}`]) ? 1 : 0;
    return values;
  }, {});
};

// Which badges a listing actually carries, in display order.
const activeFor = (listing = {}) => {
  const root = String(listing.root_slug || listing.rootCategory || listing.category_slug || listing.categorySlug || '').toLowerCase().trim();
  if (isExcludedCategory(root) || listing.listing_type === 'job' || listing.listing_type === 'service') {
    return [];
  }
  if (listing.category_id === 3 || listing.category_id === 4 || (listing.category_id >= 300 && listing.category_id < 500)) {
    return [];
  }

  return BADGES.filter((badge) => {
    if (Number(listing[badge.column]) !== 1) return false;
    if (badge.requiresPrice && !(Number(listing.price) > 0)) return false;
    if (badge.excludedRoots && isExcludedCategory(root)) return false;
    return true;
  });
};

// Whether anything is ticked, so a form can be reasoned about without knowing
// the column names.
const anyActive = (listing = {}) => activeFor(listing).length > 0;

module.exports = {
  BADGES,
  KEYS,
  COLUMNS,
  EXCLUDED_ROOTS,
  byKey,
  isKnownKey,
  isExcludedCategory,
  fromBody,
  activeFor,
  anyActive
};
