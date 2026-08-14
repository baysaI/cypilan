const fs = require('fs');
const path = require('path');

const supportedLanguages = ['tr', 'en', 'el', 'ru', 'fa'];

const locales = {};

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

loadLocales();

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

  if (typeof current === 'string' || typeof current === 'number') {
    return String(current);
  }
  if (Array.isArray(current) || isObject(current)) {
    return current;
  }

  return undefined;
}

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

function isObject(item) {
  return item && typeof item === 'object' && !Array.isArray(item);
}

function translate(key, lang = 'tr', params = {}) {
  const targetLang = supportedLanguages.includes(lang) ? lang : 'tr';

  let translated = getNestedValue(locales[targetLang], key);

  const namespaces = ['nav', 'common', 'listing', 'auth', 'categories', 'home', 'footer', 'admin', 'pages', 'report_modal', 'profile_edit', 'errors', 'messages', 'smart'];
  if (translated === undefined && !key.includes('.')) {
    for (const ns of namespaces) {
      translated = getNestedValue(locales[targetLang], `${ns}.${key}`);
      if (translated !== undefined) break;
    }
  }

  if (translated === undefined && targetLang !== 'tr') {
    translated = getNestedValue(locales['tr'], key);
    if (translated === undefined && !key.includes('.')) {
      for (const ns of namespaces) {
        translated = getNestedValue(locales['tr'], `${ns}.${key}`);
        if (translated !== undefined) break;
      }
    }
  }

  if (translated === undefined) {
    return key;
  }

  if (typeof translated === 'string' && params && typeof params === 'object') {
    Object.keys(params).forEach((paramKey) => {
      const value = params[paramKey];
      translated = translated.replace(new RegExp(`\\{${paramKey}\\}`, 'g'), value);
    });
  }

  return translated;
}

function getLocale(lang = 'tr') {
  const targetLang = supportedLanguages.includes(lang) ? lang : 'tr';
  if (targetLang === 'tr') {
    return locales['tr'] || {};
  }

  return mergeDeep({}, locales['tr'] || {}, locales[targetLang] || {});
}

module.exports = {
  translate,
  getLocale,
  supportedLanguages,
  loadLocales
};
