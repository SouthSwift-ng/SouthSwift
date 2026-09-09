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
      'SELECT id, total_paid, status, inspection_fee, has_paid_inspection, inspection_skipped FROM deals WHERE paystack_reference=$1',
      [reference]
    );
    const metaDealId = typeof metadata?.deal_id === 'string' &&
      /^[0-9a-fA-F-]{36}$/.test(metadata.deal_id) ? metadata.deal_id : null;
    if (!dealCheck.rows.length && metaDealId) {
      dealCheck = await pool.query(
        'SELECT id, total_paid, status, inspection_fee, has_paid_inspection, inspection_skipped FROM deals WHERE id=$1',
        [metaDealId]
      );
    }
    if (!dealCheck.rows.length) return res.json({ received: true });
    const deal = dealCheck.rows[0];

    // Inspection payment (metadata.purpose='inspection', ref SS-INSP-...):
    // marks has_paid_inspection AND reserves the listing (deferred
    // reservation), never touches escrow status. Duplicate inspection charge
    // on an already-resolved deal is auto-refunded like rent dupes.
    if (metadata?.purpose === 'inspection') {
      if (deal.has_paid_inspection || deal.inspection_skipped) {
        res.json({ received: true });
        tryAutoRefund(reference, deal.id);
        return;
      }
      const expectedInspKobo = Number(deal.inspection_fee) * 100;
      const receivedKobo = Number(amount);
      if (!Number.isFinite(expectedInspKobo) || expectedInspKobo <= 0 ||
          receivedKobo !== expectedInspKobo || (currency && currency !== 'NGN')) {
        console.error(`❌ Webhook inspection mismatch: expected ${expectedInspKobo}, got ${receivedKobo} ${currency}`);
        await pool.query("UPDATE deals SET payment_anomaly=$1 WHERE id=$2",
          [`Inspection amount mismatch: expected ${expectedInspKobo}, got ${receivedKobo} ${currency}`, deal.id]).catch(() => {});
        await sendEmail({
          to: 'ceo@southswift.com.ng',
          subject: '🚨 ADMIN URGENT: Webhook Inspection Amount Mismatch',
          html: `<p>Deal <code>${deal.id}</code> received an inspection charge of <strong>${receivedKobo} kobo</strong> but expected <strong>${expectedInspKobo} kobo NGN</strong>. Verify in Paystack before tenant notices.</p>`,
        }).catch((e) => console.error('Inspection mismatch alert failed:', e.message));
        return res.json({ received: true });
      }
      const inspResult = await pool.query(
        `UPDATE deals SET has_paid_inspection=true, inspection_paid_at=NOW(),
          inspection_reference=$2, updated_at=NOW()
         WHERE id=$1 AND has_paid_inspection=false AND inspection_skipped=false
           AND status IN ('initiated','payment_pending')`,
        [deal.id, reference]
      );
      if (!inspResult.rows.length) return res.json({ received: true });
      res.json({ received: true });

      // Reserve + notify after ACK (slow side-effects never block Paystack).
      (async () => {
        try {
          const full = (await pool.query('SELECT * FROM deals WHERE id=$1', [deal.id])).rows[0];
          if (full.is_room_share_deal) {
            const slot = await pool.query(
              `UPDATE listings SET room_share_slots_filled = room_share_slots_filled + 1, updated_at=NOW()
               WHERE id=$1 AND room_share_slots_filled < room_share_slots RETURNING id`,
              [full.listing_id]
            );
            if (!slot.rows.length) {
              await pool.query(
                `UPDATE deals SET has_paid_inspection=false, inspection_paid_at=NULL,
                  inspection_reference=NULL, payment_anomaly=$2, updated_at=NOW() WHERE id=$1`,
                [full.id, 'Inspection paid but room-share slots full — refund required']);
              await sendEmail({
                to: 'ceo@southswift.com.ng',
                subject: ' ADMIN ACTION REQUIRED: Inspection Paid but Slots Full',
                html: `<p>Deal <code>${full.id}</code> paid inspection ref <code>${reference}</code> but all room-share slots are filled. Please refund the tenant manually via Paystack dashboard.</p>`,
              }).catch(() => {});
              tryAutoRefund(reference, full.id);
              return;
            }
          } else {
            const held = await pool.query(
              `UPDATE listings SET is_available=false, updated_at=NOW() WHERE id=$1 AND is_available=true RETURNING id`,
              [full.listing_id]
            );
            if (!held.rows.length) {
              // Another inspection already holds this full unit, or it's booked — unwind this payment
              const alreadyBooked = await pool.query(
                `SELECT 1 FROM deals WHERE listing_id=$1 AND id<>$2 AND status IN ('escrow_held','docs_generated','movein_pending','completed','disputed') LIMIT 1`,
                [full.listing_id, full.id]
              ).then(r => r.rows.length > 0).catch(() => false);
              await pool.query(
                `UPDATE deals SET has_paid_inspection=false, inspection_paid_at=NULL,
                  inspection_reference=NULL, payment_anomaly=$2, updated_at=NOW() WHERE id=$1`,
                [full.id, alreadyBooked ? 'Inspection paid but listing already booked — refund required' : 'Inspection paid but listing already held by another inspection — refund required']);
              await sendEmail({
                to: 'ceo@southswift.com.ng',
                subject: ' ADMIN ACTION REQUIRED: Inspection Paid but Unavailable',
                html: `<p>Deal <code>${full.id}</code> paid inspection ref <code>${reference}</code> but the listing is already ${alreadyBooked ? 'booked' : 'held by another inspection'}. Please refund the tenant manually via Paystack dashboard.</p>`,
              }).catch(() => {});
              tryAutoRefund(reference, full.id);
              return;
            }
          }
          const listingRes = await pool.query('SELECT title FROM listings WHERE id=$1', [full.listing_id]);
          const tenantRes  = await pool.query('SELECT full_name FROM users WHERE id=$1', [full.tenant_id]);
          const agentRes   = await pool.query('SELECT full_name, email FROM users WHERE id=$1', [full.agent_id]);
          const fee = Number(full.inspection_fee).toLocaleString();
          if (agentRes.rows[0]?.email) {
            await sendEmail({
              to: agentRes.rows[0].email,
              subject: 'SouthSwift — Tenant Paid Inspection Fee',
              html: `<p><strong>${tenantRes.rows[0]?.full_name || 'A tenant'}</strong> paid the <strong>₦${fee}</strong> inspection fee for <strong>${listingRes.rows[0]?.title || ''}</strong> (Deal <code>${full.id.slice(0, 8)}</code>). The listing is now reserved for their booking.</p>`,
            }).catch(() => {});
          }
          await sendEmail({
            to: 'ceo@southswift.com.ng',
            subject: '🔍 ADMIN: Inspection Fee Paid (Paystack webhook)',
            html: `<p>Deal <code>${full.id}</code> — inspection <strong>₦${fee}</strong> paid via Paystack (ref <code>${reference}</code>). Revenue recognised.</p>`,
          }).catch(() => {});
        } catch (bgErr) {
          console.error('Webhook post-inspection background error:', bgErr.message);
        }
      })();
      return;
    }

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
    if (!dealResult.rows.length) {
      // No flip: either a late dupe (already handled above) or money arriving on a
      // dead deal (archived — e.g. inspection hold expired mid-payment — or
      // cancelled). The latter needs a human: page admin synchronously.
      const fresh = (await pool.query('SELECT status FROM deals WHERE id=$1', [deal.id])).rows[0];
      if (fresh && ['archived', 'cancelled'].includes(fresh.status)) {
        console.error(`❌ Webhook rent on ${fresh.status} deal ${deal.id} ref ${reference}`);
        await pool.query("UPDATE deals SET payment_anomaly=$1 WHERE id=$2",
          [`Rent paid on ${fresh.status} deal (ref ${reference}) — verify in Paystack and refund or re-book manually.`, deal.id]).catch(() => {});
        await sendEmail({
          to: 'ceo@southswift.com.ng',
          subject: `🚨 ADMIN URGENT: Rent Paid on ${fresh.status === 'archived' ? 'Expired' : 'Cancelled'} Deal`,
          html: `<p>Deal <code>${deal.id}</code> received a rent charge (ref <code>${reference}</code>, <strong>${receivedKobo} kobo</strong>) but is <code>${fresh.status}</code> — likely the inspection hold expired mid-payment. Verify in Paystack and either refund the tenant or re-book them manually.</p>`,
        }).catch((e) => console.error('Dead-deal payment alert failed:', e.message));
      } else {
        tryAutoRefund(reference, deal.id);
      }
      return res.json({ received: true });
    }
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
