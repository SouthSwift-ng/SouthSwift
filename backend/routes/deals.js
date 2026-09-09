// ── deals.js ─────────────────────────────────────────────────────────────────
const express = require('express');
const router  = express.Router();
const { initiateDeal, verifyPayment, confirmMoveIn, raiseDispute, cancelDeal, getMyDeals, getDeal, payInspection, verifyInspectionPayment, skipInspection } = require('../controllers/dealController');
const { protect } = require('../middleware/auth');
const { generateSwiftDoc } = require('../controllers/swiftdocController');

router.post('/initiate',       protect, initiateDeal);
router.post('/verify-payment', protect, verifyPayment);
router.post('/verify-inspection-payment', protect, verifyInspectionPayment);
router.get('/my',              protect, getMyDeals);
router.get('/:id',             protect, getDeal);
router.post('/:id/pay-inspection', protect, payInspection);
router.post('/:id/skip-inspection', protect, skipInspection);
router.post('/:id/confirm-movein', protect, confirmMoveIn);
router.post('/:id/dispute',    protect, raiseDispute);
router.post('/:id/cancel',     protect, cancelDeal);
router.post('/swiftdoc',  generateSwiftDoc);

module.exports = router;
