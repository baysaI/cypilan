// Form değerlerinden, ilan kartının bekleneceği şekle sahip geçici bir ilan
// nesnesi kurar.
//
// Kart partial'ı gerçek bir veritabanı satırı bekliyor; eksik bir alan orada
// render hatasına dönüşüyor ve önizleme sessizce hiç gelmiyor. Bu yüzden nesne
// tek yerde kuruluyor ve test edilebiliyor: yeni bir alan karta eklendiğinde
// önizlemenin de onu vermesi gerektiği burada görünür.
//
// Kaydedilmiş bir ilan değil bu: id ve slug boş, tarihler yok. Kart bunlarla
// baş edebiliyor ve önizlemedeki bağlantılar zaten tıklanamaz durumda.

const buildPreviewListing = (body = {}, options = {}) => {
  const { category = null, rootSlug = null, lang = 'tr', currency = 'GBP', untitled = '' } = options;
  const price = Number(body.price);
  const categoryName = category ? (category['name_' + lang] || category.name_tr || '') : '';

  const listing = {
    id: 0,
    slug: '',
    title: String(body.title || '').trim() || untitled,
    price: Number.isFinite(price) && price > 0 ? price : null,
    currency: body.currency || currency,
    city: body.city || '',
    district: body.district || '',
    category_id: category ? category.id : null,
    category_name: categoryName,
    category_slug: rootSlug || (category ? category.slug : ''),
    root_slug: rootSlug || '',
    listing_type: body.listing_type || 'sale',
    is_premium: 0,
    is_urgent: body.is_urgent ? 1 : 0,
    is_opportunity: body.is_opportunity ? 1 : 0,
    is_negotiable: body.is_negotiable ? 1 : 0,
    is_swap: body.is_swap ? 1 : 0,
    // Fotoğraflar henüz yüklenmedi; kart yalnızca sayıyı gösteriyor, görseli
    // tarayıcı kendi seçtiği dosyadan koyuyor.
    image_count: Number(body.image_count) || 0,
    images: [],
    created_at: null,
    boosted_at: null
  };

  // Kart, dilin adını ayrı bir alandan okuyor.
  listing['category_name_' + lang] = categoryName;

  return listing;
};

module.exports = { buildPreviewListing };
