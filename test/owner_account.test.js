// Sahibin kim oldugu .env'den okunuyor ve config/owner.js bunu her cagrida
// yeniden okuyor, yani test kendi sahibini burada tanimlayabiliyor.
process.env.OWNER_EMAIL = 'sahip@test.local';

const t = require('./helpers');

const User = require(t.rootDir + '/models/User');
const owner = require(t.rootDir + '/config/owner');

t.run('Sahip hesabı koruması', async (db) => {
  const sahip = t.makeUser(db, 'sahip@test.local', 'Sahip', 'admin');
  const ikinciAdmin = t.makeUser(db, 'admin2@test.local', 'İkinci Yönetici', 'admin');
  const uye = t.makeUser(db, 'uye@test.local', 'Sıradan Üye');

  const oku = (id) => db.prepare('SELECT * FROM users WHERE id = ?').get([id]);

  // --- Kimlik
  t.assert(owner.isOwner(oku(sahip)), 'Sahip tanınıyor');
  t.assert(!owner.isOwner(oku(ikinciAdmin)), 'Başka bir yönetici sahip değil');
  t.assert(owner.isOwnerEmail(' SAHIP@Test.Local '), 'E-posta karşılaştırması boşluk ve büyük harfe duyarsız');
  t.assert(!owner.isOwnerEmail(null), 'Boş e-posta sahip sayılmıyor');

  // --- Askiya alma
  t.assertEqual(await User.setActive(sahip, false), false, 'Sahip askıya alınamıyor');
  t.assertEqual(oku(sahip).is_active, 1, 'Hesap açık kaldı');

  // Kural fazla genis olmamali: oteki yoneticiler hala yonetilebiliyor.
  t.assertEqual(await User.setActive(ikinciAdmin, false), true, 'Başka yönetici askıya alınabiliyor');
  await User.setActive(ikinciAdmin, true);

  // --- Rol
  t.assertEqual(await User.setRole(sahip, 'user'), false, 'Sahibin rolü düşürülemiyor');
  t.assertEqual(oku(sahip).role, 'admin', 'Rol admin kaldı');
  t.assertEqual(await User.setRole(uye, 'agent'), true, 'Sıradan üyenin rolü değişebiliyor');

  // --- Silme
  t.assertEqual(await User.delete(sahip), false, 'Sahip silinemiyor');
  t.assert(Boolean(oku(sahip)), 'Satır yerinde duruyor');

  // --- Sifre sifirlama baglantisi
  //
  // Baglanti sahibin kendi kutusuna gitse de, hesabin tamami o kutunun
  // guvenligine baglanmis olurdu. Tek kurtarma yolu sunucudaki betik.
  const yarin = new Date(Date.now() + 3600000).toISOString();
  t.assertEqual(await User.setResetToken(sahip, 'jeton', yarin), false, 'Sahip için sıfırlama jetonu üretilmiyor');
  t.assertEqual(oku(sahip).password_reset_token, null, 'Jeton veritabanına yazılmadı');
  t.assertEqual(await User.setResetToken(ikinciAdmin, 'jeton2', yarin), true, 'Başkası için sıfırlama çalışıyor');

  // --- Sahibin kendi sifresi engellenmemeli
  //
  // Profil sayfasindaki degistirme mevcut sifreyi soruyor, yani zaten sahibin
  // elinde; kurtarma betigi de ayni yolu kullaniyor. Engellenen sey baskasinin
  // dokunmasi, sahibin kendi erisimi degil.
  const öncekiHash = oku(sahip).password_hash;
  await User.setPassword(sahip, 'yeni-guclu-sifre');
  t.assert(oku(sahip).password_hash !== öncekiHash, 'Sahip kendi şifresini değiştirebiliyor');

  // --- Yetki karari
  t.assert(!owner.canModify(oku(sahip), oku(ikinciAdmin)), 'Başka yönetici sahibe dokunamıyor');
  t.assert(owner.canModify(oku(sahip), oku(sahip)), 'Sahip kendine dokunabiliyor');
  t.assert(owner.canModify(oku(uye), oku(ikinciAdmin)), 'Sıradan üyeye dokunulabiliyor');
  t.assert(!owner.canModify(oku(sahip), null), 'Oturumsuz istek sahibe dokunamıyor');

  // --- Panel bu hesabi kilitli gostermeli
  const html = await t.render('admin/users.ejs', {
    users: [Object.assign({}, oku(sahip), { is_owner: true, listing_count: 0, warnings: [] })],
    pagination: { page: 1, totalItems: 1, totalPages: 1 },
    filters: {},
    activeAdminUser: oku(ikinciAdmin),
    title: 'test'
  });
  t.assert(html.includes('Sahip'), 'Panelde sahip rozeti basılıyor');
  t.assert(!html.includes('Askıya Al'), 'Sahip satırında askıya alma düğmesi yok');
  t.assert(!html.includes('btn-delete-user'), 'Sahip satırında silme düğmesi yok');

  // --- Beş dilde uyarı metni
  const diller = ['tr', 'en', 'el', 'ru', 'fa'].every((lang) =>
    t.translate('flash.owner_protected', lang) !== 'flash.owner_protected'
  );
  t.assert(diller, 'flash.owner_protected 5 dilde çözülüyor');
});
