// The single list of places a listing can sit in. It used to be repeated inline
// in four templates, which is why adding a region meant finding all four.
//
// `region` drives nothing but grouping in the dropdowns today; it exists so the
// southern districts can be introduced without pretending they are the same
// market as the north.

const CITIES = [
  { name: 'Lefkoşa', region: 'north', lat: 35.1856, lng: 33.3823, zoom: 13 },
  { name: 'Girne', region: 'north', lat: 35.3364, lng: 33.3182, zoom: 13 },
  { name: 'Gazimağusa', region: 'north', lat: 35.1250, lng: 33.9417, zoom: 13 },
  { name: 'İskele', region: 'north', lat: 35.2892, lng: 33.8906, zoom: 13 },
  { name: 'Güzelyurt', region: 'north', lat: 35.1975, lng: 32.9933, zoom: 13 },
  { name: 'Larnaka', region: 'south', lat: 34.9167, lng: 33.6292, zoom: 13 },
  { name: 'Limasol', region: 'south', lat: 34.6853, lng: 33.0333, zoom: 13 },
  { name: 'Baf', region: 'south', lat: 34.7754, lng: 32.4218, zoom: 13 },
  { name: 'Larnaka Kırsal', region: 'south', lat: 34.8800, lng: 33.5500, zoom: 12 }
];

const names = () => CITIES.map((city) => city.name);

const byRegion = (region) => CITIES.filter((city) => city.region === region).map((city) => city.name);

const isKnown = (name) => names().includes(name);

const grouped = () => [
  { region: 'north', cities: byRegion('north') },
  { region: 'south', cities: byRegion('south') }
];

const getCoordinates = (cityName, customLat = null, customLng = null) => {
  if (customLat && customLng && Number.isFinite(Number(customLat)) && Number.isFinite(Number(customLng))) {
    // 15 degil 14: sitede saklanan hicbir koordinat tam adres degil, hepsi
    // kasten kabalastirilmis bir mahalle noktasi (utils/listingMap.coarsen).
    // Kapiya kadar yakinlastirmak, olmayan bir hassasiyeti varmis gibi
    // gostermek olurdu.
    return { lat: Number(customLat), lng: Number(customLng), zoom: 14, isExact: true };
  }
  const found = CITIES.find((c) => c.name.toLowerCase() === String(cityName || '').toLowerCase());
  if (found) {
    return { lat: found.lat, lng: found.lng, zoom: found.zoom || 13, isExact: false };
  }
  // Default to Cyprus centroid (Lefkoşa region)
  return { lat: 35.1856, lng: 33.3823, zoom: 10, isExact: false };
};

const CITY_TRANSLATIONS = {
  'Lefkoşa': { tr: 'Lefkoşa', en: 'Nicosia', el: 'Λευκωσία', ru: 'Никосия', fa: 'نیکوزیا' },
  'Girne': { tr: 'Girne', en: 'Kyrenia', el: 'Κερύνεια', ru: 'Кирения', fa: 'گیرنه' },
  'Gazimağusa': { tr: 'Gazimağusa', en: 'Famagusta', el: 'Αμμόχωστος', ru: 'Фамагуста', fa: 'فاماگوستا' },
  'İskele': { tr: 'İskele', en: 'Trikomo', el: 'Τρίκωμο', ru: 'Искеле', fa: 'اسکله' },
  'Güzelyurt': { tr: 'Güzelyurt', en: 'Morphou', el: 'Μόρφου', ru: 'Гюзельюрт', fa: 'گوزلیورت' },
  'Lefke': { tr: 'Lefke', en: 'Lefka', el: 'Λεύκα', ru: 'Лефка', fa: 'لفکه' },
  'Larnaka': { tr: 'Larnaka', en: 'Larnaca', el: 'Λάρνακα', ru: 'Ларнака', fa: 'لارناکا' },
  'Limasol': { tr: 'Limasol', en: 'Limassol', el: 'Λεμεσός', ru: 'Лимасол', fa: 'لیماسول' },
  'Baf': { tr: 'Baf', en: 'Paphos', el: 'Πάφος', ru: 'Пафос', fa: 'پافوس' },
  'Larnaka Kırsal': { tr: 'Larnaka Kırsal', en: 'Larnaca Rural', el: 'Επαρχία Λάρνακας', ru: 'Ларнака (район)', fa: 'حومه لارناکا' }
};

const getName = (cityName, lang = 'tr') => {
  if (!cityName) return '';
  const cityObj = CITY_TRANSLATIONS[cityName];
  if (cityObj) {
    return cityObj[lang] || cityObj.tr || cityName;
  }
  return cityName;
};

module.exports = {
  CITIES,
  names,
  byRegion,
  isKnown,
  grouped,
  getCoordinates,
  getName
};

