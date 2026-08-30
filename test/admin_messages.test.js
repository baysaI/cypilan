const t = require('./helpers');

const Message = require(t.rootDir + '/models/Message');

const send = (db, from, to, listingId, content) => db.prepare(
  'INSERT INTO messages (sender_id, receiver_id, listing_id, content) VALUES (?, ?, ?, ?)'
).run([from, to, listingId, content]);

t.run('Yönetici mesajlaşma görünümü', async (db) => {
  const ali = t.makeUser(db, 'ali@test.local', 'Ali Alıcı');
  const veli = t.makeUser(db, 'veli@test.local', 'Veli Satıcı');
  const zeynep = t.makeUser(db, 'zeynep@test.local', 'Zeynep Kaya');

  const categoryId = Number(db.prepare('SELECT id FROM categories LIMIT 1').get().id);
  const listingId = Number(db.prepare(`
    INSERT INTO listings (user_id, category_id, title, slug, description, status)
    VALUES (?, ?, ?, ?, ?, 'active')
  `).run([veli, categoryId, 'Girne 2+1 Daire', 'girne-2-1-daire', 'açıklama']).lastInsertRowid);

  // --- Bos durum hicbir sey uydurmamali
  const empty = Message.adminStats();
  t.assertEqual(empty.totalMessages, 0, 'Mesaj yokken toplam sıfır');
  t.assertEqual(empty.conversations, 0, 'Mesaj yokken sohbet yok');
  t.assertEqual(Message.adminConversations({}).total, 0, 'Boş listede sohbet yok');

  // İlan üzerinden karşılıklı bir sohbet
  send(db, ali, veli, listingId, 'Merhaba, daire hâlâ müsait mi?');
  send(db, veli, ali, listingId, 'Evet müsait, ne zaman görmek istersiniz?');
  send(db, ali, veli, listingId, 'Yarın öğleden sonra uygun mu?');
  // İlan dışı, cevapsız kalmış bir sohbet
  send(db, zeynep, veli, null, 'Başka ilanlarınız var mı?');

  // --- Ozet
  const stats = Message.adminStats();
  t.assertEqual(stats.totalMessages, 4, 'Toplam mesaj sayılıyor');
  t.assertEqual(stats.senders, 3, 'Farklı gönderen sayılıyor');
  t.assertEqual(stats.conversations, 2, 'Sohbet = aynı iki kişi + aynı ilan');

  // Asil olcu bu: toplam mesaj sayisi tek yonlu yazismalarla da sisebilir,
  // "cevap geliyor mu" sorusunu yalnizca bu sayi cevapliyor.
  t.assertEqual(stats.twoWayConversations, 1, 'Yalnızca cevap alan sohbetler iki taraflı sayılıyor');
  t.assertEqual(stats.lastWeek, 4, 'Son 7 gün penceresi çalışıyor');

  // --- Sohbet listesi
  const list = Message.adminConversations({ page: 1, limit: 25 });
  t.assertEqual(list.total, 2, 'İki sohbet listeleniyor');

  const onListing = list.data.find((r) => r.listing_id === listingId);
  t.assert(Boolean(onListing), 'İlan üzerinden sohbet listede');
  t.assertEqual(onListing.message_count, 3, 'Mesaj sayısı doğru');
  t.assertEqual(onListing.sides, 2, 'İki taraflı olduğu işaretli');
  t.assertEqual(onListing.last_content, 'Yarın öğleden sonra uygun mu?', 'Son mesaj önizlemesi doğru');
  t.assertEqual(onListing.listing_title, 'Girne 2+1 Daire', 'İlan başlığı geliyor');

  // A'dan B'ye ve B'den A'ya giden mesajlar tek sohbet: taraflar siralanmasa
  // her yazisma listede iki kez gorunurdu.
  t.assert(onListing.user_a < onListing.user_b, 'Taraflar sıralı tutuluyor');

  const oneWay = list.data.find((r) => r.listing_id === null);
  t.assertEqual(oneWay.sides, 1, 'Cevapsız sohbet tek taraflı işaretli');

  // --- Arama
  t.assertEqual(Message.adminConversations({ q: 'Zeynep' }).total, 1, 'İsimle aranıyor');
  t.assertEqual(Message.adminConversations({ q: 'veli@test.local' }).total, 2, 'E-posta ile aranıyor');
  t.assertEqual(Message.adminConversations({ q: 'Girne' }).total, 1, 'İlan başlığıyla aranıyor');

  // Arama sohbetin tamamina bakmali. Yalnizca son mesaja bakan bir arama
  // sessizce yaniltiyordu: aranan kelime konusmanin ortasinda geciyorsa
  // yonetici o yazismayi hic gormuyordu.
  t.assertEqual(
    Message.adminConversations({ q: 'müsait' }).total, 1,
    'Mesaj içeriği aranırken sohbetin tamamına bakılıyor, son mesaja değil'
  );
  t.assertEqual(Message.adminConversations({ q: 'bulunmayan' }).total, 0, 'Eşleşmeyen arama boş dönüyor');
  t.assertEqual(
    Message.adminConversations({ q: "' OR 1=1 --" }).total, 0,
    'Tırnak içeren arama sorguyu kırmıyor'
  );

  // --- Sayfalama
  const firstPage = Message.adminConversations({ page: 1, limit: 1 });
  t.assertEqual(firstPage.data.length, 1, 'Sayfa boyutu uygulanıyor');
  t.assertEqual(firstPage.pages, 2, 'Sayfa sayısı doğru');
  t.assertEqual(Message.adminConversations({ page: 99, limit: 1 }).data.length, 0, 'Olmayan sayfa boş');
  t.assertEqual(Message.adminConversations({ page: -5, limit: 0 }).page, 1, 'Geçersiz sayfa 1\'e çekiliyor');

  // --- Gunluk dagilim
  const daily = Message.adminDailyCounts(14);
  t.assertEqual(daily.length, 1, 'Aynı gün tek satırda toplanıyor');
  t.assertEqual(daily[0].total, 4, 'Gün toplamı doğru');

  // --- Sohbet detayi ilan bazinda ayrisiyor
  const thread = await Message.getConversation(ali, veli, listingId, 500, 0);
  t.assertEqual(thread.length, 3, 'İlan sohbeti eksiksiz geliyor');
  t.assertEqual(thread[0].content, 'Merhaba, daire hâlâ müsait mi?', 'Kronolojik sırada');

  const offListing = await Message.getConversation(zeynep, veli, null, 500, 0);
  t.assertEqual(offListing.length, 1, 'İlan dışı yazışma ayrı bir sohbet');

  // --- Sablonlar
  const html = await t.render('admin/messages.ejs', {
    stats,
    daily,
    conversations: list,
    filters: { q: '' },
    title: 'test'
  });
  t.assert(html.includes('Ali Alıcı'), 'Sohbet tarafları basılıyor');
  t.assert(html.includes('Girne 2+1 Daire'), 'İlan başlığı basılıyor');
  t.assert(html.includes('cevapsız'), 'Cevapsız sohbet işaretleniyor');
  t.assert(html.includes('%50'), 'Cevap oranı hesaplanıyor');
  t.assert(html.includes('gizlilik politikasında'), 'Yetkinin nerede açıklandığı sayfada yazıyor');

  const emptyHtml = await t.render('admin/messages.ejs', {
    stats: empty,
    daily: [],
    conversations: { data: [], total: 0, page: 1, pages: 1 },
    filters: { q: '' },
    title: 'test'
  });
  t.assert(emptyHtml.includes('Henüz hiç mesajlaşma yok'), 'Boş durum metni var');
  t.assert(!emptyHtml.includes('NaN'), 'Boş veride NaN basılmıyor');

  const threadHtml = await t.render('admin/messageThread.ejs', {
    partyA: { id: ali, full_name: 'Ali Alıcı', company_name: null, email: 'ali@test.local' },
    partyB: { id: veli, full_name: 'Veli Satıcı', company_name: null, email: 'veli@test.local' },
    listingId,
    messages: thread,
    title: 'test'
  });
  t.assert(threadHtml.includes('Merhaba, daire hâlâ müsait mi?'), 'Sohbet mesajları basılıyor');
  t.assert(threadHtml.includes('Yalnızca inceleme'), 'Sayfanın yalnızca inceleme olduğu yazıyor');
});
