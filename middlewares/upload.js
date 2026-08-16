const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const { addWatermark } = require('../utils/watermark');
const appConfig = require('../config/app');

const sharp = require('sharp');
sharp.cache(false);

const uploadDir = path.join(__dirname, '../public/uploads/listings');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const avatarUploadDir = path.join(__dirname, '../public/uploads/avatars');
if (!fs.existsSync(avatarUploadDir)) {
    fs.mkdirSync(avatarUploadDir, { recursive: true });
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
const uploadAvatar = upload.single('avatar');

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

const processAvatarImage = async (req, res, next) => {
    if (!req.file) {
        return next();
    }

    try {
        const uniqueSuffix = Date.now() + '-' + crypto.randomBytes(4).toString('hex');
        const filename = `avatar-${uniqueSuffix}.webp`;
        const outputPath = path.join(avatarUploadDir, filename);

        await sharp(req.file.buffer)
            .rotate()
            .resize(300, 300, {
                fit: 'cover',
                position: 'center'
            })
            .webp({ quality: 85 })
            .toFile(outputPath);

        req.processedAvatar = `/uploads/avatars/${filename}`;
        next();
    } catch (error) {
        console.error('Error in processAvatarImage:', error);
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

// Removes an avatar referenced by its public URL (/uploads/avatars/<name>).
const removeAvatarByUrl = async (avatarUrl) => {
    if (typeof avatarUrl !== 'string' || !avatarUrl.startsWith('/uploads/avatars/')) {
        return Promise.resolve();
    }
    const filename = path.basename(avatarUrl);
    return fs.promises.unlink(path.join(avatarUploadDir, filename)).catch(() => {});
};

module.exports = {
    uploadListingImages,
    uploadAvatar,
    processImagesWithWatermark,
    processAvatarImage,
    discardProcessedImages,
    removeImagesByUrl,
    removeAvatarByUrl
};
