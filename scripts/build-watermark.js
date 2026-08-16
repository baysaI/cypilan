/**
 * Renders the watermark wordmark to public/img/watermark.png.
 *
 * The upload pipeline used to composite this same artwork as an SVG at request
 * time. That works on a developer machine and silently produces nothing on a
 * server without fonts installed: librsvg renders the document, finds no font
 * for the <text> nodes, draws no glyphs and reports no error — so uploads
 * succeeded with an invisible watermark. Rendering once, here, and shipping the
 * result as a bitmap takes fonts out of the production path entirely.
 *
 * Run after changing the wording:  node scripts/build-watermark.js
 */
const path = require('path');
const sharp = require('sharp');

const OUTPUT = path.join(__dirname, '..', 'public', 'img', 'watermark.png');

// Rendered at the largest size an uploaded image is resized to, so every
// composite scales down rather than up. The opacity is baked in here so the
// upload path is a plain resize-and-composite.
const WIDTH = 1600;
const HEIGHT = 640;
const ANGLE = -20;

const TITLE = 'CYPILAN.COM';
const SUBTITLE = "KIBRIS'IN İLAN PLATFORMU";

const escapeXml = (value) => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');

const titleSize = Math.round(WIDTH * 0.095);
const subtitleSize = Math.round(titleSize * 0.4);

const svg = `
<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <style>
    .mark {
      font-family: Arial, Helvetica, sans-serif;
      font-weight: 800;
      font-size: ${titleSize}px;
      fill: rgba(255, 255, 255, 0.35);
      letter-spacing: 6px;
      text-anchor: middle;
    }
    .sub {
      font-family: Arial, Helvetica, sans-serif;
      font-weight: 600;
      font-size: ${subtitleSize}px;
      fill: rgba(255, 255, 255, 0.25);
      letter-spacing: 3px;
      text-anchor: middle;
    }
  </style>
  <g transform="rotate(${ANGLE}, ${WIDTH / 2}, ${HEIGHT / 2})">
    <text x="${WIDTH / 2}" y="${HEIGHT / 2}" class="mark">${escapeXml(TITLE)}</text>
    <text x="${WIDTH / 2}" y="${HEIGHT / 2 + subtitleSize * 2}" class="sub">${escapeXml(SUBTITLE)}</text>
  </g>
</svg>`;

(async () => {
  const png = await sharp(Buffer.from(svg)).png().toBuffer();

  // A blank render is the exact failure this script exists to avoid, so refuse
  // to write one: without fonts every pixel comes out fully transparent.
  const { channels } = await sharp(png).stats();
  const alpha = channels[channels.length - 1];
  if (!alpha || alpha.max === 0) {
    throw new Error('Watermark rendered empty — no font available to draw the text.');
  }

  await sharp(png).trim({ threshold: 1 }).toFile(OUTPUT);

  const meta = await sharp(OUTPUT).metadata();
  console.log(`Watermark yazildi: ${OUTPUT} (${meta.width}x${meta.height})`);
})();
