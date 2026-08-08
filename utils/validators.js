/**
 * Validation and Sanitization Utilities for CYPILAN.COM
 * 
 * Includes validators for user input, authentication credentials,
 * marketplace listing data, phone numbers (TR/CY), and security sanitization.
 */

/**
 * Validates email address format.
 * 
 * @param {string} email - Email address string
 * @returns {boolean} True if valid email format
 */
function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const regex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return regex.test(email.trim());
}

/**
 * Validates phone numbers supporting TR (Turkey) and CY (North/South Cyprus) formats.
 * Accepts formats like: +90 533 123 4567, 0533 123 4567, +357 99 123456, 99123456.
 * 
 * @param {string} phone - Phone number string
 * @returns {boolean} True if valid TR/CY or international phone format
 */
function isValidPhone(phone) {
  if (!phone || typeof phone !== 'string') return false;
  
  // Clean all whitespace, dashes, brackets
  const cleaned = phone.replace(/[\s\-\(\)\.]/g, '');

  // Check TR/NCY format: +905xx..., 05xx..., 5xx... (10 to 12 digits)
  const trCyNorthRegex = /^(\+?90|0)?5[0-9]{9}$/;

  // Check South Cyprus format: +3579x..., 003579x..., 9x... (8 to 11 digits)
  const cySouthRegex = /^(\+?357|00357)?[279][0-9]{7}$/;

  // Generic international fallback format (8 to 15 digits starting optional +)
  const genericIntlRegex = /^\+?[1-9][0-9]{7,14}$/;

  return trCyNorthRegex.test(cleaned) || cySouthRegex.test(cleaned) || genericIntlRegex.test(cleaned);
}

/**
 * Validates password strength: minimum 8 characters, at least 1 uppercase letter and 1 digit.
 * 
 * @param {string} password - Password string
 * @returns {boolean} True if meets password strength requirements
 */
function isValidPassword(password) {
  if (!password || typeof password !== 'string') return false;
  // Min 8 chars, 1 uppercase, 1 number
  const regex = /^(?=.*[A-Z])(?=.*\d).{8,}$/;
  return regex.test(password);
}

/**
 * Validates if value is a non-negative number suitable for a price.
 * 
 * @param {number|string} price - Price value
 * @returns {boolean} True if valid non-negative number
 */
function isValidPrice(price) {
  if (price === null || price === undefined || price === '') return false;
  const num = Number(price);
  return !isNaN(num) && num >= 0;
}

/**
 * Validates slug format (lowercase alphanumeric separated by single hyphens).
 * 
 * @param {string} slug - Slug string
 * @returns {boolean} True if valid slug format
 */
function isValidSlug(slug) {
  if (!slug || typeof slug !== 'string') return false;
  const regex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  return regex.test(slug.trim());
}

/**
 * Recursively sanitizes input strings to prevent XSS and injection attacks.
 * 
 * @param {*} input - String, object, array, or primitive input
 * @returns {*} Sanitized output of same type
 */
function sanitizeInput(input) {
  if (typeof input === 'string') {
    return input
      .trim()
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  if (Array.isArray(input)) {
    return input.map(item => sanitizeInput(item));
  }

  if (input !== null && typeof input === 'object') {
    const sanitizedObj = {};
    for (const key in input) {
      if (Object.prototype.hasOwnProperty.call(input, key)) {
        sanitizedObj[key] = sanitizeInput(input[key]);
      }
    }
    return sanitizedObj;
  }

  return input;
}

/**
 * Validates a classified listing data payload.
 * 
 * @param {Object} data - Listing data object
 * @returns {{ isValid: boolean, errors: Object.<string, string> }} Validation result and error messages
 */
function validateListing(data) {
  const errors = {};

  if (!data || typeof data !== 'object') {
    return { isValid: false, errors: { _general: 'Geçersiz veri formatı' } };
  }

  // Title validation
  if (!data.title || typeof data.title !== 'string' || data.title.trim().length < 3) {
    errors.title = 'İlan başlığı en az 3 karakter olmalıdır';
  } else if (data.title.trim().length > 150) {
    errors.title = 'İlan başlığı en fazla 150 karakter olabilir';
  }

  // Description validation
  if (!data.description || typeof data.description !== 'string' || data.description.trim().length < 10) {
    errors.description = 'İlan açıklaması en az 10 karakter olmalıdır';
  }

  // Price validation
  if (!isValidPrice(data.price)) {
    errors.price = 'Geçerli bir fiyat giriniz';
  }

  // Currency validation (optional, default TRY)
  const validCurrencies = ['TRY', 'TL', 'GBP', 'EUR', 'USD'];
  if (data.currency && !validCurrencies.includes(String(data.currency).toUpperCase())) {
    errors.currency = 'Geçersiz para birimi';
  }

  // Category validation
  if (!data.category && !data.category_id) {
    errors.category = 'Lütfen bir kategori seçin';
  }

  // City validation
  if (!data.city || typeof data.city !== 'string' || !data.city.trim()) {
    errors.city = 'Lütfen bir şehir seçin';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
}

/**
 * Validates a user registration or profile update payload.
 * 
 * @param {Object} data - User data object
 * @param {boolean} [isUpdate=false] - True if validating profile update (makes password optional)
 * @returns {{ isValid: boolean, errors: Object.<string, string> }} Validation result and error messages
 */
function validateUser(data, isUpdate = false) {
  const errors = {};

  if (!data || typeof data !== 'object') {
    return { isValid: false, errors: { _general: 'Geçersiz veri formatı' } };
  }

  // Email validation
  if (!isValidEmail(data.email)) {
    errors.email = 'Geçerli bir e-posta adresi giriniz';
  }

  // Password validation (required for registration, optional for update)
  if (!isUpdate || data.password) {
    if (!isValidPassword(data.password)) {
      errors.password = 'Şifre en az 8 karakter olmalı, 1 büyük harf ve 1 rakam içermelidir';
    }
  }

  // Password confirmation check if confirm_password provided
  if (data.confirm_password !== undefined && data.password !== data.confirm_password) {
    errors.confirm_password = 'Şifreler birbiriyle eşleşmiyor';
  }

  // Full name validation
  if (!data.full_name || typeof data.full_name !== 'string' || data.full_name.trim().length < 2) {
    errors.full_name = 'Ad Soyad en az 2 karakter olmalıdır';
  }

  // Phone validation (optional, but must be valid if supplied)
  if (data.phone && !isValidPhone(data.phone)) {
    errors.phone = 'Geçerli bir Kıbrıs veya Türkiye telefon numarası giriniz';
  }

  // Account type validation
  if (data.account_type && !['individual', 'business'].includes(data.account_type)) {
    errors.account_type = 'Geçersiz hesap türü';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
}

module.exports = {
  isValidEmail,
  isValidPhone,
  isValidPassword,
  isValidPrice,
  isValidSlug,
  sanitizeInput,
  validateListing,
  validateUser
};
