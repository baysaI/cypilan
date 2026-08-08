const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

/**
 * Applies a Sahibinden-style transparent "CYPILAN.COM" watermark onto an image file.
 * @param {string} inputPath - Original uploaded file path
 * @param {string} outputPath - Destination file path for watermarked image
 */
const addWatermark = async (inputPath, outputPath) => {
    try {
        const image = sharp(inputPath);
        const metadata = await image.metadata();
        const width = metadata.width || 800;
        const height = metadata.height || 600;

        // Calculate dynamic font size based on image width
        const fontSize = Math.max(Math.round(width * 0.06), 24);
        const subFontSize = Math.max(Math.round(fontSize * 0.4), 12);

        // Generate SVG overlay with subtle transparency and shadow (Sahibinden style)
        const svgOverlay = `
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
            <!-- Center watermark with subtle rotation angle -->
            <g transform="rotate(-20, ${width / 2}, ${height / 2})">
                <text x="${width / 2}" y="${height / 2}" class="watermark-text">CYPILAN.COM</text>
                <text x="${width / 2}" y="${height / 2 + subFontSize * 1.5}" class="watermark-subtext">KIBRIS'IN İLAN PLATFORMU</text>
            </g>
        </svg>`;

        await image
            .composite([{
                input: Buffer.from(svgOverlay),
                gravity: 'center'
            }])
            .jpeg({ quality: 85 })
            .toFile(outputPath);

        return true;
    } catch (error) {
        console.error('Watermark processing error:', error);
        return false;
    }
};

module.exports = {
    addWatermark
};
