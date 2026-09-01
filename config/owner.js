// Sahip hesabı: piramidin en üstü.
//
// Kim olduğu .env dosyasında yazıyor, veritabanında değil. Bu bilinçli.
// Dokunulmazlık bir kolon olsaydı, yönetici panelinden o kolonu düzenleyebilen
// herhangi bir yol dokunulmazlığı da düzenleyebilirdi; ikinci bir yönetici
// kendini sahip yapabilir ya da sahibi sıradan bir üyeye çevirebilirdi.
// Sunucudaki dosyayı değiştirebilen kişi ise zaten veritabanına da erişebilir,
// yani orada kaybedilecek bir şey yok.
//
// Varsayılan, ilk açılışta yönetici hesabını oluşturan adresle aynı
// (config/database.js), yani ek ayar yapılmadan da doğru hesabı koruyor.
//
// OWNER_EMAIL değiştirilirse koruma yeni adrese geçer, eskisi sıradan bir
// yönetici olur. Bu bir kusur değil taşınma yolu: hesabı devretmenin tek yeri
// sunucudaki dosya.

const DEFAULT_OWNER_EMAIL = 'admin@cypilan.com';

const ownerEmail = () =>
  String(process.env.OWNER_EMAIL || process.env.ADMIN_EMAIL || DEFAULT_OWNER_EMAIL)
    .trim()
    .toLowerCase();

const isOwnerEmail = (email) => {
  if (!email) return false;
  return String(email).trim().toLowerCase() === ownerEmail();
};

// Bir kullanıcı satırı sahip mi. Satırın kendisiyle karar veriliyor, id ile
// değil: id'ler veritabanı taşınırken değişebilir, e-posta sütunu UNIQUE.
const isOwner = (user) => Boolean(user && isOwnerEmail(user.email));

// Yönetici eylemlerinin başında sorulan soru: bu satıra dokunmaya iznim var mı?
// Sahibin kendisi kendi hesabını düzenleyebiliyor; başkası düzenleyemiyor.
const canModify = (targetUser, actingUser) => {
  if (!isOwner(targetUser)) return true;
  return isOwner(actingUser);
};

module.exports = {
  DEFAULT_OWNER_EMAIL,
  ownerEmail,
  isOwnerEmail,
  isOwner,
  canModify
};
