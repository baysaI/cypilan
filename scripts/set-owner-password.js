require('dotenv').config();

const crypto = require('crypto');
const { getDb, initialize } = require('../config/database');
const User = require('../models/User');
const owner = require('../config/owner');

// Sahip hesabinin tek kurtarma yolu.
//
// Sahip hesabina panelden sifre degistirilemiyor ve e-postayla sifirlama
// baglantisi uretilmiyor; geriye tek kapi kaliyor ve o kapi bu betik. Sunucuya
// girebilen zaten veritabanina da girebildigi icin burada kaybedilen bir
// guvenlik yok, kazanilan sey su: sifreyi degistirmek icin fiziksel olarak
// sunucuda olmak gerekiyor.
//
//   npm run owner:password              -> guclu bir sifre uretir ve bir kez yazar
//   NEW_PASSWORD=... npm run owner:password  -> verilen sifreyi kullanir
//
// Sifre komut satirina argüman olarak alinmiyor: orada kabuk gecmisine
// yaziliyor ve sunucuda kalici bir iz birakiyor.

const main = async () => {
  await initialize();

  const email = owner.ownerEmail();
  const user = await User.findByEmail(email);

  if (!user) {
    console.error(`\n  Sahip hesabi bulunamadi: ${email}`);
    console.error('  .env dosyasindaki OWNER_EMAIL / ADMIN_EMAIL degerini kontrol edin.\n');
    process.exit(1);
  }

  const provided = process.env.NEW_PASSWORD ? String(process.env.NEW_PASSWORD).trim() : '';
  if (provided && provided.length < 8) {
    console.error('\n  NEW_PASSWORD en az 8 karakter olmali.\n');
    process.exit(1);
  }

  const password = provided || crypto.randomBytes(15).toString('base64url');

  await User.setPassword(user.id, password);

  // Hesap kilitlenmis olabilir: askiya alma sahip icin engelli ama eski bir
  // kayit ya da elle yapilmis bir degisiklik hesabi kapatmis olabilir.
  // Kurtarma betiginin isi tam da bunu duzeltmek.
  const db = getDb();
  db.prepare(
    "UPDATE users SET is_active = 1, role = 'admin', password_reset_token = NULL, password_reset_expires = NULL WHERE id = ?"
  ).run([user.id]);

  console.log('\n  Sahip hesabinin sifresi degistirildi.');
  console.log(`  E-posta : ${user.email}`);
  if (provided) {
    console.log('  Sifre   : (NEW_PASSWORD ile verildi)');
  } else {
    console.log(`  Sifre   : ${password}`);
    console.log('\n  Bu sifre bir daha gosterilmeyecek, simdi kaydedin.');
  }
  console.log('');
};

main().catch((error) => {
  console.error('\n  Sifre degistirilemedi:', error.message, '\n');
  process.exit(1);
});
