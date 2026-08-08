module.exports = {
  app: {
    name: 'CYPILAN.COM',
    domain: 'cypilan.com',
    supportEmail: 'support@cypilan.com'
  },
  
  languages: {
    supported: ['tr', 'en', 'el', 'ru', 'fa'],
    default: 'tr'
  },
  
  currencies: {
    supported: ['TRY', 'GBP'],
    default: 'TRY'
  },
  
  listings: {
    types: ['sale', 'rent', 'job', 'service', 'bid_request'],
    statuses: ['pending', 'active', 'sold', 'expired', 'rejected', 'draft']
  },
  
  roles: {
    available: ['user', 'business', 'agent', 'admin'],
    default: 'user'
  },
  
  pagination: {
    defaultLimit: 20,
    maxLimit: 100
  },
  
  uploads: {
    maxFileSize: 5 * 1024 * 1024, // 5MB
    allowedImageTypes: ['image/jpeg', 'image/png', 'image/webp'],
    maxImagesPerListing: 20
  }
};
