// The titles an admin can award to a member: "Onaylı Satıcı", "Ayın Emlakçısı".
//
// Not to be confused with config/listingBadges.js. Those are flags a seller
// ticks on their own listing and nobody verifies; these are the opposite —
// only an admin can grant one, and that is the whole reason a visitor should
// believe it. Keeping the two files apart keeps that difference visible in the
// code, so nobody later wires a self-service checkbox into this list.
//
// One place decides what a badge is, because four places render one: the public
// profile, the seller box on a listing, the admin grant screen and the
// notification the member receives.
//
// Two kinds live here. Verification badges state something that stays true
// until it stops being true, so they do not expire. Monthly titles are a
// competition result and have to expire on their own: "Ayın Emlakçısı" left
// standing for a year is worse than no badge, because the second month's winner
// finds the title already taken and the visitor learns it means nothing. The
// admin can still override the date on the grant screen.

const BADGES = [
  // --- Doğrulama rozetleri (kalıcı) ---
  { key: 'verified_seller', icon: 'fa-circle-check', variant: 'success', defaultDays: null },
  { key: 'verified_corporate', icon: 'fa-building-circle-check', variant: 'primary', defaultDays: null },
  { key: 'verified_agent', icon: 'fa-house-circle-check', variant: 'info', defaultDays: null },
  { key: 'verified_dealer', icon: 'fa-car-side', variant: 'info', defaultDays: null },
  { key: 'verified_master', icon: 'fa-screwdriver-wrench', variant: 'secondary', defaultDays: null },
  { key: 'trusted_member', icon: 'fa-handshake', variant: 'success', defaultDays: null },
  { key: 'founding_member', icon: 'fa-seedling', variant: 'dark', defaultDays: null },

  // --- Dönemsel unvanlar (kendiliğinden düşer) ---
  { key: 'agent_of_month', icon: 'fa-crown', variant: 'warning', defaultDays: 30 },
  { key: 'dealer_of_month', icon: 'fa-crown', variant: 'warning', defaultDays: 30 },
  { key: 'master_of_month', icon: 'fa-crown', variant: 'warning', defaultDays: 30 },
  { key: 'seller_of_month', icon: 'fa-crown', variant: 'warning', defaultDays: 30 },
  { key: 'top_rated', icon: 'fa-star', variant: 'warning', defaultDays: 90 }
];

const BY_KEY = new Map(BADGES.map((badge) => [badge.key, badge]));

const isKnownKey = (key) => BY_KEY.has(key);

const byKey = (key) => BY_KEY.get(key) || null;

// A badge nobody defined any more — an old row left behind after this list was
// edited — renders as a neutral pill rather than crashing the profile page.
const describe = (key) => byKey(key) || { key, icon: 'fa-award', variant: 'secondary', defaultDays: null };

// The date a freshly granted badge should fall off, as the 'YYYY-MM-DD HH:MM:SS'
// text SQLite compares as a string elsewhere in this schema.
const defaultExpiry = (key, now = new Date()) => {
  const badge = byKey(key);
  if (!badge || !badge.defaultDays) return null;

  const end = new Date(now.getTime() + badge.defaultDays * 24 * 60 * 60 * 1000);
  return end.toISOString().slice(0, 19).replace('T', ' ');
};

const translationKey = (key) => `badges.${key}`;

module.exports = {
  BADGES,
  isKnownKey,
  byKey,
  describe,
  defaultExpiry,
  translationKey
};
