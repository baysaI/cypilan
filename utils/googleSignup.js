const User = require('../models/User');

// Google'dan donen profilin ne anlama geldigini soyler.
//
//   { user }     bu e-postayla bir hesap var: dogrudan giris
//   { pending }  hesap yok: hesap, yas ve kullanim kosullari onaylandiktan
//                SONRA aciliyor
//   { error }    profil kullanilamaz
//
// Onceden hesap burada, Google donusunde aninda aciliyordu. Kayit formu yas
// onayi ve kosul onayi isterken Google yolu ikisini de atliyordu; o yoldan
// gelenlerin onay kaydi hic olusmuyordu.
const resolve = async (profile) => {
  const primaryEmail = profile && profile.emails && profile.emails[0] ? profile.emails[0] : null;
  if (!primaryEmail || !primaryEmail.value) {
    return { error: 'flash.google_email_missing' };
  }

  // Without this an unverified Google address could be used to take over an
  // existing password account that happens to share the same e-mail.
  if (primaryEmail.verified === false) {
    return { error: 'flash.google_email_unverified' };
  }

  const email = String(primaryEmail.value).trim().toLowerCase();
  const user = await User.findByEmail(email);
  if (user) return { user };

  const name = String((profile && profile.displayName) || '').trim().slice(0, 100);
  return { pending: { email, name: name || 'Google User' } };
};

// Bekleyen kaydin gecerlilik suresi. Onay sayfasini acik birakip ertesi gun
// gonderen birinin, eskimis bir Google dogrulamasiyla hesap acmasi istenmiyor.
const PENDING_TTL_MS = 15 * 60 * 1000;

const readPending = (session) => {
  const pending = session && session.pendingGoogleSignup;
  if (!pending || !pending.email || !pending.at) return null;
  if (Date.now() - pending.at > PENDING_TTL_MS) return null;
  return pending;
};

module.exports = { resolve, readPending, PENDING_TTL_MS };
