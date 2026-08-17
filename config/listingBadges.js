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

const BADGES = [
  {
    key: 'urgent',
    column: 'is_urgent',
    icon: 'fa-bolt',
    variant: 'danger',
    requiresPrice: false
  },
  {
    key: 'opportunity',
    column: 'is_opportunity',
    icon: 'fa-tags',
    variant: 'success',
    requiresPrice: false
  },
  {
    key: 'negotiable',
    column: 'is_negotiable',
    icon: 'fa-comments-dollar',
    variant: 'primary',
    // "Negotiable" is a claim about a number, so it is only shown where there is
    // one. A job advert with no salary has nothing to haggle over, and the badge
    // would read as noise rather than an invitation.
    requiresPrice: true
  },
  {
    key: 'swap',
    column: 'is_swap',
    icon: 'fa-arrows-rotate',
    variant: 'warning',
    requiresPrice: false,
    // "Takaslı / Takasa Uygun" makes sense for vehicles, electronics & second-hand items,
    // but not for property (emlak) or jobs (is-ilanlari)
    excludedRoots: ['emlak', 'is-ilanlari', 'usta-hizmetler', 'kurumsal-tedarikci']
  }
];

const KEYS = BADGES.map((badge) => badge.key);
const COLUMNS = BADGES.map((badge) => badge.column);

const byKey = (key) => BADGES.find((badge) => badge.key === key) || null;

const isKnownKey = (key) => KEYS.includes(key);

// Form body → column values. Only the keys on the list above are read, so a
// hand-made POST cannot reach is_premium or is_featured through this door.
const fromBody = (body = {}) => BADGES.reduce((values, badge) => {
  values[badge.column] = body[`badge_${badge.key}`] ? 1 : 0;
  return values;
}, {});

// Which badges a listing actually carries, in display order.
const activeFor = (listing = {}) => BADGES.filter((badge) => {
  if (Number(listing[badge.column]) !== 1) return false;
  if (badge.requiresPrice && !(Number(listing.price) > 0)) return false;
  return true;
});

// Whether anything is ticked, so a form can be reasoned about without knowing
// the column names.
const anyActive = (listing = {}) => activeFor(listing).length > 0;

module.exports = {
  BADGES,
  KEYS,
  COLUMNS,
  byKey,
  isKnownKey,
  fromBody,
  activeFor,
  anyActive
};
