// ── deals.js ─────────────────────────────────────────────────────────────────
const express = require('express');
const router  = express.Router();
const { initiateDeal, verifyPayment, confirmMoveIn, raiseDispute, cancelDeal, getMyDeals, getDeal } = require('../controllers/dealController');
const { protect } = require('../middleware/auth');

router.post('/initiate',       protect, initiateDeal);
router.post('/verify-payment', protect, verifyPayment);
router.get('/my',              protect, getMyDeals);
router.get('/:id',             protect, getDeal);
router.post('/:id/confirm-movein', protect, confirmMoveIn);
router.post('/:id/dispute',    protect, raiseDispute);
router.post('/:id/cancel',     protect, cancelDeal);

module.exports = router;
