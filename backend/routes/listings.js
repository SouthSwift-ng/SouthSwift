const express  = require('express');
const router   = express.Router();
const { getListings, getListing, createListing, updateListing, deleteListing, getMyListings, getRoomShareStatus } = require('../controllers/listingController');
const { protect, agentOnly } = require('../middleware/auth');
const { uploadListingMedia } = require('../middleware/upload');

router.get('/',              getListings);
router.get('/agent/my',      protect, agentOnly, getMyListings);
router.get('/:id',                    getListing);
router.get('/:id/room-share-status',  getRoomShareStatus);
router.post('/', protect, agentOnly, (req, res, next) => {
  uploadListingMedia(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'File too large (max 100MB).' : 'Upload failed. Please check your files.' });
    next();
  });
}, createListing);
router.put('/:id',           protect, agentOnly, updateListing);
router.delete('/:id',        protect, agentOnly, deleteListing);

module.exports = router;
