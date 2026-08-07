// ── auth.js ──────────────────────────────────────────────────────────────────
const express = require('express');
const router  = express.Router();
const { register, login, getMe, updateProfile, verifyOTP, resendOTP } = require('../controllers/authController');
const { protect } = require('../middleware/auth');

router.post('/register',    register);
router.post('/login',       login);
router.post('/verify-otp',  verifyOTP);
router.post('/resend-otp',  resendOTP);
router.get('/me',           protect, getMe);
router.put('/profile',      protect, updateProfile);

module.exports = router;
