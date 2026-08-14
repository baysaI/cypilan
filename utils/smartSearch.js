// Turns a sentence a visitor would actually type — "Girne'de 2 milyona kadar
// 3+1 kiralık daire" — into the filters the listing query already understands,
// then ranks what comes back.
//
// This is deliberately a parser and a scoring function rather than a call to a
// language model: the vocabulary of a classifieds search is small and closed
// (five cities, five category trees, prices, room counts, rent or sale), the
// answer has to come back inside a page render, and a deterministic result is
// one we can test. A model would cost money per search, add latency, and could
// still return a city that does not exist.

const CITY_TERMS = {
  'Lefkoşa': ['lefkosa', 'lefkoşa', 'nicosia', 'λευκωσια', 'никосия', 'лефкоша', 'نیکوزیا'],
  'Girne': ['girne', 'kyrenia', 'κερυνεια', 'кирения', 'гирне', 'گیرنه'],
  'Gazimağusa': ['gazimagusa', 'gazimağusa', 'magusa', 'mağusa', 'famagusta', 'αμμοχωστος', 'фамагуста', 'газимагуса', 'فاماگوستا'],
  'İskele': ['iskele', 'i̇skele', 'trikomo', 'τρικωμο', 'искеле', 'اسکله'],
  'Güzelyurt': ['guzelyurt', 'güzelyurt', 'morfou', 'μορφου', 'гюзельюрт', 'گوزل‌یورت'],
  'Larnaka': ['larnaka', 'larnaca', 'λαρνακα', 'ларнака', 'لارناکا'],
  'Limasol': ['limasol', 'limassol', 'λεμεσος', 'лимасол', 'لیماسول'],
  'Baf': ['baf', 'paphos', 'pafos', 'παφος', 'пафос', 'پافوس']
};

// Category slugs the parser can reach. Root slugs are matched too, so "ev" or
// "araba" narrows to the whole tree when no subcategory is named.
const CATEGORY_TERMS = {
  'satilik-daire': ['satilik daire', 'satılık daire', 'apartment for sale', 'daire satilik'],
  'kiralik-daire': ['kiralik daire', 'kiralık daire', 'apartment for rent', 'daire kiralik'],
  'satilik-villa': ['satilik villa', 'satılık villa', 'villa for sale'],
  'kiralik-villa': ['kiralik villa', 'kiralık villa', 'villa for rent'],
  'satilik-isyeri': ['satilik isyeri', 'satılık işyeri', 'commercial for sale', 'dukkan satilik'],
  'kiralik-isyeri': ['kiralik isyeri', 'kiralık işyeri', 'commercial for rent', 'dukkan kiralik'],
  'arsa': ['arsa', 'land', 'plot', 'tarla', 'οικοπεδο', 'участок', 'زمین'],
  'otomobil': ['otomobil', 'araba', 'binek', 'car', 'cars', 'αυτοκινητο', 'автомобиль', 'خودرو'],
  'suv-arazi': ['suv', 'arazi araci', 'arazi aracı', 'jeep', 'off road', 'off-road', 'внедорожник'],
  'pickup': ['pickup', 'pick up', 'kamyonet', 'пикап', 'وانت'],
  'motosiklet': ['motosiklet', 'motor', 'motorcycle', 'мотоцикл', 'موتورسیکلت'],
  'ticari-araclar': ['ticari arac', 'ticari araç', 'commercial vehicle', 'minibus', 'kamyon'],
  'elektronik': ['elektronik', 'electronics', 'telefon', 'laptop', 'bilgisayar', 'электроника'],
  'mobilya': ['mobilya', 'furniture', 'koltuk', 'yatak', 'мебель', 'مبلمان'],
  'giyim': ['giyim', 'clothing', 'kiyafet', 'kıyafet', 'одежда', 'پوشاک'],
  'temizlik': ['temizlik', 'cleaning', 'temizlikci', 'temizlikçi', 'уборка'],
  'tadilat-dekorasyon': ['tadilat', 'dekorasyon', 'renovation', 'boyaci', 'boyacı', 'tamirat'],
  'nakliyat': ['nakliyat', 'nakliye', 'removals', 'tasima', 'taşıma', 'перевозки'],
  'tam-zamanli': ['tam zamanli', 'tam zamanlı', 'full time', 'full-time'],
  'yari-zamanli': ['yari zamanli', 'yarı zamanlı', 'part time', 'part-time'],
  // Bare nouns land on the root category: "daire" alone does not say whether the
  // visitor wants to buy or rent, so narrowing to a leaf would guess wrong half
  // the time. The rent/sale hint below refines it when the sentence says so.
  'emlak': ['emlak', 'ev', 'konut', 'daire', 'villa', 'isyeri', 'işyeri', 'dukkan', 'dükkan', 'apartment', 'flat', 'property', 'real estate', 'house', 'ακινητα', 'недвижимость', 'املاک'],
  'vasita': ['vasita', 'vasıta', 'arac', 'araç', 'vehicle', 'οχηματα', 'транспорт'],
  'ikinci-el': ['ikinci el', 'second hand', 'used', 'μεταχειρισμενα', 'б/у'],
  'usta-hizmetler': ['usta', 'hizmet', 'trades', 'services', 'υπηρεσιες', 'услуги'],
  'is-ilanlari': ['is ilani', 'iş ilanı', 'is ilanlari', 'iş ilanları', 'job', 'jobs', 'vacancy', 'работа']
};

// Words that put a number on one side of a range or the other.
const MAX_HINTS = ['kadar', 'altinda', 'altında', 'alti', 'altı', 'asagi', 'aşağı', 'maks', 'max', 'maksimum', 'en fazla', 'under', 'below', 'up to', 'less than', 'до', 'حداکثر'];
const MIN_HINTS = ['uzeri', 'üzeri', 'ustu', 'üstü', 'yukari', 'yukarı', 'min', 'minimum', 'en az', 'above', 'over', 'from', 'at least', 'от', 'حداقل'];

// Filler that survives filter extraction and would otherwise be searched for.
const STOPWORDS = new Set([
  'ile', 'arasi', 'arasinda', 'ariyorum', 'ariyoruz', 'istiyorum', 'lazim', 'gerek',
  'olan', 'olsun', 'icin', 'bir', 'bana', 'bize', 'var', 'yok', 'acil', 'uygun',
  'and', 'the', 'for', 'with', 'want', 'need', 'looking', 'searching', 'please'
]);

const RENT_HINTS = ['kiralik', 'kiralık', 'kira', 'rent', 'rental', 'to let', 'ενοικιαση', 'аренда', 'اجاره'];
const SALE_HINTS = ['satilik', 'satılık', 'satis', 'satış', 'for sale', 'πωληση', 'продажа', 'فروش'];

const GBP_HINTS = ['sterlin', 'stg', 'gbp', 'pound', '£'];
const TRY_HINTS = ['tl', 'try', 'lira', '₺'];

// Turkish/English magnitude words, so "2 milyon" and "500k" both land as numbers.
const MAGNITUDES = [
  { terms: ['milyar', 'billion', 'b'], factor: 1e9 },
  { terms: ['milyon', 'million', 'mio', 'm'], factor: 1e6 },
  { terms: ['bin', 'thousand', 'k'], factor: 1e3 }
];

// Turkish lowercasing: a plain toLowerCase turns "İ" into "i̇" (i + combining
// dot), which then fails every comparison against a plain "i".
const normalise = (value) => String(value || '')
  .replace(/İ/g, 'i')
  .replace(/I/g, 'ı')
  .toLowerCase()
  .replace(/[̇]/g, '')
  .trim();

// Accent-folded copy used only for matching, so "Gazimağusa" and "gazimagusa"
// both hit the same city.
const fold = (value) => normalise(value)
  .replace(/ı/g, 'i').replace(/ğ/g, 'g').replace(/ü/g, 'u')
  .replace(/ş/g, 's').replace(/ö/g, 'o').replace(/ç/g, 'c');

const escapeRe = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Turkish glues its case endings onto the noun, so a visitor writes "Girne'de",
// "Mağusada", "Lefkoşaya". `allowSuffix` lets a term still match when a short
// ending follows it. It is opt-in because loosening it everywhere would let
// "motor" match "motorsiklet".
const containsTerm = (haystack, term, allowSuffix = false) => {
  const folded = fold(term);
  if (!folded) return false;

  const tail = allowSuffix ? "(?:'?[a-z]{0,4})?" : '';
  const pattern = new RegExp(
    `(^|[^\\p{L}\\p{N}])${escapeRe(folded)}${tail}($|[^\\p{L}\\p{N}])`,
    'u'
  );
  return pattern.test(haystack);
};

// "2 milyon" -> 2000000, "500bin" -> 500000, "1.5m" -> 1500000,
// "2.000.000" -> 2000000, "300k" -> 300000
const parseAmounts = (folded) => {
  const found = [];
  // A spelled-out magnitude may carry a Turkish ending ("2 milyona kadar"), but a
  // single-letter one must stand alone — otherwise the "1" in "3+1 kiralık"
  // reads the "k" of "kiralık" as thousands and invents a 1.000 budget.
  const pattern = /(\d+(?:[.,]\d+)*)\s*(?:(milyar|billion|milyon|million|mio|bin|thousand)[a-z]{0,3}|([kmb])(?![\p{L}\p{N}]))?/gu;
  let match;

  while ((match = pattern.exec(folded)) !== null) {
    const [full, rawNumber, wordMagnitude, letterMagnitude] = match;
    if (!rawNumber) continue;

    const rawMagnitude = wordMagnitude || letterMagnitude;
    let numeric;
    const magnitude = rawMagnitude
      ? MAGNITUDES.find((entry) => entry.terms.includes(rawMagnitude))
      : null;

    if (magnitude) {
      // With a magnitude word the separators are decimal: "1.5 milyon".
      numeric = parseFloat(rawNumber.replace(/\./g, '.').replace(/,/g, '.'));
      if (!Number.isFinite(numeric)) continue;
      numeric *= magnitude.factor;
    } else {
      // Without one they are thousands separators: "2.000.000" / "2,000,000".
      numeric = parseFloat(rawNumber.replace(/[.,]/g, ''));
      if (!Number.isFinite(numeric)) continue;
    }

    // A bare small number is far more likely a room count or a year than a
    // price, so it is left to the room/date logic instead.
    if (!magnitude && numeric < 1000) continue;

    found.push({ value: numeric, index: match.index, text: full.trim() });
  }

  return found;
};

const directionFor = (folded, amount) => {
  // The hint usually follows the number ("2 milyona kadar") but may precede it
  // ("max 2 milyon"), so a window on both sides is checked.
  const after = folded.slice(amount.index + amount.text.length, amount.index + amount.text.length + 24);
  const before = folded.slice(Math.max(0, amount.index - 24), amount.index);

  if (MAX_HINTS.some((hint) => after.includes(fold(hint)) || before.includes(fold(hint)))) return 'max';
  if (MIN_HINTS.some((hint) => after.includes(fold(hint)) || before.includes(fold(hint)))) return 'min';
  return null;
};

const parse = (rawQuery) => {
  const query = String(rawQuery || '').trim();
  const filters = {};
  const matched = [];

  if (!query) return { filters, matched, leftover: '' };

  const folded = ` ${fold(query)} `;

  // --- City. Suffixes allowed: "Girne'de", "Mağusada", "Lefkoşaya".
  for (const [city, terms] of Object.entries(CITY_TERMS)) {
    if (terms.some((term) => containsTerm(folded, term, true))) {
      filters.city = city;
      matched.push({ type: 'city', value: city });
      break;
    }
  }

  // --- Category. Longest phrase first, so "satılık daire" beats bare "daire".
  const categoryEntries = Object.entries(CATEGORY_TERMS)
    .flatMap(([slug, terms]) => terms.map((term) => ({ slug, term })))
    .sort((a, b) => b.term.length - a.term.length);

  const categoryHit = categoryEntries.find(({ term }) => containsTerm(folded, term));
  if (categoryHit) {
    filters.category = categoryHit.slug;
    matched.push({ type: 'category', value: categoryHit.slug });
  }

  // --- Rent or sale, when the category did not already imply it
  const wantsRent = RENT_HINTS.some((hint) => containsTerm(folded, hint));
  const wantsSale = SALE_HINTS.some((hint) => containsTerm(folded, hint));
  if (wantsRent && !wantsSale) {
    filters.listingType = 'rent';
    matched.push({ type: 'listing_type', value: 'rent' });
  } else if (wantsSale && !wantsRent) {
    filters.listingType = 'sale';
    matched.push({ type: 'listing_type', value: 'sale' });
  }

  // --- Currency
  if (GBP_HINTS.some((hint) => folded.includes(fold(hint)))) {
    filters.currency = 'GBP';
    matched.push({ type: 'currency', value: 'GBP' });
  } else if (TRY_HINTS.some((hint) => containsTerm(folded, hint))) {
    filters.currency = 'TRY';
    matched.push({ type: 'currency', value: 'TRY' });
  }

  // --- Rooms, e.g. 3+1 or "3 oda"
  const roomMatch = folded.match(/(\d+)\s*\+\s*(\d+)/);
  if (roomMatch) {
    filters.rooms = `${roomMatch[1]}+${roomMatch[2]}`;
    matched.push({ type: 'rooms', value: filters.rooms });
  } else {
    const odaMatch = folded.match(/(\d+)\s*(oda|odali|odalı|room|bedroom)/);
    if (odaMatch) {
      filters.rooms = `${odaMatch[1]}+1`;
      matched.push({ type: 'rooms', value: filters.rooms });
    }
  }

  // --- Budget
  const amounts = parseAmounts(folded);
  if (amounts.length === 1) {
    const only = amounts[0];
    const direction = directionFor(folded, only);
    // A lone budget with no qualifier reads as a ceiling: someone typing
    // "Girne 2 milyon daire" is saying what they can spend, not what they insist on.
    if (direction === 'min') {
      filters.minPrice = only.value;
      matched.push({ type: 'min_price', value: only.value });
    } else {
      filters.maxPrice = only.value;
      matched.push({ type: 'max_price', value: only.value });
    }
  } else if (amounts.length >= 2) {
    const values = amounts.map((amount) => amount.value).sort((a, b) => a - b);
    filters.minPrice = values[0];
    filters.maxPrice = values[values.length - 1];
    matched.push({ type: 'min_price', value: filters.minPrice });
    matched.push({ type: 'max_price', value: filters.maxPrice });
  }

  // --- Whatever is left becomes the free-text term, with the parts we already
  // turned into filters removed so they are not searched for literally too.
  let leftover = ` ${fold(query)} `;
  const consumed = [];
  if (filters.city) consumed.push(...CITY_TERMS[filters.city]);
  if (categoryHit) consumed.push(...CATEGORY_TERMS[categoryHit.slug]);
  consumed.push(...RENT_HINTS, ...SALE_HINTS, ...MAX_HINTS, ...MIN_HINTS, ...GBP_HINTS, ...TRY_HINTS);

  // Longest first, otherwise removing "temizlik" out of "temizlikçi" leaves a
  // stray "çi" behind to be searched for literally.
  consumed
    .map((term) => fold(term))
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
    .forEach((term) => {
      leftover = leftover.replace(new RegExp(`${escapeRe(term)}(?:'?[a-z]{0,4})?`, 'g'), ' ');
    });

  leftover = leftover
    .replace(/\d+(?:[.,]\d+)*\s*(milyar|milyon|bin|[kmb])?/g, ' ')
    .replace(/\+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Filler words carry no signal but would be searched for literally, quietly
  // throwing away listings that simply do not contain "arıyorum".
  leftover = leftover
    .split(' ')
    .filter((word) => word.length > 2 && !STOPWORDS.has(word))
    .join(' ');

  return { filters, matched, leftover };
};

// Ranks listings against the parsed intent. The database already filtered on the
// hard constraints; this orders what survived by how well it fits.
const score = (listing, parsed) => {
  let points = 0;
  const { filters } = parsed;
  const haystack = fold(`${listing.title || ''} ${listing.description || ''}`);

  if (filters.city && listing.location_city === filters.city) points += 30;

  if (filters.rooms && haystack.includes(fold(filters.rooms))) points += 25;

  // Closeness to the stated ceiling: something at 95% of budget is a better
  // answer than something at 10%, which is usually a different class of item.
  if (filters.maxPrice && Number(listing.price) > 0) {
    const ratio = Number(listing.price) / filters.maxPrice;
    if (ratio <= 1) points += Math.round(20 * ratio);
  }

  if (parsed.leftover) {
    const words = parsed.leftover.split(' ').filter((word) => word.length > 2);
    words.forEach((word) => {
      if (fold(listing.title || '').includes(word)) points += 12;
      else if (haystack.includes(word)) points += 5;
    });
  }

  if (Number(listing.is_premium) === 1) points += 8;
  if (Number(listing.is_featured) === 1) points += 4;
  if (listing.primary_image) points += 6;
  if ((listing.description || '').length > 120) points += 3;

  // A gentle recency nudge so equally good matches surface the fresher one.
  const created = listing.created_at ? Date.parse(String(listing.created_at).replace(' ', 'T') + 'Z') : NaN;
  if (Number.isFinite(created)) {
    const ageDays = (Date.now() - created) / 86400000;
    if (ageDays < 3) points += 6;
    else if (ageDays < 14) points += 3;
  }

  return points;
};

const rank = (listings, parsed) => listings
  .map((listing) => ({ listing, points: score(listing, parsed) }))
  .sort((a, b) => b.points - a.points)
  .map((entry) => entry.listing);

module.exports = {
  parse,
  score,
  rank,
  normalise,
  fold,
  CITY_TERMS,
  CATEGORY_TERMS
};
