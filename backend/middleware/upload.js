const multer = require('multer');
const { v2: cloudinary } = require('cloudinary');
const { CloudinaryStorage } = require('multer-storage-cloudinary');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const listingStorage = new CloudinaryStorage({
  cloudinary,
  params: { folder: 'southswift/listings', allowed_formats: ['jpg','jpeg','png','webp'] },
});

const agentDocStorage = new CloudinaryStorage({
  cloudinary,
  params: (req, file) => ({
    folder: 'southswift/agent-docs',
    allowed_formats: ['jpg','jpeg','png','pdf'],
    public_id: `${req.user.id}-${file.fieldname}-${Date.now()}`,
  }),
});

const uploadListingImages = multer({
  storage: listingStorage,
  limits: { files: 6, fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\/(jpeg|jpg|png|webp)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only image files (jpg, png, webp) are allowed.'), false);
  },
}).array('images', 6);

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

module.exports = { uploadListingImages, uploadAgentDocs };
