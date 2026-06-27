const express = require('express');
const router  = express.Router();
const { agentController } = require('../controllers/agentAdminController');
const { protect, agentOnly } = require('../middleware/auth');
const { uploadAgentDocs, uploadIntroVideo } = require('../middleware/upload');

router.get('/',                   agentController.getAgents);
router.get('/banks',              protect, agentOnly, agentController.getBanks);
router.post('/resolve-account',   protect, agentOnly, express.json(), agentController.resolveAccount);
router.get('/:id',                agentController.getAgent);
router.post('/verify-request', protect, agentOnly, (req, res, next) => {
  uploadAgentDocs(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'File too large (max 10MB).' : 'Upload failed. Please check your files.' });
    next();
  });
}, agentController.submitVerification);
router.post('/intro-video', protect, agentOnly, (req, res, next) => {
  uploadIntroVideo(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'File too large (max 100MB).' : 'Upload failed. Please check your file.' });
    next();
  });
}, agentController.uploadIntroVideo);
router.get('/my/listings',        protect, agentOnly, agentController.getAgentListings);

module.exports = router;
