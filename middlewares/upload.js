const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const { addWatermark } = require('../utils/watermark');

const uploadDir = path.join(__dirname, '../public/uploads/listings');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Desteklenmeyen dosya formatı. Sadece JPG, PNG ve WEBP kabul edilir.'), false);
    }
};

const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 10 * 1024 * 1024,
        files: 10
    }
});

const uploadListingImages = upload.array('images', 10);

const processImagesWithWatermark = async (req, res, next) => {
    if (!req.files || req.files.length === 0) {
        return next();
    }

    try {
        const processedFiles = [];
        for (const file of req.files) {
            const uniqueSuffix = Date.now() + '-' + crypto.randomBytes(4).toString('hex');
            const filename = `listing-${uniqueSuffix}.jpg`;
            const outputPath = path.join(uploadDir, filename);

            const tempPath = path.join(uploadDir, `temp-${filename}`);
            await fs.promises.writeFile(tempPath, file.buffer);

            await addWatermark(tempPath, outputPath);

            if (fs.existsSync(tempPath)) {
                await fs.promises.unlink(tempPath);
            }

            processedFiles.push({
                filename: filename,
                path: `/uploads/listings/${filename}`
            });
        }

        req.processedImages = processedFiles;
        next();
    } catch (error) {
        console.error('Error in processImagesWithWatermark:', error);
        next(error);
    }
};

module.exports = {
    uploadListingImages,
    processImagesWithWatermark
};
