const express = require('express');
const crypto  = require('crypto');
const router  = express.Router();
const { pool } = require('../config/db');
const { generateSwiftDoc } = require('../controllers/swiftdocController');
const { sendEmail }         = require('../controllers/emailController');

router.post('/', express.raw({ type: 'application/json' }), async (req, res) => {
  const rawBody = req.body;
  if (!Buffer.isBuffer(rawBody) && typeof rawBody !== 'string')
    return res.status(400).json({ error: 'Invalid request body.' });

  const hash = crypto.createHmac('sha512', process.env.PAYSTACK_SECRET_KEY)
                      .update(rawBody).digest('hex');

  if (hash !== req.headers['x-paystack-signature'])
    return res.status(401).json({ error: 'Invalid webhook signature.' });

  const event = JSON.parse(rawBody);
  if (event.event !== 'charge.success') return res.json({ received: true });

  const { reference, amount, currency } = event.data;
  if (!reference) return res.json({ received: true });

  try {
    const dealCheck = await pool.query(
      'SELECT id, total_paid, status FROM deals WHERE paystack_reference=$1',
      [reference]
    );
    if (!dealCheck.rows.length) return res.json({ received: true });
    const deal = dealCheck.rows[0];

    if (deal.status !== 'payment_pending') return res.json({ received: true });

    const expectedKobo = deal.total_paid * 100;
    if (amount !== expectedKobo || (currency && currency !== 'NGN')) {
      console.error(`❌ Webhook amount mismatch: expected ${expectedKobo}, got ${amount} ${currency}`);
      return res.status(400).json({ error: 'Amount mismatch.' });
    }

    const dealResult = await pool.query(
      "UPDATE deals SET status='escrow_held', updated_at=NOW() WHERE paystack_reference=$1 AND status='payment_pending' RETURNING *",
      [reference]
    );
    if (!dealResult.rows.length) return res.json({ received: true });
    const updatedDeal = dealResult.rows[0];

    const listingRes = await pool.query('SELECT * FROM listings WHERE id=$1', [updatedDeal.listing_id]);
    const tenantRes  = await pool.query('SELECT * FROM users WHERE id=$1', [updatedDeal.tenant_id]);
    const agentRes   = await pool.query('SELECT * FROM users WHERE id=$1', [updatedDeal.agent_id]);

    const listing = listingRes.rows[0];
    const tenant  = tenantRes.rows[0];
    const agent   = agentRes.rows[0];

    try {
      const docUrl = await generateSwiftDoc({ deal: updatedDeal, listing, tenant, agent });
      if (docUrl) {
        await pool.query(
          "UPDATE deals SET swiftdoc_url=$1, swiftdoc_generated=true, status='docs_generated' WHERE id=$2",
          [docUrl, updatedDeal.id]
        );
      }
    } catch (docErr) {
      console.error('Webhook SwiftDoc error:', docErr.message);
    }

    await pool.query("UPDATE listings SET is_available=false WHERE id=$1", [updatedDeal.listing_id]);

    res.json({ received: true });
  } catch (err) {
    console.error('Webhook processing error:', err.message);
    res.status(500).json({ error: 'Webhook processing failed.' });
  }
});

module.exports = router;
