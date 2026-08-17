// Turns the facts a seller has already entered — category, city, price, rooms,
// features they ticked — into a first draft of the description, so the box is
// never blank.
//
// It composes sentences from templates rather than calling a language model.
// Everything it writes comes from what the seller supplied, which means it
// cannot invent a sea view, a garage or a build year that was never entered.
// A generated paragraph that quietly adds a feature the property lacks is a
// misleading advert with the platform's fingerprints on it.

const FEATURE_LABELS = {
  emlak: ['esyali', 'balkon', 'asansor', 'otopark', 'havuz', 'bahce', 'deniz_manzara', 'dogalgaz', 'guvenlik'],
  vasita: ['hasarsiz', 'servis_bakimli', 'tek_elden', 'klima', 'suru_destek'],
  'ikinci-el': ['az_kullanilmis', 'kutulu', 'garantili', 'faturali'],
  'usta-hizmetler': ['ayni_gun', 'hafta_sonu', 'kesif_ucretsiz', 'garantili_is'],
  'is-ilanlari': ['yemek', 'servis', 'sigorta', 'esnek_saat', 'terfi_imkani'],
  'kurumsal-tedarikci': ['toptan_fiyat', 'stoktan_teslim', 'nakliye_dahil', 'proje_teklifi', 'numune_gonderimi', 'kdv_dahil', 'faturali']
};

// Which template set to compose from. A job advert and a flat need different
// sentences, not the same paragraph with the noun swapped.
const buildEmlak = (facts, t) => {
  const parts = [];
  const opening = [];

  if (facts.rooms) opening.push(t('draft.emlak.rooms', { rooms: facts.rooms }));
  if (facts.size) opening.push(t('draft.emlak.size', { size: facts.size }));
  opening.push(t('draft.emlak.in_city', { city: facts.cityName }));

  parts.push(t('draft.emlak.opening', {
    details: opening.join(', '),
    category: facts.categoryName
  }));

  if (facts.district) parts.push(t('draft.emlak.district', { district: facts.district }));
  if (facts.floor) parts.push(t('draft.emlak.floor', { floor: facts.floor }));
  if (facts.buildYear) parts.push(t('draft.emlak.build_year', { year: facts.buildYear }));

  return parts;
};

const buildVasita = (facts, t) => {
  const parts = [];
  const opening = [];

  if (facts.year) opening.push(facts.year);
  if (facts.brand) opening.push(facts.brand);
  if (facts.model) opening.push(facts.model);

  parts.push(t('draft.vasita.opening', {
    details: opening.join(' ') || facts.categoryName,
    city: facts.cityName
  }));

  if (facts.km) parts.push(t('draft.vasita.km', { km: facts.km }));
  if (facts.fuel) parts.push(t('draft.vasita.fuel', { fuel: facts.fuel }));
  if (facts.gear) parts.push(`Vites: ${facts.gear}.`);
  if (facts.body_type) parts.push(`Kasa: ${facts.body_type}.`);
  if (facts.engine_power) parts.push(`Motor Gücü: ${facts.engine_power}.`);
  if (facts.engine_size) parts.push(`Motor Hacmi: ${facts.engine_size}.`);
  if (facts.drivetrain) parts.push(`Çekiş: ${facts.drivetrain}.`);
  if (facts.color) parts.push(`Renk: ${facts.color}.`);
  if (facts.vehicle_status) parts.push(`Durum: ${facts.vehicle_status}.`);
  if (facts.swap && (facts.swap.includes('Evet') || facts.swap.includes('Takas') || facts.swap.includes('uygun'))) {
    parts.push(`Takasa uygundur.`);
  }

  return parts;
};

const buildGeneric = (facts, t) => [
  t('draft.generic.opening', { category: facts.categoryName, city: facts.cityName })
];

// A wholesale listing is read by a buyer asking "can you supply me, from where,
// on what terms" — not "what does this one item look like". The opening says who
// is supplying what and where from; the terms themselves come from the features
// the supplier ticked, so nothing is claimed that was not entered.
const buildKurumsal = (facts, t) => [
  t('draft.kurumsal.opening', { category: facts.categoryName, city: facts.cityName })
];

const BUILDERS = {
  emlak: buildEmlak,
  vasita: buildVasita,
  'kurumsal-tedarikci': buildKurumsal
};

// `t` is the caller's translator, so the draft comes out in the language the
// seller is filling the form in.
const build = (facts, t) => {
  const safeFacts = {
    categoryName: facts.categoryName || '',
    cityName: facts.cityName || '',
    district: (facts.district || '').trim(),
    rooms: (facts.rooms || '').trim(),
    size: (facts.size || '').toString().trim(),
    floor: (facts.floor || '').toString().trim(),
    buildYear: (facts.buildYear || '').toString().trim(),
    year: (facts.year || '').toString().trim(),
    brand: (facts.brand || '').trim(),
    model: (facts.model || '').trim(),
    km: (facts.km || '').toString().trim(),
    fuel: (facts.fuel || '').trim(),
    gear: (facts.gear || '').trim(),
    body_type: (facts.body_type || '').trim(),
    engine_power: (facts.engine_power || '').trim(),
    engine_size: (facts.engine_size || '').trim(),
    drivetrain: (facts.drivetrain || '').trim(),
    color: (facts.color || '').trim(),
    vehicle_status: (facts.vehicle_status || '').trim(),
    swap: (facts.swap || '').trim(),
    features: Array.isArray(facts.features) ? facts.features : []
  };

  const builder = BUILDERS[facts.rootSlug] || buildGeneric;
  const parts = builder(safeFacts, t);

  if (safeFacts.features.length > 0) {
    const labels = safeFacts.features.map((feature) => t(`draft.features.${feature}`));
    parts.push(t('draft.features_line', { features: labels.join(', ') }));
  }

  // A closing line that invites contact, and an explicit reminder that the
  // seller is expected to edit this rather than publish it untouched.
  parts.push(t('draft.closing'));

  return parts.join(' ');
};

const featuresFor = (rootSlug) => FEATURE_LABELS[rootSlug] || [];

module.exports = {
  build,
  featuresFor,
  FEATURE_LABELS
};
