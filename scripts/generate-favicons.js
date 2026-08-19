const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

async function generateFavicons() {
  const sourcePath = path.join(__dirname, '../public/img/logo.png');
  const publicDir = path.join(__dirname, '../public');
  const imgDir = path.join(publicDir, 'img');

  console.log('Generating favicons from:', sourcePath);

  // Trim transparent edges first, then fit nicely into a square canvas with small padding
  const trimmed = await sharp(sourcePath)
    .trim()
    .toBuffer();

  const sizes = [
    { size: 16, name: 'favicon-16x16.png', dest: imgDir },
    { size: 32, name: 'favicon-32x32.png', dest: imgDir },
    { size: 48, name: 'favicon-48x48.png', dest: imgDir },
    { size: 96, name: 'favicon-96x96.png', dest: imgDir },
    { size: 144, name: 'favicon-144x144.png', dest: imgDir },
    { size: 192, name: 'favicon-192x192.png', dest: imgDir },
    { size: 512, name: 'favicon-512x512.png', dest: imgDir },
    { size: 180, name: 'apple-touch-icon.png', dest: imgDir },
    { size: 48, name: 'favicon.png', dest: publicDir },
    { size: 32, name: 'favicon.ico', dest: publicDir } // ICO fallback (PNG format inside .ico is standard)
  ];

  for (const item of sizes) {
    const padding = Math.round(item.size * 0.08); // 8% padding
    const innerSize = item.size - (padding * 2);

    const innerBuffer = await sharp(trimmed)
      .resize(innerSize, innerSize, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .toBuffer();

    const outputFilePath = path.join(item.dest, item.name);

    await sharp({
      create: {
        width: item.size,
        height: item.size,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      }
    })
      .composite([{ input: innerBuffer, gravity: 'center' }])
      .png()
      .toFile(outputFilePath);

    console.log(`Created: ${item.name} (${item.size}x${item.size}) in ${path.relative(publicDir, outputFilePath)}`);
  }

  // Also create a root favicon.ico in img folder just in case
  const rootIco = path.join(publicDir, 'favicon.ico');
  const imgIco = path.join(imgDir, 'favicon.ico');
  fs.copyFileSync(rootIco, imgIco);

  console.log('All favicons generated successfully!');
}

generateFavicons().catch(err => {
  console.error('Error generating favicons:', err);
  process.exit(1);
});
