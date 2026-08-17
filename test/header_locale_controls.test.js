const t = require('./helpers');

// The currency picker was hidden below md with `d-none d-md-block` and had no
// replacement, so a phone had no way to switch to sterling at all. It cannot
// simply be un-hidden: style.css measures that row before it will even allow the
// "İlan Ver" label on, because the Greek translation pushes a 414px screen over.
// So the choice moved into the language dropdown, which is always visible.
//
// These assertions are about the markup rather than the pixels, but they pin the
// two things that broke: that a phone is offered the choice at all, and that a
// desktop is not offered it twice.
t.run('Başlıktaki dil ve para birimi kontrolleri', async () => {
  const baseLocals = {
    user: null, currentUser: null, currentPath: '/', theme: 'light',
    unreadMessages: 0, unreadNotifications: 0, pendingBidCount: 0, pendingApplicationCount: 0
  };

  const html = await t.render('partials/header.ejs', baseLocals);
  const flat = html.replace(/\s+/g, ' ');

  // --- Mobilde ulasilabilir olmali
  t.assert(
    flat.includes('<li class="d-md-none"><hr class="dropdown-divider"></li>'),
    'Dil menüsünde mobile özel bir bölüm var'
  );

  const mobileCurrencyItems = (flat.match(/<li class="d-md-none"> <a class="dropdown-item currency-switch/g) || []).length;
  t.assertEqual(mobileCurrencyItems, 2, 'Mobil menüde iki para birimi seçeneği (TRY ve GBP) var');

  t.assert(flat.includes('data-currency="TRY"') && flat.includes('data-currency="GBP"'), 'Her iki para birimi de sunuluyor');

  // Isaret, mobilde ekranda ₺/£ butonu olmadigi icin hangisinin aktif oldugunu
  // soyleyen tek sey.
  t.assert(flat.includes('fa-check'), 'Aktif para birimi işaretle belirtiliyor');

  // --- Masaustunde tekrar etmemeli
  t.assert(
    flat.includes('<div class="dropdown d-none d-md-block">'),
    'Bağımsız para birimi butonu md ve üstünde duruyor'
  );

  // --- Erisilebilirlik: globe butonu artik ikisini de aciyor
  t.assert(
    flat.includes('aria-label="' + t.translate('common.language_currency', 'tr') + '"'),
    'Globe butonunun etiketi hem dili hem para birimini kapsıyor'
  );

  // --- Aktif para birimi dogru isaretlenmeli
  const gbpHtml = (await t.render('partials/header.ejs', Object.assign({}, baseLocals, { currency: 'GBP' })))
    .replace(/\s+/g, ' ');

  // Her bağlantının kendi gövdesi ayrıştırılıyor: sabit uzunlukta bir pencere
  // komşu satıra taşar ve yanlış satırdaki işareti sayar.
  const currencyLinks = [...gbpHtml.matchAll(/<a class="dropdown-item currency-switch[^>]*data-currency="(TRY|GBP)"[^>]*>(.*?)<\/a>/g)]
    .map((match) => ({ code: match[1], inner: match[2] }));

  const marked = currencyLinks.filter((link) => link.inner.includes('fa-check')).map((link) => link.code);
  t.assertEqual(marked.join(','), 'GBP', 'GBP seçiliyken yalnızca GBP satırı işaretli');

  t.assert(
    />\s*£\s*<\/button>/.test(gbpHtml),
    'Masaüstü butonu aktif para biriminin simgesini gösteriyor'
  );
  t.assert(
    /">\s*₺\s*<\/button>/.test((await t.render('partials/header.ejs', baseLocals)).replace(/\s+/g, ' ')),
    'Varsayılanda masaüstü butonu ₺ gösteriyor'
  );

  const langs = ['tr', 'en', 'el', 'ru', 'fa'].every((lang) =>
    t.translate('common.language_currency', lang) !== 'common.language_currency'
  );
  t.assert(langs, 'common.language_currency 5 dilde çözülüyor');
});
