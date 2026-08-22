// Favicon setini public/img/favicon-source.svg dosyasindan uretir.
//
// Kaynak site logosu degil: logo ada simgesi, "Cypilan" yazisi ve sologandan
// olusuyor ve arama sonuclarinda gosterildigi 16 pikselde okunaksiz bir lekeye
// donusuyordu. Favicon kaynagi bu yuzden ayri ve tek harflik bir isaret.
//
// Her boyut vektorden yeniden isleniyor, buyuk bir PNG kucultulmuyor; kucuk
// boyutlarda aradaki fark gozle goruluyor. Isaret kenardan kenara tasarlandigi
// icin kirpma veya bosluk eklenmiyor.
//
//   npm run favicons

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const publicDir = path.join(__dirname, '..', 'public');
const imgDir = path.join(publicDir, 'img');
const sourcePath = path.join(imgDir, 'favicon-source.svg');

const OUTPUTS = [
  { size: 16, name: 'favicon-16x16.png', dest: imgDir },
  { size: 32, name: 'favicon-32x32.png', dest: imgDir },
  { size: 48, name: 'favicon-48x48.png', dest: imgDir },
  { size: 96, name: 'favicon-96x96.png', dest: imgDir },
  { size: 144, name: 'favicon-144x144.png', dest: imgDir },
  { size: 192, name: 'favicon-192x192.png', dest: imgDir },
  { size: 512, name: 'favicon-512x512.png', dest: imgDir },
  { size: 180, name: 'apple-touch-icon.png', dest: imgDir },
  { size: 48, name: 'favicon.png', dest: publicDir }
];

// sharp ICO yazmiyor. Bicim bir baslik ile ardindan gelen PNG'den ibaret, ve
// bir PNG'yi .ico adiyla kaydetmek - onceki hali - gecerli bir ICO uretmiyordu:
// bazi tarayicilar iceriye bakip kurtariyor, bazilari simgeyi hic gostermiyor.
const wrapPngAsIco = (png, size) => {
  const header = Buffer.alloc(22);
  header.writeUInt16LE(0, 0);              // ayrilmis
  header.writeUInt16LE(1, 2);              // tur: ikon
  header.writeUInt16LE(1, 4);              // gorsel sayisi
  header.writeUInt8(size >= 256 ? 0 : size, 6);
  header.writeUInt8(size >= 256 ? 0 : size, 7);
  header.writeUInt8(0, 8);                 // palet yok
  header.writeUInt8(0, 9);                 // ayrilmis
  header.writeUInt16LE(1, 10);             // duzlem
  header.writeUInt16LE(32, 12);            // bit derinligi
  header.writeUInt32LE(png.length, 14);    // veri boyutu
  header.writeUInt32LE(22, 18);            // veri konumu
  return Buffer.concat([header, png]);
};

async function generateFavicons() {
  if (!fs.existsSync(sourcePath)) {
    console.error(`Kaynak bulunamadi: ${sourcePath}`);
    process.exit(1);
  }

  console.log(`Kaynak: ${path.relative(publicDir, sourcePath)}`);
  console.log('');

  const render = (size) =>
    sharp(sourcePath, { density: 600 }).resize(size, size).png().toBuffer();

  for (const item of OUTPUTS) {
    const buffer = await render(item.size);
    fs.writeFileSync(path.join(item.dest, item.name), buffer);
    console.log(`  ${item.name} (${item.size}x${item.size})`);
  }

  const icoBuffer = wrapPngAsIco(await render(32), 32);
  fs.writeFileSync(path.join(publicDir, 'favicon.ico'), icoBuffer);
  fs.writeFileSync(path.join(imgDir, 'favicon.ico'), icoBuffer);
  console.log('  favicon.ico (32x32, gercek ICO kabi)');

  console.log('');
  console.log('Favicon seti uretildi.');
}

generateFavicons().catch((error) => {
  console.error('Favicon uretilemedi:', error);
  process.exit(1);
});
