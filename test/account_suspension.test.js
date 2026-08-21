const t = require('./helpers');

const User = require(t.rootDir + '/models/User');
const { setUserLocal } = require(t.rootDir + '/middlewares/auth');

// express-session hands back a brand new session object from regenerate(), so
// the mock does the same: a test that kept the old object would pass even if the
// middleware failed to cut the old session loose.
const makeReq = (userId, { xhr = false } = {}) => {
  const req = { headers: {}, xhr, flashes: [] };

  const freshSession = (data) => ({
    ...(data || {}),
    regenerate(callback) {
      req.session = freshSession();
      callback(null);
    },
    save(callback) {
      if (callback) callback(null);
    }
  });

  req.session = freshSession({ userId });
  req.flash = (type, message) => req.flashes.push({ type, message });
  return req;
};

const makeRes = () => {
  const res = { locals: {}, redirectedTo: null, statusCode: 200, jsonBody: null };
  res.redirect = (to) => { res.redirectedTo = to; };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.jsonBody = body; };
  return res;
};

// The middleware either calls next() or answers the request itself, so the
// promise has to settle on whichever happens.
const invoke = (req, res) => new Promise((resolve, reject) => {
  let settled = false;
  const finish = () => { if (!settled) { settled = true; resolve(); } };

  const redirect = res.redirect;
  res.redirect = (to) => { redirect(to); finish(); };
  const json = res.json;
  res.json = (body) => { json(body); finish(); };

  setUserLocal(req, res, (error) => (error ? reject(error) : finish()));
});

t.run('Askıya alınan hesabın oturumu', async (db) => {
  const active = t.makeUser(db, 'active@test.local', 'Aktif Kullanıcı');
  const banned = t.makeUser(db, 'banned@test.local', 'Askıya Alınan');
  const demoted = t.makeUser(db, 'demoted@test.local', 'Eski Yönetici', 'admin');

  // --- Saglikli hesap etkilenmemeli
  const okReq = makeReq(active);
  const okRes = makeRes();
  await invoke(okReq, okRes);

  t.assertEqual(okRes.redirectedTo, null, 'Aktif hesap yönlendirilmiyor');
  t.assert(Boolean(okRes.locals.user), 'Aktif hesap için kullanıcı bilgisi yükleniyor');
  t.assertEqual(okReq.session.userId, active, 'Aktif hesabın oturumu korunuyor');

  // --- Askiya alinan hesap disari atilmali
  await User.setActive(banned, false);

  const banReq = makeReq(banned);
  const banRes = makeRes();
  await invoke(banReq, banRes);

  t.assertEqual(banRes.redirectedTo, '/auth/login', 'Askıya alınan hesap giriş sayfasına atılıyor');
  t.assert(
    banReq.flashes.some((f) => f.message === 'flash.account_suspended'),
    'Askıya alınma mesajı gösteriliyor'
  );
  t.assertEqual(banReq.session.userId, undefined, 'Oturum yenilendi, eski kimlik taşınmıyor');

  // --- Ayni durum XHR icin JSON dönmeli, yonlendirme degil
  const xhrReq = makeReq(banned, { xhr: true });
  const xhrRes = makeRes();
  await invoke(xhrReq, xhrRes);

  t.assertEqual(xhrRes.statusCode, 403, 'XHR isteği 403 alıyor');
  t.assert(Boolean(xhrRes.jsonBody && xhrRes.jsonBody.error), 'XHR isteğine hata gövdesi dönüyor');
  t.assertEqual(xhrRes.redirectedTo, null, 'XHR isteği yönlendirilmiyor');

  // --- Yeniden aktiflestirilince tekrar girebilmeli
  await User.setActive(banned, true);

  const backReq = makeReq(banned);
  const backRes = makeRes();
  await invoke(backReq, backRes);
  t.assertEqual(backRes.redirectedTo, null, 'Yasağı kalkan hesap tekrar geçebiliyor');

  // --- Rol dususu oturumu beklemeden etkili olmali
  const adminReq = makeReq(demoted);
  await invoke(adminReq, makeRes());
  t.assertEqual(adminReq.session.userRole, 'admin', 'Yönetici rolü oturuma yazılıyor');

  await User.setRole(demoted, 'user');

  const afterReq = makeReq(demoted);
  afterReq.session.userRole = 'admin'; // oturumda eski rol duruyormus gibi
  const afterRes = makeRes();
  await invoke(afterReq, afterRes);

  t.assertEqual(afterReq.session.userRole, 'user', 'Düşürülen rol oturumda anında güncelleniyor');
  t.assertEqual(afterRes.locals.user.role, 'user', 'Sayfaya giden rol de güncel');

  // --- Silinen hesabin oturumu sessizce kapanmali
  const ghost = t.makeUser(db, 'ghost@test.local', 'Silinecek');
  await User.delete(ghost);

  const ghostReq = makeReq(ghost);
  const ghostRes = makeRes();
  await invoke(ghostReq, ghostRes);

  t.assertEqual(ghostRes.redirectedTo, '/', 'Silinen hesap ana sayfaya yönlendiriliyor');
  t.assertEqual(ghostReq.flashes.length, 0, 'Silinen hesaba askıya alınma mesajı gösterilmiyor');
});
