const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const { addWatermark } = require('../utils/watermark');
const appConfig = require('../config/app');

const sharp = require('sharp');
sharp.cache(false);

const uploadDirs = [
    path.join(__dirname, '../public/uploads'),
    path.join(__dirname, '../public/uploads/listings'),
    path.join(__dirname, '../public/uploads/avatars'),
    path.join(__dirname, '../public/uploads/cvs')
];

uploadDirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

const uploadDir = path.join(__dirname, '../public/uploads/listings');
const avatarUploadDir = path.join(__dirname, '../public/uploads/avatars');
const cvUploadDir = path.join(__dirname, '../public/uploads/cvs');

const MAX_FILES = appConfig.uploads.maxImagesPerListing || 20;
const MAX_FILE_SIZE = appConfig.uploads.maxFileSize || (15 * 1024 * 1024);
const ALLOWED_TYPES = appConfig.uploads.allowedImageTypes || [
    'image/jpeg', 'image/png', 'image/webp', 'image/jpg', 'image/pjpeg', 'image/x-png'
];

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
    const rawMime = (file.mimetype || '').toLowerCase().split(';')[0].trim();
    const ext = path.extname(file.originalname || '').toLowerCase();
    const allowedExts = ['.jpg', '.jpeg', '.png', '.webp'];

    if (ALLOWED_TYPES.includes(rawMime) || allowedExts.includes(ext)) {
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

const handleMulterError = (multerMiddleware) => (req, res, next) => {
    multerMiddleware(req, res, (err) => {
        if (!err) return next();

        console.warn('Upload error intercepted:', err.message);
        const isXhr = req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1);
        
        let errorMessage = 'Dosya yükleme hatası oluştu.';
        if (err.code === 'LIMIT_FILE_SIZE') {
            errorMessage = 'Yüklenen görsel boyutu çok büyük (Maksimum 15 MB).';
        } else if (err.code === 'LIMIT_FILE_COUNT') {
            errorMessage = `En fazla ${MAX_FILES} adet fotoğraf yükleyebilirsiniz.`;
        } else if (err.message) {
            errorMessage = err.message;
        }

        if (isXhr) {
            return res.status(400).json({ error: errorMessage });
        }

        req.flash('error', errorMessage);
        return res.redirect(req.get('referer') || '/listings/create');
    });
};

const uploadListingImages = handleMulterError(upload.array('images', MAX_FILES));
const uploadAvatar = handleMulterError(upload.single('avatar'));

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


// Multer instance for CV photo & PDF uploads
const cvMulter = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024 // 10 MB max for custom CV / photo
    },
    fileFilter: (req, file, cb) => {
        if (file.fieldname === 'photo') {
            if (ALLOWED_TYPES.includes(file.mimetype)) {
                return cb(null, true);
            }
            return cb(new Error('Fotoğraf için sadece JPG, PNG veya WEBP yükleyebilirsiniz.'), false);
        } else if (file.fieldname === 'cv_file') {
            if (file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf')) {
                return cb(null, true);
            }
            return cb(new Error('Özgeçmiş belgesi için sadece PDF formatı kabul edilir.'), false);
        }
        cb(null, false);
    }
});

const uploadCv = cvMulter.fields([
    { name: 'photo', maxCount: 1 },
    { name: 'cv_file', maxCount: 1 }
]);

const processCvUploads = async (req, res, next) => {
    try {
        if (req.files) {
            // Process photo if present
            if (req.files.photo && req.files.photo.length > 0) {
                const photoFile = req.files.photo[0];
                const uniqueSuffix = Date.now() + '-' + crypto.randomBytes(4).toString('hex');
                const filename = `photo-${uniqueSuffix}.webp`;
                const outputPath = path.join(cvUploadDir, filename);

                await sharp(photoFile.buffer)
                    .rotate()
                    .resize(400, 400, {
                        fit: 'cover',
                        position: 'center'
                    })
                    .webp({ quality: 88 })
                    .toFile(outputPath);

                req.processedCvPhoto = `/uploads/cvs/${filename}`;
            }

            // Process custom PDF CV if present
            if (req.files.cv_file && req.files.cv_file.length > 0) {
                const pdfFile = req.files.cv_file[0];
                const uniqueSuffix = Date.now() + '-' + crypto.randomBytes(4).toString('hex');
                const filename = `cv-${uniqueSuffix}.pdf`;
                const outputPath = path.join(cvUploadDir, filename);

                await fs.promises.writeFile(outputPath, pdfFile.buffer);

                req.processedCustomCv = {
                    url: `/uploads/cvs/${filename}`,
                    name: pdfFile.originalname.slice(0, 150),
                    size: pdfFile.size
                };
            }
        }
        next();
    } catch (error) {
        console.error('Error in processCvUploads:', error);
        next(error);
    }
};

const removeCvFileByUrl = async (fileUrl) => {
    if (typeof fileUrl !== 'string' || !fileUrl.startsWith('/uploads/cvs/')) {
        return Promise.resolve();
    }
    const filename = path.basename(fileUrl);
    return fs.promises.unlink(path.join(cvUploadDir, filename)).catch(() => {});
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
    uploadCv,
    processImagesWithWatermark,
    processAvatarImage,
    processCvUploads,
    discardProcessedImages,
    removeImagesByUrl,
    removeAvatarByUrl,
    removeCvFileByUrl
};
