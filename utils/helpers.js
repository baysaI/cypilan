/**
 * Helper Utilities for CYPILAN.COM
 * 
 * Provides price formatting, locale date parsing, relative time calculation,
 * text truncation, slug generation, HTML sanitization, and pagination math.
 */

const slugify = require('slugify');

/**
 * Currency Symbol Map
 * @type {Object.<string, string>}
 */
const CURRENCY_SYMBOLS = {
  TRY: '₺',
  TL: '₺',
  GBP: '£',
  STG: '£',
  EUR: '€',
  USD: '$'
};

/**
 * Map language code to standard Intl locale string.
 * @type {Object.<string, string>}
 */
const INTL_LOCALES = {
  tr: 'tr-TR',
  en: 'en-GB',
  el: 'el-GR',
  ru: 'ru-RU',
  fa: 'fa-IR'
};

/**
 * Returns the currency symbol for a given currency code.
 * 
 * @param {string} code - Currency code ('TRY', 'GBP', 'EUR', 'USD', etc.)
 * @returns {string} Currency symbol (e.g. '₺', '£', '€', '$')
 */
function getCurrencySymbol(code) {
  if (!code || typeof code !== 'string') return '₺';
  const upper = code.trim().toUpperCase();
  return CURRENCY_SYMBOLS[upper] || upper;
}

/**
 * Formats a numeric price with thousands separators and appropriate currency symbol.
 * 
 * @param {number|string} amount - Price amount
 * @param {string} [currency='TRY'] - Currency code
 * @returns {string} Formatted price string (e.g. "₺1.500", "£250.000")
 */
function formatPrice(amount, currency = 'TRY') {
  const num = Number(amount);
  if (isNaN(num)) return `0 ${getCurrencySymbol(currency)}`;

  const symbol = getCurrencySymbol(currency);
  const formattedNumber = num.toLocaleString('tr-TR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });

  return `${symbol}${formattedNumber}`;
}

/**
 * Formats a Date object or ISO date string according to target language locale.
 * 
 * @param {Date|string|number} date - Date object, ISO string, or timestamp
 * @param {string} [lang='tr'] - Language code ('tr', 'en', 'el', 'ru', 'fa')
 * @returns {string} Localized formatted date string
 */
function formatDate(date, lang = 'tr') {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';

  const locale = INTL_LOCALES[lang] || INTL_LOCALES['tr'];
  try {
    return new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }).format(d);
  } catch (err) {
    return d.toLocaleDateString();
  }
}

/**
 * Calculates human-readable relative time ("2 saat önce", "2 hours ago", etc.)
 * 
 * @param {Date|string|number} date - Past date
 * @param {string} [lang='tr'] - Language code ('tr', 'en', 'el', 'ru', 'fa')
 * @returns {string} Relative time string
 */
function timeAgo(date, lang = 'tr') {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';

  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - d.getTime()) / 1000);

  if (diffInSeconds < 0) {
    return formatDate(date, lang);
  }

  const minutes = Math.floor(diffInSeconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  const targetLang = ['tr', 'en', 'el', 'ru', 'fa'].includes(lang) ? lang : 'tr';

  const strings = {
    tr: {
      justNow: 'az önce',
      minute: 'dakika önce',
      hour: 'saat önce',
      day: 'gün önce',
      month: 'ay önce',
      year: 'yıl önce'
    },
    en: {
      justNow: 'just now',
      minute: minutes === 1 ? 'minute ago' : 'minutes ago',
      hour: hours === 1 ? 'hour ago' : 'hours ago',
      day: days === 1 ? 'day ago' : 'days ago',
      month: months === 1 ? 'month ago' : 'months ago',
      year: years === 1 ? 'year ago' : 'years ago'
    },
    el: {
      justNow: 'μόλις τώρα',
      minute: 'λεπτά πριν',
      hour: 'ώρες πριν',
      day: 'μέρες πριν',
      month: 'μήνες πριν',
      year: 'χρόνια πριν'
    },
    ru: {
      justNow: 'только что',
      minute: 'мин. назад',
      hour: 'ч. назад',
      day: 'дн. назад',
      month: 'мес. назад',
      year: 'лет назад'
    },
    fa: {
      justNow: 'همین الان',
      minute: 'دقیقه پیش',
      hour: 'ساعت پیش',
      day: 'روز پیش',
      month: 'ماه پیش',
      year: 'سال پیش'
    }
  };

  const t = strings[targetLang];

  if (diffInSeconds < 60) return t.justNow;
  if (minutes < 60) return `${minutes} ${t.minute}`;
  if (hours < 24) return `${hours} ${t.hour}`;
  if (days < 30) return `${days} ${t.day}`;
  if (months < 12) return `${months} ${t.month}`;
  return `${years} ${t.year}`;
}

/**
 * Truncates text to a specified length and appends suffix if truncated.
 * 
 * @param {string} text - Input text
 * @param {number} [length=100] - Maximum allowed length
 * @param {string} [suffix='...'] - Ellipsis or suffix
 * @returns {string} Truncated string
 */
function truncate(text, length = 100, suffix = '...') {
  if (!text || typeof text !== 'string') return '';
  if (text.length <= length) return text;
  return text.substring(0, length).trim() + suffix;
}

/**
 * Transliteration map for non-Latin characters (Turkish, Greek, Russian, Farsi).
 */
const TRANSLIT_MAP = {
  // Turkish
  'ç': 'c', 'Ç': 'c', 'ğ': 'g', 'Ğ': 'g', 'ı': 'i', 'İ': 'i',
  'ö': 'o', 'Ö': 'o', 'ş': 's', 'Ş': 's', 'ü': 'u', 'Ü': 'u',
  // Greek
  'α': 'a', 'ά': 'a', 'β': 'b', 'γ': 'g', 'δ': 'd', 'ε': 'e', 'έ': 'e',
  'ζ': 'z', 'η': 'e', 'ή': 'e', 'θ': 'th', 'ι': 'i', 'ί': 'i', 'ϊ': 'i', 'ΐ': 'i',
  'κ': 'k', 'λ': 'l', 'μ': 'm', 'ν': 'n', 'ξ': 'x', 'ο': 'o', 'ό': 'o',
  'π': 'p', 'ρ': 'r', 'σ': 's', 'ς': 's', 'τ': 't', 'υ': 'u', 'ύ': 'u',
  'ϋ': 'u', 'ΰ': 'u', 'φ': 'f', 'χ': 'ch', 'ψ': 'ps', 'ω': 'o', 'ώ': 'o',
  // Russian
  'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo',
  'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
  'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
  'ф': 'f', 'х': 'kh', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'shch',
  'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
  // Farsi
  'آ': 'a', 'ا': 'a', 'ب': 'b', 'پ': 'p', 'ت': 't', 'ث': 's', 'ج': 'j',
  'چ': 'ch', 'ح': 'h', 'خ': 'kh', 'د': 'd', 'ذ': 'z', 'ر': 'r', 'ز': 'z',
  'ژ': 'zh', 'س': 's', 'ش': 'sh', 'ص': 's', 'ض': 'z', 'ط': 't', 'ظ': 'z',
  'ع': 'a', 'غ': 'gh', 'ف': 'f', 'ق': 'gh', 'ک': 'k', 'گ': 'g', 'ل': 'l',
  'م': 'm', 'ن': 'n', 'و': 'v', 'ه': 'h', 'ی': 'y', 'ك': 'k', 'ي': 'y'
};

/**
 * Generates a clean, URL-safe slug from a string.
 * Transliterates Turkish, Greek, Russian, and Farsi characters.
 * 
 * @param {string} text - Title or string to convert
 * @returns {string} URL-safe slug
 */
function generateSlug(text) {
  if (!text || typeof text !== 'string') return '';

  let sanitized = text.toLowerCase().trim();

  // Transliterate specific characters
  sanitized = sanitized.split('').map(char => TRANSLIT_MAP[char] !== undefined ? TRANSLIT_MAP[char] : char).join('');

  // Fallback slugification using npm package 'slugify'
  try {
    const slug = slugify(sanitized, {
      lower: true,
      strict: true,
      remove: /[*+~.()'"!:@]/g
    });
    return slug || 'item';
  } catch (err) {
    return sanitized
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '') || 'item';
  }
}

/**
 * Basic HTML sanitization to prevent XSS attacks.
 * Escapes tags or strips HTML content.
 * 
 * @param {string} html - HTML string to sanitize
 * @param {boolean} [stripTags=false] - If true, strips tags entirely; if false, escapes HTML entities
 * @returns {string} Sanitized text string
 */
function sanitizeHtml(html, stripTags = false) {
  if (!html || typeof html !== 'string') return '';

  if (stripTags) {
    return html.replace(/<[^>]*>?/gm, '').trim();
  }

  return html
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Calculates pagination metadata for search results and listing lists.
 * 
 * @param {number|string} currentPage - Current active page (1-indexed)
 * @param {number|string} totalPages - Total number of pages available
 * @param {number} [maxVisiblePages=5] - Maximum page number buttons to show
 * @returns {Object} Pagination structure { currentPage, totalPages, hasNext, hasPrev, nextPage, prevPage, pages }
 */
function paginationHelper(currentPage, totalPages, maxVisiblePages = 5) {
  const current = Math.max(1, parseInt(currentPage, 10) || 1);
  const total = Math.max(1, parseInt(totalPages, 10) || 1);

  const hasNext = current < total;
  const hasPrev = current > 1;
  const nextPage = hasNext ? current + 1 : null;
  const prevPage = hasPrev ? current - 1 : null;

  let startPage = Math.max(1, current - Math.floor(maxVisiblePages / 2));
  let endPage = startPage + maxVisiblePages - 1;

  if (endPage > total) {
    endPage = total;
    startPage = Math.max(1, endPage - maxVisiblePages + 1);
  }

  const pages = [];
  for (let i = startPage; i <= endPage; i++) {
    pages.push(i);
  }

  return {
    currentPage: current,
    totalPages: total,
    hasNext,
    hasPrev,
    nextPage,
    prevPage,
    pages
  };
}

module.exports = {
  formatPrice,
  formatDate,
  timeAgo,
  truncate,
  generateSlug,
  sanitizeHtml,
  getCurrencySymbol,
  paginationHelper
};
