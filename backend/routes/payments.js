// ── payments.js ──────────────────────────────────────────────────────────────
const express = require('express');
const router  = express.Router();
const { protect } = require('../middleware/auth');
const { verifyPayment } = require('../controllers/dealController');

// Webhook is now mounted separately in server.js (before express.json)

router.get('/verify/:reference', protect, async (req, res) => {
  req.body = { reference: req.params.reference };
  return verifyPayment(req, res);
});

module.exports = router;
