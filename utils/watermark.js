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

const loadWatermark = () => {
    if (watermarkSource) return watermarkSource;

    if (!fs.existsSync(WATERMARK_FILE)) {
        throw new Error(
            `Filigran görseli bulunamadı: ${WATERMARK_FILE}. ` +
            'Yeniden üretmek için: node scripts/build-watermark.js'
        );
    }

    watermarkSource = fs.readFileSync(WATERMARK_FILE);
    return watermarkSource;
};

// `input` may be a Buffer or a file path. Throws if the image cannot be processed,
// so callers never record an image URL for a file that was not written.
const addWatermark = async (input, outputPath) => {
    const source = loadWatermark();

    // Resize first, then read the real output dimensions so the mark can be
    // sized against the image it actually lands on.
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

    // `fit: inside` keeps the mark within its share of both axes, so a wide
    // panorama or a tall portrait shot never gets an overlay larger than
    // itself — which sharp rejects outright.
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
};

module.exports = {
    addWatermark
};
