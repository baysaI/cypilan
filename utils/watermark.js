const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const MAX_DIMENSION = 1600;

// Share of the image the mark is allowed to span.
const MARK_SCALE = 0.6;

// The wordmark is a bitmap built ahead of time by scripts/build-watermark.js.
//
// It used to be an SVG composited at upload time, which is where the watermark
// quietly went missing in production: rendering SVG *text* needs a font, and a
// server without one draws no glyphs and reports no error. Uploads succeeded,
// the photo was resized and re-encoded as usual, and the mark simply was not
// there. A bitmap needs no font, so the result no longer depends on what is
// installed on the machine.
const WATERMARK_FILE = path.join(__dirname, '..', 'public', 'img', 'watermark.png');

let watermarkSource = null;

const generateWatermarkBuffer = async () => {
    try {
        const WIDTH = 1600;
        const HEIGHT = 640;
        const ANGLE = -20;
        const titleSize = Math.round(WIDTH * 0.095);
        const subtitleSize = Math.round(titleSize * 0.4);

        const svg = `
        <svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
          <style>
            .mark { font-family: Arial, Helvetica, sans-serif; font-weight: 800; font-size: ${titleSize}px; fill: rgba(255, 255, 255, 0.35); letter-spacing: 6px; text-anchor: middle; }
            .sub { font-family: Arial, Helvetica, sans-serif; font-weight: 600; font-size: ${subtitleSize}px; fill: rgba(255, 255, 255, 0.25); letter-spacing: 3px; text-anchor: middle; }
          </style>
          <g transform="rotate(${ANGLE}, ${WIDTH / 2}, ${HEIGHT / 2})">
            <text x="${WIDTH / 2}" y="${HEIGHT / 2}" class="mark">CYPILAN.COM</text>
            <text x="${WIDTH / 2}" y="${HEIGHT / 2 + subtitleSize * 2}" class="sub">KIBRIS'IN İLAN PLATFORMU</text>
          </g>
        </svg>`;

        const png = await sharp(Buffer.from(svg)).png().toBuffer();
        // Try to save to disk for future uses
        try {
            const dir = path.dirname(WATERMARK_FILE);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            await sharp(png).trim({ threshold: 1 }).toFile(WATERMARK_FILE);
        } catch (_) {}

        return png;
    } catch (err) {
        console.warn('Watermark generation fallback failed:', err.message);
        return null;
    }
};

const loadWatermark = async () => {
    if (watermarkSource) return watermarkSource;

    if (fs.existsSync(WATERMARK_FILE)) {
        try {
            watermarkSource = fs.readFileSync(WATERMARK_FILE);
            return watermarkSource;
        } catch (err) {
            console.warn('Could not read existing watermark file:', err.message);
        }
    }

    watermarkSource = await generateWatermarkBuffer();
    return watermarkSource;
};

// `input` may be a Buffer or a file path. Resizes image and applies watermark.
// If watermark fails, image is still cleanly resized and saved so uploads never fail.
const addWatermark = async (input, outputPath) => {
    try {
        // Resize first, then read the real output dimensions
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
        const source = await loadWatermark();

        if (source) {
            try {
                const mark = await sharp(source)
                    .resize({
                        width: Math.max(1, Math.round(width * MARK_SCALE)),
                        height: Math.max(1, Math.round(height * MARK_SCALE)),
                        fit: 'inside'
                    })
                    .toBuffer();

                await sharp(resized.data)
                    .composite([{ input: mark, gravity: 'center' }])
                    .jpeg({ quality: 85, progressive: true })
                    .toFile(outputPath);

                return true;
            } catch (compositeErr) {
                console.warn('Watermark composite failed, falling back to clean image save:', compositeErr.message);
            }
        }

        // Direct save without watermark if watermark was unavailable or composite errored
        await sharp(resized.data)
            .jpeg({ quality: 85, progressive: true })
            .toFile(outputPath);

        return true;
    } catch (err) {
        console.error('addWatermark failed to process image:', err);
        throw err;
    }
};

module.exports = {
    addWatermark
};
