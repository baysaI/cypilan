const t = require('./helpers');

const Bid = require(t.rootDir + '/models/Bid');
const Listing = require(t.rootDir + '/models/Listing');

t.run('Teklif sistemi (Evini/Aracını Sat)', async (db) => {
  const owner = t.makeUser(db, 'owner@test.local', 'Ev Sahibi');
  const agentA = t.makeUser(db, 'a@test.local', 'Emlak A', 'agent');
  const agentB = t.makeUser(db, 'b@test.local', 'Emlak B', 'agent');
  const agentC = t.makeUser(db, 'c@test.local', 'Galeri C', 'business');
  const civilian = t.makeUser(db, 'civ@test.local', 'Sıradan Ali');

  // --- Kim teklif verebilir
  t.assert(!Bid.canBid('user'), 'Bireysel kullanıcı teklif veremiyor');
  t.assert(Bid.canBid('agent') && Bid.canBid('business'), 'Emlakçı ve galerici teklif verebiliyor');

  const listing = await Listing.create({
    user_id: owner, category_id: 101, title: 'Girne 3+1 Villa', slug: 'girne-villa',
    description: 'açıklama', price: 5000000, currency: 'TRY',
    listing_type: 'bid_request', status: 'active', city: 'Girne'
  });
  await Listing.create({
    user_id: owner, category_id: 101, title: 'Normal İlan', slug: 'normal-ilan',
    description: 'x', price: 100, status: 'active', city: 'Girne'
  });

  let open = await Bid.openRequests({}, 1, 20);
  t.assertEqual(open.total, 1, 'Yalnızca teklife açık ilan listeleniyor');

  // --- Teklifler
  await Bid.upsert({ listing_id: listing.id, bidder_id: agentA, amount: 4800000, message: 'Hızlı satarım' });
  await Bid.upsert({ listing_id: listing.id, bidder_id: agentB, amount: 5100000 });
  await Bid.upsert({ listing_id: listing.id, bidder_id: agentC, amount: 4950000 });

  let bids = await Bid.findForListing(listing.id);
  t.assertEqual(bids.length, 3, 'Üç profesyonelin teklifi kaydedildi');

  // --- Revizyon yeni satir acmamali
  await Bid.upsert({ listing_id: listing.id, bidder_id: agentA, amount: 5200000 });
  bids = await Bid.findForListing(listing.id);
  t.assertEqual(bids.length, 3, 'Teklif revizyonu yeni satır açmadı');
  t.assertEqual(
    bids.find((bid) => bid.bidder_id === agentA).amount, 5200000,
    'Revizyon tutarı güncellendi'
  );

  let dbRejected = false;
  try {
    db.prepare('INSERT INTO bids (listing_id, bidder_id, amount) VALUES (?, ?, ?)').run([listing.id, agentA, 1]);
  } catch (error) {
    dbRejected = error.code === 'SQLITE_CONSTRAINT_UNIQUE';
  }
  t.assert(dbRejected, 'Veritabanı mükerrer teklifi reddediyor');

  // --- Yetki kurallari
  t.assertRejected(await Bid.accept(bids[0].id, civilian), 'İlan sahibi olmayan teklifi kabul edemiyor');
  t.assertRejected(await Bid.reject(bids[0].id, civilian), 'İlan sahibi olmayan teklifi reddedemiyor');
  t.assertRejected(
    await Bid.withdraw(bids.find((bid) => bid.bidder_id === agentB).id, agentA),
    'Bir profesyonel başkasının teklifini geri çekemiyor'
  );

  // --- Kabul: tek islemde hepsi
  const winner = bids.find((bid) => bid.bidder_id === agentB);
  t.assert(await Bid.accept(winner.id, owner), 'İlan sahibi teklifi kabul etti');

  bids = await Bid.findForListing(listing.id);
  t.assertEqual(bids.filter((bid) => bid.status === 'accepted').length, 1, 'Tam olarak bir teklif kabul edilmiş');
  t.assertEqual(bids.filter((bid) => bid.status === 'rejected').length, 2, 'Diğer teklifler otomatik reddedildi');

  const afterListing = await Listing.findById(listing.id);
  // Kabul, ilani kapatmiyor: bir usta hizmeti ya da tedarikci ilani tek
  // musteriyle tukenmiyor. Gercekten tukenen bir sey satildiysa karari
  // sahibi duzenleme ekranindan veriyor.
  t.assertEqual(afterListing.status, 'active', 'İlan kabul sonrası yayında kalıyor');

  open = await Bid.openRequests({}, 1, 20);
  t.assertEqual(open.total, 1, 'İlan teklif listesinde kalmaya devam ediyor');

  // --- Kategoriye gore ayrim: tek aliciya giden bir ilanda secim yapilmasi
  // otekileri gecersiz kiliyor, bir hizmet ilaninda kilmiyor.
  const usta = t.makeUser(db, 'usta@test.local', 'Usta');
  const m1 = t.makeUser(db, 'musteri1@test.local', 'Müşteri 1');
  const m2 = t.makeUser(db, 'musteri2@test.local', 'Müşteri 2');

  const hizmet = await Listing.create({
    user_id: usta, category_id: 401, title: 'Boya Badana', slug: 'boya-badana-test',
    description: 'usta hizmeti', price: 500, currency: 'GBP', status: 'active', city: 'Girne'
  });

  await Bid.submitQuickOffer({ listing_id: hizmet.id, bidder_id: m1, amount: 450, currency: 'GBP' });
  await Bid.submitQuickOffer({ listing_id: hizmet.id, bidder_id: m2, amount: 480, currency: 'GBP' });

  const hizmetBids = await Bid.findForListing(hizmet.id);
  await Bid.accept(hizmetBids[0].id, usta);

  const sonrasi = await Bid.findForListing(hizmet.id);
  t.assertEqual(sonrasi.filter((b) => b.status === 'accepted').length, 1, 'Hizmet ilanında teklif kabul ediliyor');
  t.assertEqual(sonrasi.filter((b) => b.status === 'pending').length, 1, 'Hizmet ilanında diğer teklif bekleyen kalıyor');
  t.assertEqual(sonrasi.filter((b) => b.status === 'rejected').length, 0, 'Hizmet ilanında otomatik reddetme yok');
  t.assertEqual((await Listing.findById(hizmet.id)).status, 'active', 'Hizmet ilanı yayında kalıyor');
  t.assertEqual(await Bid.countPendingForOwner(owner), 0, 'Bekleyen teklif sayacı sıfırlandı');

  // --- Sablonlar
  const receivedHtml = await t.render('bids/received.ejs', {
    groups: [{
      listingTitle: 'Girne 3+1 Villa', listingSlug: 'girne-villa',
      listingStatus: 'sold', bids
    }],
    title: 'test',
    user: { id: owner, name: 'Ev Sahibi' }
  });
  t.assert(receivedHtml.includes('Aldığım Teklifler'), 'bids/received.ejs render ediliyor');
  t.assert(receivedHtml.includes('Sonuçlandı'), 'Sonuçlanan ilan doğru rozetle gösteriliyor');

  const mineHtml = await t.render('bids/mine.ejs', {
    bids: await Bid.findByBidder(agentB), title: 'test', user: { id: agentB, name: 'Emlak B' }
  });
  t.assert(mineHtml.includes('Teklifin kabul edildi'), 'Kazanan profesyonel sonucu görüyor');

  const openHtml = await t.render('bids/open.ejs', {
    requests: [], pagination: { currentPage: 1, totalPages: 1, totalItems: 0 },
    categories: [], filters: {}, myBidListingIds: [], title: 'test',
    user: { id: agentA, name: 'Emlak A' }
  });
  t.assert(openHtml.includes('Teklif Bekleyen'), 'bids/open.ejs render ediliyor');

  const allLangs = ['tr', 'en', 'el', 'ru', 'fa'].every((lang) =>
    ['bids.make_offer', 'bids.accept_confirm', 'flash.bid_professionals_only']
      .every((key) => t.translate(key, lang) !== key)
  );
  t.assert(allLangs, 'bids.* anahtarları 5 dilde çözülüyor');
});
