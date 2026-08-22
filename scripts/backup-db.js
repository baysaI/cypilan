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
