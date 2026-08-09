const slugify = require('slugify');

const CURRENCY_SYMBOLS = {
  TRY: '₺',
  TL: '₺',
  GBP: '£',
  STG: '£',
  EUR: '€',
  USD: '$'
};

const INTL_LOCALES = {
  tr: 'tr-TR',
  en: 'en-GB',
  el: 'el-GR',
  ru: 'ru-RU',
  fa: 'fa-IR'
};

function parseDate(value) {
  if (value instanceof Date) return value;
  if (typeof value === 'number') return new Date(value);
  if (typeof value !== 'string') return new Date(NaN);

  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(value)) {
    return new Date(value.replace(' ', 'T') + 'Z');
  }

  return new Date(value);
}

function maskPhone(phone) {
  if (!phone || typeof phone !== 'string') return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 7) return '••• ••• ••';
  return `${digits.slice(0, 4)} ••• •• ••`;
}

function getCurrencySymbol(code) {
  if (!code || typeof code !== 'string') return '₺';
  const upper = code.trim().toUpperCase();
  return CURRENCY_SYMBOLS[upper] || upper;
}

const EXCHANGE_RATES = {
  GBP_TO_TRY: 45.0,
  TRY_TO_GBP: 1 / 45.0
};

function formatPrice(amount, itemCurrency = 'TRY', targetCurrency = null) {
  const num = Number(amount);
  const source = (itemCurrency || 'TRY').trim().toUpperCase();
  const target = targetCurrency ? targetCurrency.trim().toUpperCase() : source;

  if (isNaN(num) || num === 0) return `${getCurrencySymbol(target || source)}0`;

  let finalAmount = num;
  let finalCurrency = source;

  if (target && target !== source) {
    if (source === 'TRY' && target === 'GBP') {
      finalAmount = num * EXCHANGE_RATES.TRY_TO_GBP;
      finalCurrency = 'GBP';
    } else if (source === 'GBP' && target === 'TRY') {
      finalAmount = num * EXCHANGE_RATES.GBP_TO_TRY;
      finalCurrency = 'TRY';
    }
  }

  const symbol = getCurrencySymbol(finalCurrency);
  const locale = finalCurrency === 'GBP' ? 'en-GB' : 'tr-TR';
  const formattedNumber = finalAmount.toLocaleString(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: (finalAmount < 100 && finalCurrency === 'GBP') ? 2 : 0
  });

  return `${symbol}${formattedNumber}`;
}

function formatDate(date, lang = 'tr') {
  if (!date) return '';
  const d = parseDate(date);
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

function timeAgo(date, lang = 'tr') {
  if (!date) return '';
  const d = parseDate(date);
  if (isNaN(d.getTime())) return '';

  const now = new Date();
  const diffInSeconds = Math.max(0, Math.floor((now.getTime() - d.getTime()) / 1000));

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

function truncate(text, length = 100, suffix = '...') {
  if (!text || typeof text !== 'string') return '';
  if (text.length <= length) return text;
  return text.substring(0, length).trim() + suffix;
}

const TRANSLIT_MAP = {
  'ç': 'c', 'Ç': 'c', 'ğ': 'g', 'Ğ': 'g', 'ı': 'i', 'İ': 'i',
  'ö': 'o', 'Ö': 'o', 'ş': 's', 'Ş': 's', 'ü': 'u', 'Ü': 'u',
  'α': 'a', 'ά': 'a', 'β': 'b', 'γ': 'g', 'δ': 'd', 'ε': 'e', 'έ': 'e',
  'ζ': 'z', 'η': 'e', 'ή': 'e', 'θ': 'th', 'ι': 'i', 'ί': 'i', 'ϊ': 'i', 'ΐ': 'i',
  'κ': 'k', 'λ': 'l', 'μ': 'm', 'ν': 'n', 'ξ': 'x', 'ο': 'o', 'ό': 'o',
  'π': 'p', 'ρ': 'r', 'σ': 's', 'ς': 's', 'τ': 't', 'υ': 'u', 'ύ': 'u',
  'ϋ': 'u', 'ΰ': 'u', 'φ': 'f', 'χ': 'ch', 'ψ': 'ps', 'ω': 'o', 'ώ': 'o',
  'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo',
  'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
  'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
  'ф': 'f', 'х': 'kh', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'shch',
  'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
  'آ': 'a', 'ا': 'a', 'ب': 'b', 'پ': 'p', 'ت': 't', 'ث': 's', 'ج': 'j',
  'چ': 'ch', 'ح': 'h', 'خ': 'kh', 'د': 'd', 'ذ': 'z', 'ر': 'r', 'ز': 'z',
  'ژ': 'zh', 'س': 's', 'ش': 'sh', 'ص': 's', 'ض': 'z', 'ط': 't', 'ظ': 'z',
  'ع': 'a', 'غ': 'gh', 'ف': 'f', 'ق': 'gh', 'ک': 'k', 'گ': 'g', 'ل': 'l',
  'م': 'm', 'ن': 'n', 'و': 'v', 'ه': 'h', 'ی': 'y', 'ك': 'k', 'ي': 'y'
};

function generateSlug(text) {
  if (!text || typeof text !== 'string') return '';

  let sanitized = text.toLowerCase().trim();

  sanitized = sanitized.split('').map(char => TRANSLIT_MAP[char] !== undefined ? TRANSLIT_MAP[char] : char).join('');

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
  maskPhone,
  paginationHelper
};
