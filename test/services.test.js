const t = require('./helpers');

const ServiceRequest = require(t.rootDir + '/models/ServiceRequest');
const Listing = require(t.rootDir + '/models/Listing');
const listingDraft = require(t.rootDir + '/utils/listingDraft');

const translate = (key, params) => t.translate(key, 'tr', params);

t.run('Hizmet talepleri ve açıklama taslağı', async (db) => {
  const owner = t.makeUser(db, 'owner@test.local', 'Sahip');

  const listing = await Listing.create({
    user_id: owner, category_id: 101, title: 'Girne Villa', slug: 'girne-villa',
    description: 'açıklama', price: 5000000, status: 'active', city: 'Girne'
  });

  // --- Talep olusturma kurallari
  const first = await ServiceRequest.create({
    user_id: owner, listing_id: listing.id, type: 'promotion', note: 'Acil'
  });
  t.assert(Boolean(first), 'Öne çıkarma talebi oluşturuluyor');

  t.assertRejected(
    await ServiceRequest.create({ user_id: owner, listing_id: listing.id, type: 'promotion' }),
    'Aynı ilana ikinci açık talep açılamıyor'
  );

  t.assert(
    Boolean(await ServiceRequest.create({ user_id: owner, listing_id: listing.id, type: 'assurance' })),
    'Farklı hizmet türü için ayrı talep açılabiliyor'
  );

  t.assertRejected(
    await ServiceRequest.create({ user_id: owner, listing_id: listing.id, type: 'bogus' }),
    'Geçersiz hizmet türü reddediliyor'
  );

  // --- Onay ilani gercekten one cikarmali
  let current = await Listing.findById(listing.id);
  t.assertEqual(Number(current.is_featured), 0, 'İlan başlangıçta öne çıkarılmamış');

  await ServiceRequest.setStatus(first.id, 'approved', 'Onaylandı');
  current = await Listing.findById(listing.id);
  t.assertEqual(Number(current.is_featured), 1, 'Talep onaylanınca ilan gerçekten öne çıkıyor');

  await ServiceRequest.setStatus(first.id, 'rejected');
  current = await Listing.findById(listing.id);
  t.assertEqual(Number(current.is_featured), 0, 'Talep reddedilince öne çıkarma geri alınıyor');

  t.assert(
    Boolean(await ServiceRequest.create({ user_id: owner, listing_id: listing.id, type: 'promotion' })),
    'Sonuçlanmış talepten sonra yeni talep açılabiliyor'
  );
  t.assert(await ServiceRequest.countPending() >= 1, 'Bekleyen talep sayacı çalışıyor');

  // --- Taslak ureticisi girilen bilgiyi kullanmali
  const draft = listingDraft.build({
    rootSlug: 'emlak', categoryName: 'Satılık Villa', cityName: 'Girne',
    district: 'Karaoğlanoğlu', rooms: '4+1', size: '220', floor: '2', buildYear: '2020',
    features: ['havuz', 'deniz_manzara', 'otopark']
  }, translate);

  const usesAll = ['4+1', '220', 'Girne', 'Karaoğlanoğlu', '2020', 'Havuzlu', 'Deniz manzaralı']
    .every((needle) => draft.includes(needle));
  t.assert(usesAll, 'Taslak girilen bilgilerin hepsini kullanıyor');

  // En kritik kural: verilmeyen ozellik taslakta gorunmemeli. Sessizce ozellik
  // ekleyen bir aciklama, platformun uzerinde adi olan yaniltici bir ilandir.
  const bare = listingDraft.build({
    rootSlug: 'emlak', categoryName: 'Satılık Daire', cityName: 'Lefkoşa', features: []
  }, translate);
  const inventsNothing = ['Havuz', 'Deniz manzara', 'Otopark', 'Eşyalı', 'Balkon']
    .every((invented) => !bare.includes(invented));
  t.assert(inventsNothing, 'Girilmeyen özellik taslakta uydurulmuyor');

  const vehicle = listingDraft.build({
    rootSlug: 'vasita', categoryName: 'Otomobil', cityName: 'Gazimağusa',
    brand: 'Toyota', model: 'Corolla', year: '2019', km: '85000',
    features: ['otomatik', 'hasarsiz']
  }, translate);
  t.assert(
    vehicle.includes('Toyota') && vehicle.includes('85000') && vehicle.includes('Otomatik vites'),
    'Vasıta taslağı marka, kilometre ve özellikleri kullanıyor'
  );

  const generic = listingDraft.build(
    { rootSlug: 'ikinci-el', categoryName: 'Mobilya', cityName: 'İskele' }, translate
  );
  t.assert(generic.includes('Mobilya'), 'Şablonu olmayan kategoride genel taslak üretiliyor');

  t.assert(
    !listingDraft.featuresFor('emlak').includes('otomatik'),
    'Özellik listesi kategoriye göre ayrışıyor'
  );

  // --- Sablonlar
  const mineHtml = await t.render('service/mine.ejs', {
    requests: await ServiceRequest.findForUser(owner), title: 'test',
    user: { id: owner, name: 'Sahip' }
  });
  t.assert(mineHtml.includes('Hizmet Taleplerim'), 'service/mine.ejs render ediliyor');

  const all = await ServiceRequest.findAll({}, 1, 20);
  const adminHtml = await t.render('admin/services.ejs', {
    requests: all.data,
    pagination: { page: 1, totalItems: all.total, totalPages: all.pages },
    filters: {}, statuses: ServiceRequest.STATUSES, types: ServiceRequest.TYPES,
    title: 'test', user: { id: owner, name: 'Sahip' }
  });
  t.assert(adminHtml.includes('Hizmet Talepleri'), 'admin/services.ejs render ediliyor');

  const allLangs = ['tr', 'en', 'el', 'ru', 'fa'].every((lang) =>
    ['service.type_assurance', 'service.notify_approved', 'draft.generate', 'investors.title', 'draft.features.havuz']
      .every((key) => t.translate(key, lang) !== key)
  );
  t.assert(allLangs, 'service.* / draft.* / investors.* 5 dilde çözülüyor');
});
