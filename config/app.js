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
    default: 'GBP'
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
    maxFileSize: 15 * 1024 * 1024,
    allowedImageTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/jpg', 'image/pjpeg', 'image/x-png'],
    maxImagesPerListing: 20
  },

  analytics: {
    // Sayfa goruntuleme kayitlarinin saklama suresi.
    //
    // Onceden sinir yoktu: page_views tablosu hic silinmiyordu. Panelde en uzun
    // pencere bir yil, yani bir yildan eski kayitlar hicbir sey gostermiyor ama
    // duruyordu. Saklama suresi olmayan veri, amaci bitmis veridir.
    //
    // Bir yil + otuz gun: yillik ozet, ayin son gununde de tam bir yili
    // gorebilsin diye.
    retentionDays: 395
  }
};
