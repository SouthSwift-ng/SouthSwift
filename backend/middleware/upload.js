const multer = require('multer');
const { v2: cloudinary } = require('cloudinary');
const { CloudinaryStorage } = require('multer-storage-cloudinary');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const listingMediaStorage = new CloudinaryStorage({
  cloudinary,
  params: (req, file) => {
    if (file.fieldname === 'videos') {
      return {
        folder: 'southswift/listings-videos',
        resource_type: 'video',
        // Cloudinary auto-transcodes most phone formats — accept the common ones it ingests.
        allowed_formats: ['mp4', 'mov', 'webm', 'm4v', '3gp', '3g2', 'mkv', 'avi'],
      };
    }
    return {
      folder: 'southswift/listings',
      resource_type: 'image',
      // HEIC from iPhone + AVIF from modern Android both need to land here too.
      allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'avif'],
    };
  },
});

const agentDocStorage = new CloudinaryStorage({
  cloudinary,
  params: (req, file) => ({
    folder: 'southswift/agent-docs',
    allowed_formats: ['jpg','jpeg','png','pdf'],
    public_id: `${req.user.id}-${file.fieldname}-${Date.now()}`,
  }),
});

const uploadListingMedia = multer({
  storage: listingMediaStorage,
  // multer's fileSize limit is global per request — set to 100MB to allow video.
  // Cloudinary still enforces the per-field allowed_formats whitelist.
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.fieldname === 'videos') {
      // Phone formats vary: iOS sends video/quicktime, Android often sends video/3gpp,
      // some browsers tag MKV as video/x-matroska. Accept the realistic set.
      if (/^video\/(mp4|quicktime|webm|3gpp2?|x-m4v|x-matroska|x-msvideo|avi)$/.test(file.mimetype)) return cb(null, true);
      return cb(new Error('Only video files (mp4, mov, webm, 3gp, mkv, m4v, avi) are allowed.'), false);
    }
    if (/^image\/(jpeg|jpg|png|webp|heic|heif|avif)$/.test(file.mimetype)) return cb(null, true);
    return cb(new Error('Only image files (jpg, png, webp, heic, avif) are allowed.'), false);
  },
}).fields([
  { name: 'images', maxCount: 6 },
  { name: 'videos', maxCount: 3 },
]);

const uploadAgentDocs = multer({
  storage: agentDocStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^(image\/(jpeg|jpg|png)|application\/pdf)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only image files (jpg, png) and PDFs are allowed.'), false);
  },
}).fields([
  { name: 'id_document', maxCount: 1 },
  { name: 'selfie',      maxCount: 1 },
]);

const introVideoStorage = new CloudinaryStorage({
  cloudinary,
  params: (req, file) => ({
    folder: 'southswift/agent-videos',
    resource_type: 'video',
    allowed_formats: ['mp4', 'mov', 'webm'],
    public_id: `${req.user.id}-intro-${Date.now()}`,
  }),
});

const uploadIntroVideo = multer({
  storage: introVideoStorage,
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^video\/(mp4|quicktime|webm)$/.test(file.mimetype)) return cb(null, true);
    return cb(new Error('Only video files (mp4, mov, webm) are allowed.'), false);
  },
}).single('intro_video');

module.exports = { uploadListingMedia, uploadAgentDocs, uploadIntroVideo };
