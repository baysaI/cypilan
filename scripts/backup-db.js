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

console.log('');
console.log('Yedek dogrulandi.');
