// Tutarli bir veritabani yedegi alir - sunucuyu durdurmadan.
//
// Dosyayi kopyalamak WAL modunda guvenli degil: son yazmalar henuz -wal
// dosyasinda bekliyor olabilir ve yalnizca .db kopyalanirsa sessizce kaybolur.
// Uc dosyayi birlikte kopyalamak ise kopyalama suresince yazma olmamasini
// gerektirir. VACUUM INTO ikisini de dert etmiyor: kaynagi tutarli bir anda
// okuyup tek parca, parcalanmamis bir dosya yaziyor.
//
//   npm run db:backup                  -> database/backups/ altina zaman damgali
//   npm run db:backup -- D:\yedek.db   -> belirtilen yola

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

require('dotenv').config();

const dbPath = process.env.DB_PATH
  ? path.resolve(__dirname, '..', process.env.DB_PATH)
  : path.join(__dirname, '..', 'database', 'cypilan.db');

const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
const target = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(__dirname, '..', 'database', 'backups', `cypilan-${stamp}.db`);

if (!fs.existsSync(dbPath)) {
  console.error(`Veritabani bulunamadi: ${dbPath}`);
  process.exit(1);
}

fs.mkdirSync(path.dirname(target), { recursive: true });

if (fs.existsSync(target)) {
  console.error(`Hedef dosya zaten var, uzerine yazilmiyor: ${target}`);
  process.exit(1);
}

const source = new Database(dbPath, { readonly: true });

console.log(`Kaynak : ${dbPath}`);
console.log(`Hedef  : ${target}`);
console.log('Yedek aliniyor...');

source.prepare('VACUUM INTO ?').run(target);

// Yedegin dogrulanmadan raporlanmasi, bozuk bir dosyaya guvenmek demek olurdu.
const backup = new Database(target, { readonly: true });
const integrity = backup.pragma('integrity_check')[0].integrity_check;

const tables = source
  .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
  .all()
  .map((row) => row.name);

const mismatched = [];
let totalRows = 0;

tables.forEach((table) => {
  const before = source.prepare(`SELECT COUNT(*) AS count FROM "${table}"`).get().count;
  const after = backup.prepare(`SELECT COUNT(*) AS count FROM "${table}"`).get().count;
  totalRows += after;
  if (before !== after) mismatched.push(`${table} (${before} -> ${after})`);
});

source.close();
backup.close();

const sizeMb = (fs.statSync(target).size / 1024 / 1024).toFixed(2);

console.log('');
console.log(`  Butunluk    : ${integrity}`);
console.log(`  Tablo       : ${tables.length}`);
console.log(`  Toplam satir: ${totalRows}`);
console.log(`  Boyut       : ${sizeMb} MB`);

if (integrity !== 'ok' || mismatched.length > 0) {
  console.log('');
  console.error('YEDEK DOGRULANAMADI.');
  mismatched.forEach((line) => console.error(`  Satir sayisi tutmadi: ${line}`));
  process.exit(1);
}


// Saat basi yedek, temizlik olmadan yilda birkac gigabayt birakir - ve o
// dosyalarin neredeyse hepsi ise yaramaz: iki hafta onceki saat 03:00 ile
// 04:00 arasindaki farki kimse aramaz. Tutulanlar kademeli: son iki gunun her
// saati, son bir ayin her gunu, son bir yilin her ayi. Dosya sayisi bir tavana
// oturdugu icin klasor sinirsiz buyumuyor.
//
// Temizlik yeni yedek dogrulandiktan SONRA calisiyor. Once silip sonra
// yedeklemek, kotu giden bir gunde elde hicbir sey birakmayabilirdi.
const HOURLY_KEEP = 48;
const DAILY_KEEP = 30;
const MONTHLY_KEEP = 12;

const prune = (dir) => {
  const pattern = /^cypilan-(\d{4})-(\d{2})-(\d{2})-(\d{2})-(\d{2})-(\d{2})\.db$/;

  const files = fs.readdirSync(dir)
    .map((name) => ({ name, match: name.match(pattern) }))
    .filter((item) => item.match)
    .map(({ name, match }) => ({
      name,
      day: match.slice(1, 4).join('-'),
      month: match.slice(1, 3).join('-')
    }))
    .sort((a, b) => b.name.localeCompare(a.name));

  const keep = new Set();
  files.slice(0, HOURLY_KEEP).forEach((file) => keep.add(file.name));

  const newestPerPeriod = (field, limit) => {
    const seen = new Map();
    files.forEach((file) => {
      if (!seen.has(file[field])) seen.set(file[field], file.name);
    });
    [...seen.values()].slice(0, limit).forEach((name) => keep.add(name));
  };

  newestPerPeriod('day', DAILY_KEEP);
  newestPerPeriod('month', MONTHLY_KEEP);

  const removed = files.filter((file) => !keep.has(file.name));
  removed.forEach((file) => fs.unlinkSync(path.join(dir, file.name)));

  return { kept: keep.size, removed: removed.length };
};

const { kept, removed } = prune(path.dirname(target));

console.log('');
console.log(
  removed > 0
    ? `Yedek dogrulandi. ${kept} yedek tutuluyor, ${removed} eskisi silindi.`
    : `Yedek dogrulandi. ${kept} yedek tutuluyor.`
);

// Sunucunun kendi diskindeki yedek, sunucuyu kaybettigin senaryoda ise yaramaz -
// ki yedegin asil var olma sebebi o senaryo. BACKUP_MIRROR_DIR tanimliysa
// yedekler oraya da kopyalaniyor; bulut istemcisinin izledigi bir klasoru
// gostermek, dosyalari sunucu disina cikarmaya yetiyor.
//
// Kopyalanan sey canli veritabani degil, kapali ve donmus bir yedek dosyasi.
// Bu ayrim onemli: bu veritabaninin gecmisteki bozulmalari, WAL modundaki canli
// dosyanin yazilirken senkronlanmasindan kaynaklaniyordu. Senkron kapsamina
// yalnizca bu klasor girdigi surece ayni tuzak kurulmuyor.
const mirrorDir = process.env.BACKUP_MIRROR_DIR;

if (mirrorDir) {
  const backupPattern = /^cypilan-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}\.db$/;
  const sourceDir = path.dirname(target);

  if (!fs.existsSync(mirrorDir)) {
    console.log('');
    console.log(`UYARI: BACKUP_MIRROR_DIR bulunamadi, kopyalama atlandi: ${mirrorDir}`);
  } else {
    const local = fs.readdirSync(sourceDir).filter((name) => backupPattern.test(name));
    const remote = fs.readdirSync(mirrorDir).filter((name) => backupPattern.test(name));

    let copied = 0;
    local.forEach((name) => {
      if (!remote.includes(name)) {
        fs.copyFileSync(path.join(sourceDir, name), path.join(mirrorDir, name));
        copied += 1;
      }
    });

    // Yalnizca kendi adlandirma kalibimiza uyanlar siliniyor; klasorde baska ne
    // varsa ona dokunulmuyor.
    let dropped = 0;
    remote.forEach((name) => {
      if (!local.includes(name)) {
        fs.unlinkSync(path.join(mirrorDir, name));
        dropped += 1;
      }
    });

    console.log('');
    console.log(`Kopya: ${mirrorDir}`);
    console.log(`  ${local.length} yedek eslendi` + (copied > 0 ? `, ${copied} yenisi kopyalandi` : '') + (dropped > 0 ? `, ${dropped} eskisi silindi` : '') + '.');
  }
}
