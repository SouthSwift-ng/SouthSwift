const express = require('express');
const router = express.Router();
const {
  getSummary,
  getBanks,
  resolveAccount,
  requestWithdrawalOtp,
  confirmWithdrawal,
} = require('../controllers/referralController');
const { protect } = require('../middleware/auth');

router.get('/summary',                    protect, getSummary);
router.get('/banks',                      protect, getBanks);
router.post('/resolve-account',           protect, resolveAccount);
router.post('/withdrawals/request-otp',   protect, requestWithdrawalOtp);
router.post('/withdrawals/confirm',       protect, confirmWithdrawal);

module.exports = router;
