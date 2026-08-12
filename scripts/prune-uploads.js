// Lists (or with --delete, removes) listing images on disk that no listing
// references any more. Dry run by default.
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const rootDir = path.resolve(__dirname, '..');
const uploadDir = path.join(rootDir, 'public', 'uploads', 'listings');
const dbPath = path.join(rootDir, 'database', 'cypilan.db');

const shouldDelete = process.argv.includes('--delete');

const formatSize = (bytes) => (bytes < 1024 * 1024
  ? `${(bytes / 1024).toFixed(1)} KB`
  : `${(bytes / 1024 / 1024).toFixed(1)} MB`);

(async () => {
  if (!fs.existsSync(uploadDir)) {
    console.log('Yükleme klasörü yok, yapacak bir şey de yok.');
    return;
  }

  if (!fs.existsSync(dbPath)) {
    console.error('Veritabanı bulunamadı. Referanslar okunamadan silme yapılmaz.');
    process.exit(1);
  }

  const db = new Database(dbPath, { readonly: true });
  const referenced = new Set(
    db.prepare('SELECT image_url FROM listing_images').all()
      .map((row) => path.basename(String(row.image_url)))
  );
  db.close();

  const onDisk = fs.readdirSync(uploadDir).filter((name) => name !== '.gitkeep');
  const orphans = onDisk.filter((name) => !referenced.has(name));

  let freed = 0;
  orphans.forEach((name) => {
    const filePath = path.join(uploadDir, name);
    const size = fs.statSync(filePath).size;
    freed += size;
    console.log(`  ${shouldDelete ? 'silindi ' : 'öksüz  '} ${name}  (${formatSize(size)})`);
    if (shouldDelete) fs.unlinkSync(filePath);
  });

  console.log('');
  console.log(`Diskte ${onDisk.length} dosya, ${referenced.size} tanesi bir ilana bağlı.`);
  console.log(`${orphans.length} öksüz dosya, toplam ${formatSize(freed)}.`);

  if (orphans.length > 0 && !shouldDelete) {
    console.log('\nSilmek için: npm run uploads:prune -- --delete');
  }
})();
