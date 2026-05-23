// ── payments.js ──────────────────────────────────────────────────────────────
const express = require('express');
const router  = express.Router();
const { protect } = require('../middleware/auth');
const { verifyPayment } = require('../controllers/dealController');

// Paystack webhook — called by Paystack when payment is confirmed
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const crypto = require('crypto');
  const hash   = crypto.createHmac('sha512', process.env.PAYSTACK_SECRET_KEY)
                        .update(req.body).digest('hex');
  if (hash !== req.headers['x-paystack-signature'])
    return res.status(401).json({ error: 'Invalid webhook signature.' });

  const event = JSON.parse(req.body);
  if (event.event === 'charge.success') {
    // Build a synthetic req/res to reuse verifyPayment
    const fakeReq = { body: { reference: event.data.reference } };
    const fakeRes = {
      json:   (data) => { console.log('✅ Webhook payment verified:', data); },
      status: (code) => ({ json: (data) => console.error('❌ Webhook verify failed:', code, data) }),
    };
    await verifyPayment(fakeReq, fakeRes);
    res.json({ received: true });
  } else {
    res.json({ received: true });
  }
});

router.get('/verify/:reference', protect, async (req, res) => {
  req.body = { reference: req.params.reference };
  return verifyPayment(req, res);
});

module.exports = router;
