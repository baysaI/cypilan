// Inter'i Google'dan bir kez indirip projeye koyar ve karsiliginda yerel bir
// CSS uretir.
//
// Amac, her ziyaretcinin IP adresinin Google'a gitmesini durdurmak: yazi tipi
// fonts.googleapis.com uzerinden yuklendiginde her sayfa acilisi bir ucuncu
// tarafa istek demek, ve ziyaretcinin bundan haberi de secme sansi da yok.
//
//   node scripts/fetch-fonts.js
//
// Kaynak CSS scripts/.inter-source.css icinde duruyor; yazi tipini
// guncellemek gerektiginde o dosya Google'dan yeniden alinip bu betik
// calistiriliyor:
//
//   curl -A "Mozilla/5.0" \
//     "https://fonts.googleapis.com/css2?family=Inter:wght@300..800&display=swap" \
//     -o scripts/.inter-source.css
const fs = require('fs');
const path = require('path');
const https = require('https');

const root = path.join(__dirname, '..');
const fontDir = path.join(root, 'public', 'fonts');
const sourcePath = path.join(__dirname, '.inter-source.css');
const css = fs.readFileSync(sourcePath, 'utf8');

fs.mkdirSync(fontDir, { recursive: true });

const get = (url) => new Promise((resolve, reject) => {
  https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
    if (res.statusCode !== 200) return reject(new Error(url + ' -> ' + res.statusCode));
    const chunks = [];
    res.on('data', (chunk) => chunks.push(chunk));
    res.on('end', () => resolve(Buffer.concat(chunks)));
  }).on('error', reject);
});

const HEADER = [
  '/* Inter — kendi sunucumuzda.',
  ' *',
  ' * Onceden fonts.googleapis.com uzerinden yukleniyordu; her sayfa acilisi',
  ' * her ziyaretcinin IP adresini Google\'a gonderiyordu. Dosyalar bu klasorde,',
  ' * scripts/fetch-fonts.js ile yenileniyor - elle duzenlenmiyor.',
  ' *',
  ' * unicode-range satirlari oldugu gibi korundu: tarayici yalnizca sayfada',
  ' * gecen karakterlerin bulundugu alt kumeyi indiriyor, hepsini degil.',
  ' */',
  ''
].join('\n');

(async () => {
  // Her @font-face blogu bir alt kume (latin, greek, cyrillic...) ve ustundeki
  // yorum satiri o alt kumenin adini veriyor. Bloklar suslu paranteze kadar
  // aliniyor; '@font-face' uzerinden bolmek her parcanin sonuna bir sonraki
  // blogun yorum satirini birakiyordu.
  const blocks = [...css.matchAll(/@font-face\s*\{[^}]*\}/g)].map((m) => m[0]);
  const subsets = [...css.matchAll(/\/\* ([a-z-]+) \*\//g)].map((m) => m[1]);

  if (blocks.length === 0) throw new Error('Kaynak CSS icinde @font-face yok: ' + sourcePath);

  let out = HEADER;

  for (let i = 0; i < blocks.length; i++) {
    const subset = subsets[i] || ('subset-' + i);
    const remote = (blocks[i].match(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/) || [])[1];
    if (!remote) continue;

    const fileName = `inter-${subset}.woff2`;
    const buffer = await get(remote);
    fs.writeFileSync(path.join(fontDir, fileName), buffer);
    console.log(`${fileName}  ${(buffer.length / 1024).toFixed(1)} KB`);

    const local = blocks[i].replace(
      /url\(https:\/\/fonts\.gstatic\.com\/[^)]+\)/,
      `url(/fonts/${fileName})`
    );

    out += `/* ${subset} */\n${local}\n\n`;
  }

  fs.writeFileSync(path.join(fontDir, 'inter.css'), out.trimEnd() + '\n');
  console.log('\npublic/fonts/inter.css yazildi');
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
