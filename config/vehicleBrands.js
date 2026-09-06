// Araç markaları — tıklanarak seçilen liste.
//
// Marka bugüne kadar serbest metindi ("BMW", "bmw", "B.M.W" hepsi ayrı bir
// değerdi), yani ne filtrelenebiliyor ne sayılabiliyordu. Liste bunu bitiriyor
// ve satıcının en çok tekrarladığı adımı bir dokunuşa indiriyor.
//
// Liste Kıbrıs'a göre seçildi, dünyanın tamamına göre değil: adadaki filo
// ağırlıkla Japon sağdan direksiyon ithalatı ve İngiltere'den gelen araçlardan
// oluşuyor. Yüz elli markalık jenerik bir liste, aranan markayı bulmayı
// kolaylaştırmaz, zorlaştırır.
//
// POPULAR önce basılıyor. Alfabetik sıra adil ama işe yaramaz: Kıbrıs'ta en çok
// satılan araç "A" ile başlamıyor.

const CAR_POPULAR = [
  'Toyota', 'Honda', 'Nissan', 'Mercedes-Benz', 'BMW', 'Volkswagen',
  'Audi', 'Ford', 'Hyundai', 'Kia', 'Renault', 'Peugeot'
];

const CAR_REST = [
  'Alfa Romeo', 'Chery', 'Chevrolet', 'Chrysler', 'Citroën', 'Cupra', 'Dacia',
  'Daewoo', 'Daihatsu', 'Fiat', 'Great Wall', 'Haval', 'Isuzu', 'Jaguar',
  'Jeep', 'Land Rover', 'Lexus', 'Mazda', 'MG', 'Mini', 'Mitsubishi', 'Opel',
  'Porsche', 'Proton', 'Rover', 'Seat', 'Skoda', 'Smart', 'SsangYong',
  'Subaru', 'Suzuki', 'Tesla', 'Vauxhall', 'Volvo'
];

const MOTORCYCLE_POPULAR = [
  'Honda', 'Yamaha', 'Suzuki', 'Kawasaki', 'Vespa', 'Piaggio'
];

const MOTORCYCLE_REST = [
  'Aprilia', 'Bajaj', 'Benelli', 'BMW', 'Ducati', 'Harley-Davidson', 'Husqvarna',
  'KTM', 'Kuba', 'Mondial', 'Motolux', 'Peugeot', 'RKS', 'Royal Enfield',
  'SYM', 'Triumph', 'TVS', 'Yuki'
];

const COMMERCIAL_POPULAR = [
  'Ford', 'Mercedes-Benz', 'Volkswagen', 'Renault', 'Peugeot', 'Citroën'
];

const COMMERCIAL_REST = [
  'Fiat', 'Hyundai', 'Isuzu', 'Iveco', 'Kia', 'MAN', 'Mitsubishi', 'Nissan',
  'Opel', 'Toyota', 'Vauxhall'
];

const build = (popular, rest) => ({
  popular,
  all: popular.concat(rest.slice().sort((a, b) => a.localeCompare(b, 'tr')))
});

// Alt kategoriye göre liste. Motosiklet markaları otomobilinkiyle aynı değil ve
// aynıymış gibi davranmak listeyi iki tarafta da kullanışsız yapardı.
const BY_SUBCATEGORY = {
  otomobil: build(CAR_POPULAR, CAR_REST),
  'suv-arazi': build(CAR_POPULAR, CAR_REST),
  pickup: build(COMMERCIAL_POPULAR, COMMERCIAL_REST),
  'ticari-araclar': build(COMMERCIAL_POPULAR, COMMERCIAL_REST),
  motosiklet: build(MOTORCYCLE_POPULAR, MOTORCYCLE_REST)
};

const forSubcategory = (slug) => BY_SUBCATEGORY[slug] || BY_SUBCATEGORY.otomobil;

// Listede olmayan bir marka her zaman yazılabiliyor: kapalı bir liste,
// adadaki tek bir Morgan'ı ilan veremez hale getirirdi.
const isKnownBrand = (slug, value) => {
  if (!value) return false;
  const needle = String(value).trim().toLowerCase();
  return forSubcategory(slug).all.some((b) => b.toLowerCase() === needle);
};

// Havuzun temiz kalmasi normalizasyona bagli. "320i", "320 i", " 320I " ayni
// modelse ayni satir olmali; yoksa oneri listesi ayni seyin bes yazimiyla
// dolar ve kimseye bir sey onermez.
const normalize = (value) => {
  if (value === undefined || value === null) return '';
  return String(value)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
};

// Marka yazıyla girildiyse listedeki yazımına çekiliyor: "bmw" -> "BMW".
const canonicalBrand = (slug, value) => {
  const clean = normalize(value);
  if (!clean) return '';
  const match = forSubcategory(slug).all.find((b) => b.toLowerCase() === clean.toLowerCase());
  return match || clean;
};

module.exports = {
  BY_SUBCATEGORY,
  forSubcategory,
  isKnownBrand,
  normalize,
  canonicalBrand
};
