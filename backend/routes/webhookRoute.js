const express = require('express');
const axios   = require('axios');
const router  = express.Router();
const { pool } = require('../config/db');
const { runSwiftDocBackground } = require('../controllers/dealController');
const { verifyPaystackSignature } = require('../utils/paystackSignature');
const { sendEmail } = require('../controllers/emailController');

// Best-effort auto-refund for a duplicate charge on the SAME deal (different reference,
// deal already in escrow_held). Without this, a tenant who clicks Pay twice and pays
// both checkout links silently loses the second amount — Paystack keeps it, our DB
// has no record. Fire-and-forget so a Paystack outage can't tie up the webhook ACK.
const tryAutoRefund = async (reference, dealId) => {
  try {
    const r = await axios.post('https://api.paystack.co/refund',
      { transaction: reference },
      { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`, 'Content-Type': 'application/json' }, timeout: 10000 }
    );
    console.warn(`Auto-refund queued for duplicate charge ref=${reference} deal=${dealId}: ${r.data?.data?.status || 'pending'}`);
    await sendEmail({
      to: 'ceo@southswift.com.ng',
      subject: '🛡️ ADMIN: Duplicate Payment Auto-Refund',
      html: `<p>A duplicate payment was received for deal <code>${dealId}</code> (reference <code>${reference}</code>). Auto-refund initiated. Verify in Paystack dashboard.</p>`,
    }).catch(() => {});
  } catch (refundErr) {
    console.error(`Auto-refund FAILED for duplicate charge ref=${reference} deal=${dealId}:`,
      refundErr.response?.data?.message || refundErr.message);
    // Page admin so a human can refund manually before the tenant notices.
    await sendEmail({
      to: 'ceo@southswift.com.ng',
      subject: '⚠️ ADMIN ACTION REQUIRED: Duplicate Payment — Manual Refund Needed',
      html: `<p>A duplicate payment was received for deal <code>${dealId}</code> (reference <code>${reference}</code>) and the auto-refund FAILED. Please refund the tenant manually via Paystack dashboard.</p><p>Error: ${refundErr.response?.data?.message || refundErr.message}</p>`,
    }).catch(() => {});
  }
};

router.post('/', express.raw({ type: 'application/json' }), async (req, res) => {
  const rawBody = req.body;
  if (!Buffer.isBuffer(rawBody) && typeof rawBody !== 'string')
    return res.status(400).json({ error: 'Invalid request body.' });

  if (!verifyPaystackSignature(rawBody, req.headers['x-paystack-signature'], process.env.PAYSTACK_SECRET_KEY))
    return res.status(401).json({ error: 'Invalid webhook signature.' });

  const event = JSON.parse(rawBody);
  if (event.event !== 'charge.success') return res.json({ received: true });

  const { reference, amount, currency, metadata } = event.data;
  if (!reference) return res.json({ received: true });

  try {
    // Find the deal — by reference first, then by the deal_id we embedded in the
    // transaction metadata. A retry refreshes the deal's stored reference, so a
    // payment completed on an older checkout page won't match by reference alone.
    let dealCheck = await pool.query(
      'SELECT id, total_paid, status FROM deals WHERE paystack_reference=$1',
      [reference]
    );
    const metaDealId = typeof metadata?.deal_id === 'string' &&
      /^[0-9a-fA-F-]{36}$/.test(metadata.deal_id) ? metadata.deal_id : null;
    if (!dealCheck.rows.length && metaDealId) {
      dealCheck = await pool.query(
        'SELECT id, total_paid, status FROM deals WHERE id=$1',
        [metaDealId]
      );
    }
    if (!dealCheck.rows.length) return res.json({ received: true });
    const deal = dealCheck.rows[0];

    // Duplicate charge on a deal already in escrow — Paystack still kept the money.
    // ACK fast, then queue an auto-refund and page admin. Without this branch the
    // second payment would vanish silently.
    if (deal.status === 'escrow_held' || deal.status === 'docs_generated' ||
        deal.status === 'movein_pending' || deal.status === 'completed') {
      res.json({ received: true });
      // Fire and forget — refund runs after we've ACKed.
      tryAutoRefund(reference, deal.id);
      return;
    }

    if (!['payment_pending', 'initiated'].includes(deal.status)) return res.json({ received: true });

    // pg returns BIGINT as a string. Plain `'1000' * 100` coerces fine but `===` on
    // mixed types is risky — coerce explicitly and bail loudly on NaN.
    const expectedKobo = Number(deal.total_paid) * 100;
    const receivedKobo = Number(amount);
    if (!Number.isFinite(expectedKobo) || !Number.isFinite(receivedKobo)) {
      console.error(`❌ Webhook amount-type failure: total_paid=${deal.total_paid} amount=${amount}`);
      await pool.query("UPDATE deals SET payment_anomaly=$1 WHERE id=$2",
        [`Amount-type failure: total_paid=${deal.total_paid} amount=${amount}`, deal.id]).catch(() => {});
      await sendEmail({
        to: 'ceo@southswift.com.ng',
        subject: '⚠️ ADMIN: Webhook Payment Type Failure',
        html: `<p>Deal <code>${deal.id}</code> received a charge but the amount couldn't be compared (non-numeric). Verify in Paystack dashboard before tenant notices.</p>`,
      }).catch(() => {});
      return res.json({ received: true });
    }
    if (receivedKobo !== expectedKobo || (currency && currency !== 'NGN')) {
      // ACK so Paystack doesn't retry forever, then page admin SYNCHRONOUSLY so the
      // discrepancy doesn't just live as a console log nobody reads.
      console.error(`❌ Webhook amount mismatch: expected ${expectedKobo}, got ${receivedKobo} ${currency}`);
      await pool.query("UPDATE deals SET payment_anomaly=$1 WHERE id=$2",
        [`Amount mismatch: expected ${expectedKobo}, got ${receivedKobo} ${currency}`, deal.id]).catch(() => {});
      await sendEmail({
        to: 'ceo@southswift.com.ng',
        subject: '🚨 ADMIN URGENT: Webhook Amount Mismatch on Paid Deal',
        html: `<p>Deal <code>${deal.id}</code> received a charge of <strong>${receivedKobo} kobo (${currency || 'NGN'})</strong> but expected <strong>${expectedKobo} kobo NGN</strong>. The deal is STUCK in <code>${deal.status}</code> and the tenant has paid. Verify in Paystack and either complete the deal manually or refund.</p>`,
      }).catch((e) => console.error('Mismatch admin alert failed:', e.message));
      return res.json({ received: true });
    }

    // Status guard keeps this idempotent; store the reference that was actually paid
    const dealResult = await pool.query(
      "UPDATE deals SET status='escrow_held', paystack_reference=$2, updated_at=NOW() WHERE id=$1 AND status IN ('payment_pending','initiated') RETURNING *",
      [deal.id, reference]
    );
    if (!dealResult.rows.length) return res.json({ received: true });
    const updatedDeal = dealResult.rows[0];

    // Escrow is secured and the flip is idempotent — ACK immediately so Paystack never retries.
    // Slow side-effects (doc generation, emails, listing flip) run AFTER the response.
    res.json({ received: true });

    (async () => {
      try {
        await pool.query("UPDATE listings SET is_available=false WHERE id=$1", [updatedDeal.listing_id]);
        const listingRes = await pool.query('SELECT * FROM listings WHERE id=$1', [updatedDeal.listing_id]);
        const tenantRes  = await pool.query('SELECT * FROM users WHERE id=$1', [updatedDeal.tenant_id]);
        const agentRes   = await pool.query('SELECT * FROM users WHERE id=$1', [updatedDeal.agent_id]);
        await runSwiftDocBackground({
          deal:    updatedDeal,
          listing: listingRes.rows[0],
          tenant:  tenantRes.rows[0],
          agent:   agentRes.rows[0],
        });
      } catch (bgErr) {
        console.error('Webhook post-escrow background error:', bgErr.message);
      }
    })();
  } catch (err) {
    console.error('Webhook processing error:', err.message);
    if (!res.headersSent) res.status(500).json({ error: 'Webhook processing failed.' });
  }
});

module.exports = router;
