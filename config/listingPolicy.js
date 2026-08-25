const FREE_LISTING_QUOTA = 3;

const QUOTA_CATEGORIES = ['emlak', 'vasita', 'ikinci-el'];
const ALWAYS_FREE_CATEGORIES = ['usta-hizmetler', 'is-ilanlari', 'kurumsal-tedarikci'];

// A photo is required outside the quota categories too: a pallet of tiles or a
// bag of cement is bought on the look of the goods, and a supplier listing with
// no picture is a phone number pretending to be a product.
const PHOTO_REQUIRED_CATEGORIES = [...QUOTA_CATEGORIES, 'kurumsal-tedarikci'];

// Where a professional's stock is what the visitor came for, so business and
// agent accounts lead the results. Everything below that is still ordered the way
// the visitor asked — this promotes corporate listings, it does not hide others.
const CORPORATE_FIRST_CATEGORIES = ['kurumsal-tedarikci'];

// Kabul edilen bir teklif ilani "cozer" mu?
//
// Bir daire ya da araba tek aliciya gidiyor: sahibi birini sectiginde oteki
// teklifler gecerliligini yitiriyor ve onlari bekletmek, cevap bekleyen
// insanlari bosuna oyalamak olurdu.
//
// Bir usta hizmeti, tedarikci ilani ya da is ilani boyle degil: ilk isi
// almak ikincisini reddetmeyi gerektirmiyor. O kategorilerde oteki teklifler
// bekleyen kaliyor ve karari ilan sahibi tek tek veriyor.
const EXCLUSIVE_SALE_ROOTS = ['emlak', 'vasita', 'ikinci-el'];

const isExclusiveSale = (rootSlug) => EXCLUSIVE_SALE_ROOTS.includes(rootSlug);

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

const requiresPhotos = (rootSlug) => PHOTO_REQUIRED_CATEGORIES.includes(rootSlug);

// A supplier quoting per tonne, per pallet or on request cannot put one number in
// the box, so the wholesale tree is left out on purpose.
const requiresPrice = (rootSlug) => QUOTA_CATEGORIES.includes(rootSlug);

const isCorporateFirst = (rootSlug) => CORPORATE_FIRST_CATEGORIES.includes(rootSlug);

const isAlwaysFree = (rootSlug) => ALWAYS_FREE_CATEGORIES.includes(rootSlug);

const usesQuota = (rootSlug) => QUOTA_CATEGORIES.includes(rootSlug);

const isCorporateRole = (role) => role === 'business' || role === 'agent' || role === 'admin';

// Vitrin siralamasi yayin tarihine gore isliyordu, yani bir ilan yeni ilanlar
// geldikce asagi kayiyor ve yirmi dorduncu siradan sonra vitrinden tamamen
// dusuyordu. Firlatma, uyeye ilanini haftada bir kez tepeye tasima hakki
// veriyor.
//
// Ucretsiz ve bilerek oyle: odeme altyapisi bagli degil ve fiyat sayfasinda
// ucretli denen bir seyi elle onaylamak, onu bedava vermek olurdu.
//
// Hak yuvarlanan yedi gun uzerinden sayiliyor, takvim haftasi uzerinden
// degil: pazartesi sabahi herkesin hakkinin ayni anda yenilenmesi hem
// vitrini o saatte doldurur hem de cuma firlatani cezalandirirdi.
const WEEKLY_BOOST_QUOTA = 1;
const WEEKLY_BOOST_QUOTA_CORPORATE = 3;
const BOOST_WINDOW_DAYS = 7;

const boostQuotaFor = (role) => (isCorporateRole(role) ? WEEKLY_BOOST_QUOTA_CORPORATE : WEEKLY_BOOST_QUOTA);

const evaluate = ({ role, rootSlug, usedCount, isUnlimited = false }) => {
  const unlimited = Boolean(isUnlimited) || isCorporateRole(role);
  if (unlimited) {
    return { allowed: true, free: true, remaining: null, isUnlimited: true, reason: null };
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
  PHOTO_REQUIRED_CATEGORIES,
  CORPORATE_FIRST_CATEGORIES,
  EXCLUSIVE_SALE_ROOTS,
  isExclusiveSale,
  WEEKLY_BOOST_QUOTA,
  WEEKLY_BOOST_QUOTA_CORPORATE,
  BOOST_WINDOW_DAYS,
  boostQuotaFor,
  isCorporateFirst,
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
  isCorporateRole,
  evaluate
};
