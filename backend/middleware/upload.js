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
        allowed_formats: ['mp4', 'mov', 'webm'],
      };
    }
    return {
      folder: 'southswift/listings',
      resource_type: 'image',
      allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
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
      if (/^video\/(mp4|quicktime|webm)$/.test(file.mimetype)) return cb(null, true);
      return cb(new Error('Only video files (mp4, mov, webm) are allowed.'), false);
    }
    if (/^image\/(jpeg|jpg|png|webp)$/.test(file.mimetype)) return cb(null, true);
    return cb(new Error('Only image files (jpg, png, webp) are allowed.'), false);
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

module.exports = { uploadListingMedia, uploadAgentDocs };
