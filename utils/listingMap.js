const cities = require('../config/cities');
const { convertCurrency } = require('./exchangeRates');

// Harita noktalarını kurar.
//
// İki tür nokta var ve ayrım verinin kendisinden geliyor: koordinatı olan ilan
// kendi yerinde tek başına durur, olmayan ilan şehrinin işaretinde toplanır.
//
// Bugün ilanların tamamının koordinatı boş, çünkü ilan verme formu haritadan
// konum sormuyor. Bu yüzden harita şehir işaretleriyle başlıyor. Alternatif -
// hepsini şehir merkezinin etrafına dağıtmak - bir emlak haritasında yalan
// söylemek olurdu: iğne "ev burada" demektir.

// Ortalama değil ortanca. Bir şehirdeki tek bir villa, ortalamayı o şehirdeki
// bütün dairelerin iki katına çıkarabiliyor; ortanca o tek ilandan
// etkilenmiyor.
const median = (numbers) => {
  if (numbers.length === 0) return null;
  const sorted = numbers.slice().sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[middle - 1] + sorted[middle]) / 2)
    : sorted[middle];
};

// Fiyatlar farklı para birimlerinde girilmiş olabiliyor; karşılaştırılabilir
// olmaları için hepsi görüntüleme para birimine çevriliyor. Çevrilmeden
// alınan bir ortanca, sterlin ile lirayı aynı torbaya koymak olurdu.
const toDisplay = (price, from, target) => {
  const amount = Number(price);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const source = String(from || target || 'GBP').toUpperCase();
  if (source === target) return Math.round(amount);
  const converted = Number(convertCurrency(amount, source, target));
  return Number.isFinite(converted) ? Math.round(converted) : null;
};

const buildMapPoints = (rows = [], { currency = 'GBP' } = {}) => {
  const target = String(currency || 'GBP').toUpperCase();
  const exact = [];
  const byCity = new Map();

  rows.forEach((row) => {
    const lat = Number(row.lat);
    const lng = Number(row.lng);
    const price = toDisplay(row.price, row.currency, target);

    if (Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0) {
      exact.push({
        id: row.id,
        slug: row.slug,
        title: row.title,
        price,
        city: row.city || '',
        district: row.district || '',
        image: row.image || null,
        lat,
        lng
      });
      return;
    }

    const city = row.city || '';
    if (!city) return;

    if (!byCity.has(city)) byCity.set(city, { city, total: 0, prices: [] });
    const bucket = byCity.get(city);
    bucket.total += 1;
    if (price !== null) bucket.prices.push(price);
  });

  const cityPoints = [];
  byCity.forEach((bucket) => {
    // Tanınmayan bir şehir adı getCoordinates'te Kıbrıs'ın ortasına düşüyor;
    // oraya işaret koymak, ilanların Lefkoşa'nın kuzeyindeki bir tarlada
    // olduğunu söylemek olurdu. Bilinmeyen şehir haritaya hiç girmiyor.
    if (!cities.isKnown(bucket.city)) return;

    const point = cities.getCoordinates(bucket.city);
    if (!point) return;

    cityPoints.push({
      city: bucket.city,
      lat: point.lat,
      lng: point.lng,
      total: bucket.total,
      medianPrice: median(bucket.prices)
    });
  });

  cityPoints.sort((a, b) => b.total - a.total);

  return { exact, cities: cityPoints, currency: target, total: rows.length };
};

module.exports = { buildMapPoints, median };
