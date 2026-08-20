const t = require('./helpers');

const Broadcast = require(t.rootDir + '/models/Broadcast');
const Notification = require(t.rootDir + '/models/Notification');
const broadcastController = require(t.rootDir + '/controllers/broadcastController');

const makeReq = (overrides = {}) => Object.assign({
  session: { userId: 1 },
  body: {}, query: {}, params: {},
  flashes: [],
  flash(type, message, params) { this.flashes.push({ type, message, params }); },
  get: () => null
}, overrides);

const makeRes = () => ({
  locals: { meta: {} },
  redirect(url) { this.redirectedTo = url; },
  render(view, locals) { this.rendered = { view, locals }; }
});

const setUser = (db, id, { role = 'user', lang = 'tr', active = 1 } = {}) =>
  db.prepare('UPDATE users SET role = ?, language_pref = ?, is_active = ? WHERE id = ?').run([role, lang, active, id]);

t.run('Admin duyuru gönderimi', async (db) => {
  const admin = t.makeUser(db, 'admin@test.local', 'Yönetici', 'admin');
  const memberTr = t.makeUser(db, 'tr@test.local', 'Türkçe Üye');
  const memberEn = t.makeUser(db, 'en@test.local', 'English Member');
  const company = t.makeUser(db, 'firma@test.local', 'Firma', 'business');
  const suspended = t.makeUser(db, 'askida@test.local', 'Askıda Üye');

  setUser(db, admin, { role: 'admin' });
  setUser(db, memberTr, { lang: 'tr' });
  setUser(db, memberEn, { lang: 'en' });
  setUser(db, company, { role: 'business', lang: 'tr' });
  setUser(db, suspended, { active: 0 });

  // --- Tablo
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='broadcasts'").all();
  t.assertEqual(tables.length, 1, 'broadcasts tablosu şemada oluşuyor');

  // --- Alici cozumleme
  const all = Broadcast.resolveRecipients({ audience: 'all' });
  t.assertEqual(all.ids.length, 4, 'Tüm kitlede yalnızca aktif hesaplar var (askıdaki hariç)');
  t.assert(!all.ids.includes(suspended), 'Askıya alınmış hesap alıcı listesinde yok');

  t.assertEqual(
    Broadcast.resolveRecipients({ audience: 'role', role: 'business' }).ids.join(),
    String(company),
    'Role göre hedefleme doğru hesabı buluyor'
  );
  t.assertEqual(
    Broadcast.resolveRecipients({ audience: 'role', role: 'gecersiz' }).ids.length,
    0,
    'Tanımsız rol kimseye gitmiyor'
  );

  const trAudience = Broadcast.resolveRecipients({ audience: 'language', language: 'tr' });
  t.assert(
    trAudience.ids.includes(memberTr) && trAudience.ids.includes(company) && !trAudience.ids.includes(memberEn),
    'Dile göre hedefleme yalnızca o dili okuyanlara gidiyor'
  );

  // language_pref bos olan eski kayitlar Turkce sayilmali
  const legacy = t.makeUser(db, 'eski@test.local', 'Eski Kayıt');
  db.prepare('UPDATE users SET language_pref = NULL WHERE id = ?').run([legacy]);
  t.assert(
    Broadcast.resolveRecipients({ audience: 'language', language: 'tr' }).ids.includes(legacy),
    'Dil tercihi boş olan hesap Türkçe kitleye dahil (site varsayılanı)'
  );

  const specific = Broadcast.resolveRecipients({
    audience: 'specific',
    emails: 'TR@test.local, yok@hicbiryerde.com\nfirma@test.local'
  });
  t.assertEqual(specific.ids.length, 2, 'Belirli e-posta hedeflemesi eşleşenleri buluyor (büyük/küçük harf duyarsız)');
  t.assertEqual(specific.unmatched.join(), 'yok@hicbiryerde.com', 'Eşleşmeyen adres sessizce yutulmuyor');

  t.assertEqual(
    Broadcast.resolveRecipients({ audience: 'specific', emails: 'askida@test.local' }).ids.length,
    0,
    'Askıdaki hesap e-posta ile bile hedeflenemiyor'
  );

  // --- Gonderim
  const result = await Broadcast.send({
    title: 'Yeni kategori yayında',
    message: 'Kurumsal Tedarikçi Ağı kategorisi artık kullanımda. Toptan ve inşaat malzemeleri için ilan açabilirsiniz.',
    link_url: '/listings?category=kurumsal-tedarikci',
    audience: 'all',
    sent_by: admin
  });

  t.assertEqual(result.sent, 5, 'Duyuru tüm aktif üyelere gönderildi');

  const trInbox = await Notification.getByUserId(memberTr);
  t.assertEqual(trInbox.length, 1, 'Üyenin bildirim listesine düştü');
  t.assertEqual(trInbox[0].type, 'announcement', 'Bildirim türü announcement');
  t.assertEqual(trInbox[0].title, 'Yeni kategori yayında', 'Başlık aynen iletiliyor');
  t.assertEqual(trInbox[0].link_url, '/listings?category=kurumsal-tedarikci', 'Bağlantı saklanıyor');
  t.assertEqual(Number(trInbox[0].is_read), 0, 'Okunmamış olarak başlıyor');
  t.assertEqual(trInbox[0].actor_id, admin, 'Gönderen yönetici kaydediliyor');

  t.assertEqual(
    (await Notification.getByUserId(suspended)).length,
    0,
    'Askıdaki hesaba bildirim yazılmadı'
  );

  // --- Gecmis kaydi
  const history = await Broadcast.history();
  t.assertEqual(history.length, 1, 'Gönderim geçmişe kaydediliyor');
  t.assertEqual(history[0].recipient_count, 5, 'Geçmiş alıcı sayısını tutuyor');
  t.assertEqual(history[0].audience, 'all', 'Geçmiş hedef kitleyi tutuyor');
  t.assertEqual(history[0].sent_by_name, 'Yönetici', 'Geçmiş göndereni çözüyor');

  const stats = await Broadcast.readStats(history[0]);
  t.assertEqual(stats.total, 5, 'Okunma istatistiği toplam alıcıyı sayıyor');
  t.assertEqual(stats.read, 0, 'Henüz kimse okumadı');

  await Notification.markAsRead(trInbox[0].id, memberTr);
  t.assertEqual((await Broadcast.readStats(history[0])).read, 1, 'Okunma sayacı güncelleniyor');

  // --- Dogrulama ve guvenlik
  let threw = false;
  try {
    await Broadcast.send({ title: 'Boş mesaj', message: 'kısa', audience: 'all', sent_by: admin });
  } catch (error) { threw = true; }
  t.assert(threw, 'Çok kısa mesaj reddediliyor');

  threw = false;
  try {
    await Broadcast.send({ title: 'x', message: 'Yeterince uzun bir duyuru metni.', audience: 'herkes-ve-digerleri', sent_by: admin });
  } catch (error) { threw = true; }
  t.assert(threw, 'Tanımsız hedef kitle reddediliyor');

  t.assertEqual(Broadcast.safeLinkPath('/panel'), '/panel', 'Site içi yol kabul ediliyor');
  t.assertEqual(Broadcast.safeLinkPath('https://kotu.example'), null, 'Dış bağlantı reddediliyor');
  t.assertEqual(Broadcast.safeLinkPath('//kotu.example'), null, 'Protokol-göreli bağlantı reddediliyor');

  const external = await Broadcast.send({
    title: 'Dış bağlantı denemesi',
    message: 'Bu duyuruda dış bağlantı verilmeye çalışılıyor.',
    link_url: 'https://kotu.example',
    audience: 'role', role: 'business', sent_by: admin
  });
  t.assertEqual(external.sent, 1, 'Role göre gönderim çalışıyor');
  const companyInbox = await Notification.getByUserId(company);
  t.assertEqual(companyInbox[0].link_url, null, 'Dış bağlantı bildirime yazılmıyor');

  // Kimse yoksa hicbir sey yazilmamali ve gecmise kayit dusmemeli
  const historyBefore = (await Broadcast.history()).length;
  const empty = await Broadcast.send({
    title: 'Kimseye gitmeyecek',
    message: 'Bu duyurunun alıcısı olmamalı çünkü kitle boş.',
    audience: 'specific', emails: 'hicbir@adres.yok', sent_by: admin
  });
  t.assertEqual(empty.sent, 0, 'Alıcısı olmayan gönderim 0 döndürüyor');
  t.assertEqual(empty.broadcastId, null, 'Alıcısı olmayan gönderim kayıt oluşturmuyor');
  t.assertEqual((await Broadcast.history()).length, historyBefore, 'Boş gönderim geçmişi kirletmiyor');

  // --- Controller ve sablon
  const composeRes = makeRes();
  await broadcastController.compose(makeReq({ session: { userId: admin } }), composeRes);
  t.assertEqual(composeRes.rendered.view, 'admin/broadcast', 'Compose doğru şablonu render ediyor');
  t.assertEqual(composeRes.rendered.locals.counts.all, 5, 'Şablona aktif üye sayısı geçiyor');

  const html = await t.render('admin/broadcast.ejs', Object.assign({
    activePage: 'broadcast', title: 'test'
  }, composeRes.rendered.locals));
  t.assert(html.includes('geri alınamaz'), 'Sayfa işlemin geri alınamaz olduğunu söylüyor');
  t.assert(html.includes('Yeni kategori yayında'), 'Geçmiş listede görünüyor');
  t.assert(html.includes('name="audience" value="language"'), 'Dile göre gönderim seçeneği var');
  t.assert(html.includes('name="emails"'), 'Belirli e-posta alanı var');
  t.assert(html.includes('5 kişi'), 'Geçmişte alıcı sayısı görünüyor');

  // Reddedilen gonderim yazilani kaybetmemeli
  const rejectReq = makeReq({
    session: { userId: admin },
    body: { title: 'Kaydedilecek başlık', message: 'kısa', audience: 'all' }
  });
  await broadcastController.send(rejectReq, makeRes());
  t.assert(
    rejectReq.flashes.some((f) => f.message === 'flash.broadcast_message_too_short'),
    'Kısa mesaj controller seviyesinde de reddediliyor'
  );
  t.assertEqual(rejectReq.session.broadcastDraft.title, 'Kaydedilecek başlık', 'Reddedilen duyuru metni korunuyor');

  const langs = ['tr', 'en', 'el', 'ru', 'fa'].every((lang) =>
    ['flash.broadcast_sent', 'flash.broadcast_no_recipients', 'flash.broadcast_link_invalid']
      .every((key) => t.translate(key, lang) !== key)
  );
  t.assert(langs, 'Duyuru flash metinleri 5 dilde çözülüyor');
});
