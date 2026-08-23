// Ilan fotograflarini, avatarlari ve CV dosyalarini yedekler.
//
// Veritabani yalnizca dosyalarin yolunu tutuyor, dosyalarin kendisini degil.
// Yalnizca veritabani yedegi olan bir geri yukleme, her ilani fotografsiz
// birakirdi - kullanicinin gozunde ilanin yarisi eksik demek.
//
// Kopyalama artimli: dosya adlari zaman damgali ve benzersiz, dosyalar
// yazildiktan sonra hic degismiyor. Bu yuzden ad zaten arsivdeyse atlanıyor,
// her calismada yalnizca yeni gelenler kopyalaniyor.
//
// Arsivden hicbir sey SILINMIYOR. Bir ilan silindiginde fotograflari diskten
// kalkiyor, ama yedegin var olma sebebi tam olarak bu: yanlislikla silinen bir
// ilanin fotograflarini geri getirebilmek. Buyume gorunur olsun diye toplam
// boyut her calismada yazdiriliyor.
//
//   npm run uploads:backup

const fs = require('fs');
const path = require('path');

require('dotenv').config();

const uploadsDir = process.env.UPLOAD_DIR
  ? path.resolve(__dirname, '..', process.env.UPLOAD_DIR)
  : path.join(__dirname, '..', 'public', 'uploads');

const archiveDir = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(__dirname, '..', 'database', 'backups', 'uploads');

if (!fs.existsSync(uploadsDir)) {
  console.error(`Yukleme klasoru bulunamadi: ${uploadsDir}`);
  process.exit(1);
}

const walk = (dir, base = dir) => {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full, base);
    return [{ relative: path.relative(base, full), full }];
  });
};

console.log(`Kaynak : ${uploadsDir}`);
console.log(`Arsiv  : ${archiveDir}`);

const files = walk(uploadsDir);
let copied = 0;
let copiedBytes = 0;

files.forEach((file) => {
  const destination = path.join(archiveDir, file.relative);

  // Boyut karsilastirmasi, yarim kalmis bir kopyayi da yakaliyor: dosya adi
  // ayni ama boyutu tutmuyorsa yeniden kopyalaniyor.
  if (fs.existsSync(destination)) {
    const same = fs.statSync(destination).size === fs.statSync(file.full).size;
    if (same) return;
  }

  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(file.full, destination);
  copied += 1;
  copiedBytes += fs.statSync(destination).size;
});

const archived = fs.existsSync(archiveDir) ? walk(archiveDir) : [];
const archivedBytes = archived.reduce((total, file) => total + fs.statSync(file.full).size, 0);

const mb = (bytes) => (bytes / 1024 / 1024).toFixed(1);

console.log('');
console.log(`  Kaynakta   : ${files.length} dosya`);
console.log(`  Kopyalanan : ${copied} yeni dosya (${mb(copiedBytes)} MB)`);
console.log(`  Arsivde    : ${archived.length} dosya (${mb(archivedBytes)} MB)`);
