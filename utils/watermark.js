const sharp = require('sharp');

const MAX_DIMENSION = 1600;

const escapeXml = (value) => String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const buildOverlay = (width, height) => {
    const fontSize = Math.max(Math.round(width * 0.06), 24);
    const subFontSize = Math.max(Math.round(fontSize * 0.4), 12);

    return `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <style>
            .watermark-text {
                font-family: Arial, Helvetica, sans-serif;
                font-weight: 800;
                font-size: ${fontSize}px;
                fill: rgba(255, 255, 255, 0.35);
                letter-spacing: 4px;
                text-anchor: middle;
            }
            .watermark-subtext {
                font-family: Arial, Helvetica, sans-serif;
                font-weight: 600;
                font-size: ${subFontSize}px;
                fill: rgba(255, 255, 255, 0.25);
                letter-spacing: 2px;
                text-anchor: middle;
            }
        </style>
        <g transform="rotate(-20, ${width / 2}, ${height / 2})">
            <text x="${width / 2}" y="${height / 2}" class="watermark-text">CYPILAN.COM</text>
            <text x="${width / 2}" y="${height / 2 + subFontSize * 1.5}" class="watermark-subtext">${escapeXml("KIBRIS'IN İLAN PLATFORMU")}</text>
        </g>
    </svg>`;
};

// `input` may be a Buffer or a file path. Throws if the image cannot be processed,
// so callers never record an image URL for a file that was not written.
const addWatermark = async (input, outputPath) => {
    // Resize first, then read the real output dimensions so the SVG overlay always
    // matches the base image exactly.
    const resized = await sharp(input)
        .rotate()
        .resize({
            width: MAX_DIMENSION,
            height: MAX_DIMENSION,
            fit: 'inside',
            withoutEnlargement: true
        })
        .toBuffer({ resolveWithObject: true });

    const { width, height } = resized.info;

    await sharp(resized.data)
        .composite([{ input: Buffer.from(buildOverlay(width, height)), gravity: 'center' }])
        .jpeg({ quality: 85, progressive: true })
        .toFile(outputPath);

    return true;
};

module.exports = {
    addWatermark
};
