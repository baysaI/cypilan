function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const regex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return regex.test(email.trim());
}

function isValidPhone(phone) {
  if (!phone || typeof phone !== 'string') return false;

  const cleaned = phone.replace(/[\s\-\(\)\.]/g, '');

  const trCyNorthRegex = /^(\+?90|0)?5[0-9]{9}$/;

  const cySouthRegex = /^(\+?357|00357)?[279][0-9]{7}$/;

  const genericIntlRegex = /^\+?[1-9][0-9]{7,14}$/;

  return trCyNorthRegex.test(cleaned) || cySouthRegex.test(cleaned) || genericIntlRegex.test(cleaned);
}

function isValidPassword(password) {
  if (!password || typeof password !== 'string') return false;
  const regex = /^(?=.*[A-Z])(?=.*\d).{8,}$/;
  return regex.test(password);
}

function isValidPrice(price) {
  if (price === null || price === undefined || price === '') return false;
  const num = Number(price);
  return !isNaN(num) && num >= 0;
}

function isValidSlug(slug) {
  if (!slug || typeof slug !== 'string') return false;
  const regex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  return regex.test(slug.trim());
}

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

function validateListing(data) {
  const errors = {};

  if (!data || typeof data !== 'object') {
    return { isValid: false, errors: { _general: 'Geçersiz veri formatı' } };
  }

  if (!data.title || typeof data.title !== 'string' || data.title.trim().length < 3) {
    errors.title = 'İlan başlığı en az 3 karakter olmalıdır';
  } else if (data.title.trim().length > 150) {
    errors.title = 'İlan başlığı en fazla 150 karakter olabilir';
  }

  if (!data.description || typeof data.description !== 'string' || data.description.trim().length < 10) {
    errors.description = 'İlan açıklaması en az 10 karakter olmalıdır';
  }

  if (!isValidPrice(data.price)) {
    errors.price = 'Geçerli bir fiyat giriniz';
  }

  const validCurrencies = ['TRY', 'TL', 'GBP', 'EUR', 'USD'];
  if (data.currency && !validCurrencies.includes(String(data.currency).toUpperCase())) {
    errors.currency = 'Geçersiz para birimi';
  }

  if (!data.category && !data.category_id) {
    errors.category = 'Lütfen bir kategori seçin';
  }

  if (!data.city || typeof data.city !== 'string' || !data.city.trim()) {
    errors.city = 'Lütfen bir şehir seçin';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
}

function validateUser(data, isUpdate = false) {
  const errors = {};

  if (!data || typeof data !== 'object') {
    return { isValid: false, errors: { _general: 'Geçersiz veri formatı' } };
  }

  if (!isValidEmail(data.email)) {
    errors.email = 'Geçerli bir e-posta adresi giriniz';
  }

  if (!isUpdate || data.password) {
    if (!isValidPassword(data.password)) {
      errors.password = 'Şifre en az 8 karakter olmalı, 1 büyük harf ve 1 rakam içermelidir';
    }
  }

  if (data.confirm_password !== undefined && data.password !== data.confirm_password) {
    errors.confirm_password = 'Şifreler birbiriyle eşleşmiyor';
  }

  if (!data.full_name || typeof data.full_name !== 'string' || data.full_name.trim().length < 2) {
    errors.full_name = 'Ad Soyad en az 2 karakter olmalıdır';
  }

  if (data.phone && !isValidPhone(data.phone)) {
    errors.phone = 'Geçerli bir Kıbrıs veya Türkiye telefon numarası giriniz';
  }

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
