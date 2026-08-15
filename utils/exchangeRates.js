const HALF_DAY_MS = 12 * 60 * 60 * 1000; // 12 hours (yarım gün)

let cache = {
  rates: {
    TRY: 1,
    GBP: 0.0154,
    EUR: 0.0180,
    USD: 0.0209
  },
  lastFetched: 0
};

async function fetchLiveRates() {
  const primaryUrl = 'https://open.er-api.com/v6/latest/TRY';
  const fallbackUrl = 'https://api.exchangerate-api.com/v4/latest/TRY';

  try {
    const res = await fetch(primaryUrl);
    if (res.ok) {
      const data = await res.json();
      if (data && data.rates && data.rates.GBP) {
        cache.rates = {
          TRY: 1,
          GBP: data.rates.GBP,
          EUR: data.rates.EUR || 0.0180,
          USD: data.rates.USD || 0.0209
        };
        cache.lastFetched = Date.now();
        console.log('[ExchangeRates] Live rates updated successfully (12h TTL cache).');
        return cache.rates;
      }
    }
  } catch (err) {
    console.warn('[ExchangeRates] Primary API fetch failed, trying fallback API...', err.message);
  }

  try {
    const res = await fetch(fallbackUrl);
    if (res.ok) {
      const data = await res.json();
      if (data && data.rates && data.rates.GBP) {
        cache.rates = {
          TRY: 1,
          GBP: data.rates.GBP,
          EUR: data.rates.EUR || 0.0180,
          USD: data.rates.USD || 0.0209
        };
        cache.lastFetched = Date.now();
        console.log('[ExchangeRates] Fallback API live rates updated successfully.');
        return cache.rates;
      }
    }
  } catch (err) {
    console.error('[ExchangeRates] All exchange rate APIs failed. Using cached/fallback rates.', err.message);
  }

  return cache.rates;
}

function getRates() {
  const now = Date.now();
  if (now - cache.lastFetched > HALF_DAY_MS) {
    fetchLiveRates().catch(() => {});
  }
  return cache.rates;
}

function convertCurrency(amount, source = 'TRY', target = 'TRY') {
  const num = Number(amount);
  if (isNaN(num) || num === 0) return 0;

  const src = (source || 'TRY').trim().toUpperCase();
  const tgt = (target || 'TRY').trim().toUpperCase();

  if (src === tgt) return num;

  const rates = getRates();
  const srcRate = rates[src] || (src === 'GBP' ? 0.0154 : src === 'EUR' ? 0.0180 : src === 'USD' ? 0.0209 : 1);
  const tgtRate = rates[tgt] || (tgt === 'GBP' ? 0.0154 : tgt === 'EUR' ? 0.0180 : tgt === 'USD' ? 0.0209 : 1);

  const amountInTRY = src === 'TRY' ? num : num / srcRate;
  const finalAmount = tgt === 'TRY' ? amountInTRY : amountInTRY * tgtRate;

  return finalAmount;
}

// Initial fetch on module load
fetchLiveRates().catch(() => {});

// Background refresh every 12 hours (yarım gün)
const refreshTimer = setInterval(() => {
  fetchLiveRates().catch(() => {});
}, HALF_DAY_MS);
if (refreshTimer && typeof refreshTimer.unref === 'function') {
  refreshTimer.unref();
}

module.exports = {
  fetchLiveRates,
  getRates,
  convertCurrency
};
