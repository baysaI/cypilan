const { getDb } = require('../config/database');

// Kullanicinin kabul ettigi metinlerin kaydi.
//
// Kayit tutulan sey "kabul etti mi" degil, "neyi, hangi surumunu, ne zaman
// kabul etti". Ilk soruya evet demek, metin degistiginde anlamsizlasiyor.
const KINDS = ['terms', 'privacy', 'age'];

class UserConsent {
  static async record(userId, kinds, version) {
    const db = getDb();
    const list = (Array.isArray(kinds) ? kinds : [kinds]).filter((k) => KINDS.includes(k));
    if (list.length === 0) return 0;

    const stmt = db.prepare(
      'INSERT INTO user_consents (user_id, kind, version) VALUES (?, ?, ?)'
    );

    // Kayit acilisiyla ayni islemde degil: onay kaydi tutulamadi diye hesap
    // acilmasin diyemeyiz, ama tersine de izin veremeyiz - cagiran taraf
    // basarisizligi gormeli.
    list.forEach((kind) => stmt.run([userId, kind, version]));
    return list.length;
  }

  static async forUser(userId) {
    const db = getDb();
    return db.prepare(
      'SELECT kind, version, accepted_at FROM user_consents WHERE user_id = ? ORDER BY accepted_at ASC, id ASC'
    ).all([userId]);
  }
}

UserConsent.KINDS = KINDS;

module.exports = UserConsent;
