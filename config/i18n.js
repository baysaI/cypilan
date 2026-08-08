/**
 * Internationalization (i18n) Module for CYPILAN.COM
 * 
 * Supports multi-language localization (TR, EN, EL, RU, FA)
 * with dot-notation translation keys, parameter substitution,
 * and automatic Turkish fallback mechanism.
 */

const fs = require('fs');
const path = require('path');

/**
 * Supported language codes.
 * @type {string[]}
 */
const supportedLanguages = ['tr', 'en', 'el', 'ru', 'fa'];

/**
 * Cache for loaded locale JSON objects.
 * @type {Object.<string, Object>}
 */
const locales = {};

/**
 * Load locale files into memory synchronously.
 */
function loadLocales() {
  const localesDir = path.join(__dirname, '..', 'locales');

  supportedLanguages.forEach((lang) => {
    const filePath = path.join(localesDir, `${lang}.json`);
    try {
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf8');
        locales[lang] = JSON.parse(content);
      } else {
        locales[lang] = {};
      }
    } catch (error) {
      console.error(`[i18n] Error loading locale file for '${lang}':`, error);
      locales[lang] = {};
    }
  });
}

// Initial load of locales
loadLocales();

/**
 * Helper to traverse nested objects using dot notation (e.g., "nav.home").
 * 
 * @param {Object} obj - The object to search within.
 * @param {string} keyPath - Dot-separated path string.
 * @returns {string|number|undefined} The extracted value or undefined.
 */
function getNestedValue(obj, keyPath) {
  if (!obj || typeof obj !== 'object' || !keyPath) {
    return undefined;
  }

  const keys = keyPath.split('.');
  let current = obj;

  for (const key of keys) {
    if (current && typeof current === 'object' && Object.prototype.hasOwnProperty.call(current, key)) {
      current = current[key];
    } else {
      return undefined;
    }
  }

  return typeof current === 'string' || typeof current === 'number' ? String(current) : undefined;
}

/**
 * Helper utility to deep merge objects.
 * 
 * @param {Object} target 
 * @param {...Object} sources 
 * @returns {Object}
 */
function mergeDeep(target, ...sources) {
  if (!sources.length) return target;
  const source = sources.shift();

  if (isObject(target) && isObject(source)) {
    for (const key in source) {
      if (isObject(source[key])) {
        if (!target[key]) Object.assign(target, { [key]: {} });
        mergeDeep(target[key], source[key]);
      } else {
        Object.assign(target, { [key]: source[key] });
      }
    }
  }

  return mergeDeep(target, ...sources);
}

/**
 * Checks if value is a plain object.
 * 
 * @param {*} item 
 * @returns {boolean}
 */
function isObject(item) {
  return item && typeof item === 'object' && !Array.isArray(item);
}

/**
 * Translates a key into the target language with Turkish fallback.
 * 
 * @param {string} key - Dot-notation key (e.g. 'nav.home', 'auth.login_title')
 * @param {string} [lang='tr'] - Language code ('tr', 'en', 'el', 'ru', 'fa')
 * @param {Object} [params={}] - Key-value replacements for string interpolation (e.g. { name: 'John' })
 * @returns {string} The translated string or the original key if missing.
 */
function translate(key, lang = 'tr', params = {}) {
  const targetLang = supportedLanguages.includes(lang) ? lang : 'tr';

  let translated = getNestedValue(locales[targetLang], key);

  // Fallback to Turkish if key not found in target language
  if (translated === undefined && targetLang !== 'tr') {
    translated = getNestedValue(locales['tr'], key);
  }

  // Fallback to original key if missing in both
  if (translated === undefined) {
    return key;
  }

  // Perform parameter replacements if provided (e.g., "Hello {name}" -> "Hello John")
  if (params && typeof params === 'object') {
    Object.keys(params).forEach((paramKey) => {
      const value = params[paramKey];
      translated = translated.replace(new RegExp(`\\{${paramKey}\\}`, 'g'), value);
    });
  }

  return translated;
}

/**
 * Retrieves the full locale dictionary for a specified language,
 * merged with Turkish fallbacks for missing keys.
 * 
 * @param {string} [lang='tr'] - Target language code.
 * @returns {Object} The complete localized dictionary.
 */
function getLocale(lang = 'tr') {
  const targetLang = supportedLanguages.includes(lang) ? lang : 'tr';
  if (targetLang === 'tr') {
    return locales['tr'] || {};
  }

  // Deep merge target locale over Turkish fallback
  return mergeDeep({}, locales['tr'] || {}, locales[targetLang] || {});
}

module.exports = {
  translate,
  getLocale,
  supportedLanguages,
  loadLocales
};
