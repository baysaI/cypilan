const fs = require('fs');
const t = require('./helpers');

const Setting = require(t.rootDir + '/models/Setting');

t.run('Geliştirme notu şeridi', async (db) => {
  const admin = t.makeUser(db, 'admin@test.local', 'Admin', 'admin');

  // --- Varsayilan acik olmali
  //
  // Bakim ve kayitla goruntuleme modlarinin tersi. Onlar kapali baslar cunku
  // acilmalari bir karardir; bu not ise sitenin gercek halini soyluyor ve
  // ayar hic yazilmamissa site gelistirme asamasindadir.
  Setting.clearCache();
  t.assert(
    Setting.getBool(Setting.KEYS.DEV_NOTICE, true),
    'Ayar hiç yazılmamışken not gösteriliyor'
  );

  // --- Kapatilabilmeli ve kalici olmali
  Setting.setBool(Setting.KEYS.DEV_NOTICE, false, admin);
  Setting.clearCache();
  t.assert(
    !Setting.getBool(Setting.KEYS.DEV_NOTICE, true),
    'Kapatılınca kapalı kalıyor (veritabanında saklanıyor)'
  );

  Setting.setBool(Setting.KEYS.DEV_NOTICE, true, admin);
  Setting.clearCache();
  t.assert(Setting.getBool(Setting.KEYS.DEV_NOTICE, true), 'Tekrar açılabiliyor');

  const described = Setting.describe(Setting.KEYS.DEV_NOTICE);
  t.assertEqual(described.updated_by_name, 'Admin', 'Ayarı kimin değiştirdiği kaydediliyor');

  // Anahtar, ceviri anahtari 'site.dev_notice' ile karismamali: biri ayar
  // tablosunda bir satir, oteki bes dilde bir metin.
  t.assertEqual(Setting.KEYS.DEV_NOTICE, 'site.dev_notice_enabled', 'Ayar anahtarı çeviri anahtarından ayrı');

  // --- Bakim ve erisim modlarindan bagimsiz olmali
  t.assert(!Setting.getBool(Setting.KEYS.MAINTENANCE_ENABLED, false), 'Bakım modunu etkilemiyor');
  t.assert(!Setting.getBool(Setting.KEYS.LOGIN_REQUIRED, false), 'Kayıtla görüntülemeyi etkilemiyor');

  // --- Yerlesim seridi yalnizca acikken basmali
  const layout = fs.readFileSync(t.rootDir + '/views/layouts/main.ejs', 'utf8');
  t.assert(
    /devNoticeEnabled === 'undefined' \|\| devNoticeEnabled/.test(layout),
    'Şerit ayara bağlı bir koşulun içinde'
  );
  t.assert(
    layout.indexOf('devNoticeEnabled') < layout.indexOf('<main id="content"'),
    'Koşul içerikten önce geliyor'
  );

  // --- Panel iki durumu da net gostermeli
  const base = {
    enabled: false, message: '', until: '', lastChange: null,
    unlimitedEnabled: false, unlimitedLastChange: null,
    recentListingsEnabled: false, recentListingsLastChange: null,
    loginRequiredEnabled: false, loginRequiredLastChange: null,
    title: 'test'
  };

  const onHtml = await t.render('admin/maintenance.ejs', Object.assign({}, base, {
    devNoticeEnabled: true, devNoticeLastChange: described
  }));
  t.assert(onHtml.includes('/admin/gelistirme-notu'), 'Panelde geliştirme notu formu var');
  t.assert(onHtml.includes('Not Gösteriliyor'), 'Açık durumu net yazıyor');
  t.assert(onHtml.includes('Admin'), 'Ayarı kimin değiştirdiği panelde görünüyor');

  // Yoneticinin kapatmadan once ne kapattigini gormesi gerekiyor.
  t.assert(
    onHtml.includes(t.translate('site.dev_notice', 'tr')),
    'Ziyaretçinin gördüğü metin panelde önizleniyor'
  );

  const offHtml = await t.render('admin/maintenance.ejs', Object.assign({}, base, {
    devNoticeEnabled: false, devNoticeLastChange: null
  }));
  t.assert(offHtml.includes('Not Kapalı'), 'Kapalı durumu net yazıyor');
  t.assert(offHtml.includes('Notu Göster'), 'Açma düğmesi görünüyor');

  // Yerel hic gecilmezse panel de acik varsaymali: iki taraf ayni varsayilani
  // kullanmazsa panel "kapalı" derken site notu göstermeye devam ederdi.
  const missingHtml = await t.render('admin/maintenance.ejs', base);
  t.assert(missingHtml.includes('Not Gösteriliyor'), 'Yerel verilmezse panel de açık varsayıyor');

  // --- Oteki ayar kartlari bozulmamis olmali
  ['/admin/sinirsiz-ilan', '/admin/bakim', '/admin/son-ilanlar-ayari', '/admin/kayitla-goruntuleme']
    .forEach((action) => t.assert(onHtml.includes(action), action + ' formu yerinde duruyor'));
});
