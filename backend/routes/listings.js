const express  = require('express');
const router   = express.Router();
const { getListings, getListing, createListing, updateListing, deleteListing, getMyListings, getRoomShareStatus } = require('../controllers/listingController');
const { protect, agentOnly } = require('../middleware/auth');
const { uploadListingMedia } = require('../middleware/upload');

router.get('/',              getListings);
router.get('/agent/my',      protect, agentOnly, getMyListings);
router.get('/:id',                    getListing);
// Slot occupancy is non-public — leaks rental signal to scrapers otherwise.
router.get('/:id/room-share-status',  protect, getRoomShareStatus);
router.post('/', protect, agentOnly, (req, res, next) => {
  uploadListingMedia(req, res, (err) => {
    if (!err) return next();
    // Surface the real reason so the agent can act on it (wrong file type, Cloudinary down, etc.)
    // instead of seeing a generic "check your files" message every time.
    console.error('Listing media upload failed:', err.code || err.name || '', err.message || err);
    if (err.code === 'LIMIT_FILE_SIZE')
      return res.status(400).json({ error: 'File too large (max 100MB per video, 10MB per photo).' });
    if (err.code === 'LIMIT_UNEXPECTED_FILE')
      return res.status(400).json({ error: 'Too many files. Max 6 photos and 3 videos per listing.' });
    // Multer fileFilter rejections (mimetype) bubble up as plain Errors with our own messages.
    if (err.message && /Only (image|video) files/.test(err.message))
      return res.status(400).json({ error: err.message });
    // Cloudinary errors (plan limit, network) — surface up to the first useful line.
    const msg = String(err.message || 'Upload failed.').split('\n')[0].slice(0, 200);
    return res.status(400).json({ error: `Upload failed: ${msg}` });
  });
}, createListing);
router.put('/:id',           protect, agentOnly, (req, res, next) => {
  uploadListingMedia(req, res, (err) => {
    if (!err) return next();
    console.error('Listing media upload failed:', err.code || err.name || '', err.message || err);
    if (err.code === 'LIMIT_FILE_SIZE')
      return res.status(400).json({ error: 'File too large (max 100MB per video, 10MB per photo).' });
    if (err.code === 'LIMIT_UNEXPECTED_FILE')
      return res.status(400).json({ error: 'Too many files. Max 6 photos and 3 videos per listing.' });
    if (err.message && /Only (image|video) files/.test(err.message))
      return res.status(400).json({ error: err.message });
    const msg = String(err.message || 'Upload failed.').split('\n')[0].slice(0, 200);
    return res.status(400).json({ error: `Upload failed: ${msg}` });
  });
}, updateListing);
router.delete('/:id',        protect, agentOnly, deleteListing);

module.exports = router;
