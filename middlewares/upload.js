const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const { addWatermark } = require('../utils/watermark');
const appConfig = require('../config/app');

const uploadDir = path.join(__dirname, '../public/uploads/listings');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const MAX_FILES = appConfig.uploads.maxImagesPerListing;
const MAX_FILE_SIZE = appConfig.uploads.maxFileSize;
const ALLOWED_TYPES = appConfig.uploads.allowedImageTypes;

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
    if (ALLOWED_TYPES.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Desteklenmeyen dosya formatı. Sadece JPG, PNG ve WEBP kabul edilir.'), false);
    }
};

const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: MAX_FILE_SIZE,
        files: MAX_FILES
    }
});

const uploadListingImages = upload.array('images', MAX_FILES);

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

            await addWatermark(file.buffer, outputPath);

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

// Called when a request fails validation after the images have already been written,
// so rejected submissions do not leave orphaned files behind.
const discardProcessedImages = async (req) => {
    const files = req.processedImages || [];
    req.processedImages = [];

    await Promise.all(files.map((file) =>
        fs.promises.unlink(path.join(uploadDir, file.filename)).catch(() => {})
    ));
};

// Removes files referenced by their public URL (/uploads/listings/<name>).
const removeImagesByUrl = async (imageUrls = []) => {
    await Promise.all(imageUrls.map((imageUrl) => {
        if (typeof imageUrl !== 'string' || !imageUrl.startsWith('/uploads/listings/')) {
            return Promise.resolve();
        }
        const filename = path.basename(imageUrl);
        return fs.promises.unlink(path.join(uploadDir, filename)).catch(() => {});
    }));
};

module.exports = {
    uploadListingImages,
    processImagesWithWatermark,
    discardProcessedImages,
    removeImagesByUrl
};
