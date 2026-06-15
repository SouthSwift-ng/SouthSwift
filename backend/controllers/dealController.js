const axios    = require('axios');
const { pool } = require('../config/db');
const { generateSwiftDoc } = require('./swiftdocController');
const { sendEmail }         = require('./emailController');

// ── PAYSTACK HELPERS ─────────────────────────────────────────────────────────
const paystackHeaders = {
  Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
  'Content-Type': 'application/json',
};

// Generate the SwiftDoc, deliver it, and record the outcome on the deal — runs in the
// BACKGROUND after the payment response is already sent, so the slow AI + PDF + upload work
// can never time out the request or trip a Paystack webhook retry. Never throws to its caller.
async function runSwiftDocBackground({ deal, listing, tenant, agent }) {
  try {
    const { url: docUrl, error: docError } = await generateSwiftDoc({ deal, listing, tenant, agent });
    const issues = [];
    if (docError) issues.push(docError);

    if (docUrl) {
      const tEmail = await sendEmail({
        to: tenant.email,
        subject: '🛡️ SouthSwift — Funds in Escrow. Document Ready.',
        html: `
          <h2>Your SwiftShield escrow is active</h2>
          <p>Dear ${tenant.full_name},</p>
          <p>₦${Number(deal.rent_amount).toLocaleString()} is now held securely in SwiftShield escrow.</p>
          <p>Your tenancy agreement (SwiftDoc) has been generated: <a href="${docUrl}">Download Agreement</a></p>
          <p>Once you move in and confirm, funds will be released to your landlord.</p>
          <p><strong>Deal ID:</strong> ${deal.id}</p>
        `
      });
      const aEmail = await sendEmail({
        to: agent.email,
        subject: '🛡️ SouthSwift — Payment secured in escrow for your listing',
        html: `
          <h2>Escrow payment received</h2>
          <p>Dear ${agent.full_name},</p>
          <p>A tenant has secured ₦${Number(deal.rent_amount).toLocaleString()} in SwiftShield escrow for: ${listing.title}</p>
          <p>Funds will be released after the tenant confirms their move-in.</p>
        `
      });
      [tEmail, aEmail].forEach(r => { if (r && !r.ok) issues.push(`Escrow email failed: ${r.error}`); });

      await pool.query(
        "UPDATE deals SET swiftdoc_url=$1, swiftdoc_generated=true, swiftdoc_error=$2, status='docs_generated' WHERE id=$3",
        [docUrl, issues.length ? issues.join(' | ') : null, deal.id]
      );
    } else {
      // Generation failed — keep funds in escrow, but record WHY instead of hiding it
      await pool.query(
        "UPDATE deals SET swiftdoc_error=$1 WHERE id=$2",
        [issues.join(' | ') || 'Unknown SwiftDoc error', deal.id]
      );
    }
  } catch (docErr) {
    console.error('SwiftDoc background error:', docErr.message);
    await pool.query("UPDATE deals SET swiftdoc_error=$1 WHERE id=$2", [docErr.message, deal.id]).catch(() => {});
  }
}

// POST /api/deals/initiate — tenant initiates a deal
const initiateDeal = async (req, res) => {
  const { listing_id, move_in_date, lease_duration_months } = req.body;
  if (!listing_id) return res.status(400).json({ error: 'Listing ID required.' });
  if (!move_in_date) return res.status(400).json({ error: 'Move-in date is required.' });
  if (!lease_duration_months) return res.status(400).json({ error: 'Lease duration is required.' });

  const client = await pool.connect();
  let committed = false;
  try {
    await client.query('BEGIN');

    // Get listing details with row lock to prevent slot race conditions
    const listingResult = await client.query(
      'SELECT * FROM listings WHERE id=$1 AND is_available=true FOR UPDATE',
      [listing_id]
    );
    if (!listingResult.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Listing not found or unavailable.' });
    }
    const listing = listingResult.rows[0];

    // Room share is the tenant's choice on a room-share listing, not a forced flow.
    // Older clients that don't send is_room_share fall back to the listing's flag.
    const is_room_share_deal = listing.is_room_share &&
      (req.body.is_room_share === undefined
        ? true
        : req.body.is_room_share === true || req.body.is_room_share === 'true');

    // Idempotency: lock any unpaid deals this tenant already has on this listing.
    // A Paystack timeout after COMMIT used to orphan an 'initiated' deal — the user
    // saw "Failed to initiate" and every retry inserted a duplicate. Instead, reuse
    // the existing deal on retry and archive any leftovers.
    const existingResult = await client.query(
      `SELECT * FROM deals
       WHERE listing_id=$1 AND tenant_id=$2 AND status IN ('initiated','payment_pending')
       ORDER BY created_at DESC
       FOR UPDATE`,
      [listing_id, req.user.id]
    );
    const reusable = existingResult.rows.find(d => !!d.is_room_share_deal === is_room_share_deal);

    let slots_filled = Number(listing.room_share_slots_filled) || 0;
    for (const old of existingResult.rows) {
      if (reusable && old.id === reusable.id) continue;
      await client.query("UPDATE deals SET status='archived', updated_at=NOW() WHERE id=$1", [old.id]);
      if (old.is_room_share_deal && slots_filled > 0) {
        await client.query(
          'UPDATE listings SET room_share_slots_filled = GREATEST(room_share_slots_filled - 1, 0) WHERE id=$1',
          [listing_id]
        );
        slots_filled -= 1;
      }
    }

    let rent_amount;
    let room_share_slot_number = null;

    if (is_room_share_deal) {
      if (!reusable && slots_filled >= listing.room_share_slots) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'All room share slots are filled for this listing.' });
      }
      // Fall back to an even split of the full rent if the agent never set a per-person price
      const slots = Math.max(Number(listing.room_share_slots) || 1, 1);
      rent_amount = Number(listing.room_share_price_per_person) ||
                    Math.round(Number(listing.rent_price) / slots);
    } else {
      if (listing.is_room_share && slots_filled > 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'This property already has room share tenants. Please join the room share deal instead.' });
      }
      rent_amount = Number(listing.rent_price);
    }

    if (!Number.isFinite(rent_amount) || rent_amount <= 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'This listing has no valid price set. Please contact the agent or SouthSwift support.' });
    }

    // Calculate fees — 2.5% from tenant, 2.5% from agent (5% total split equally)
    const service_fee_tenant   = Math.round(rent_amount * 0.025);
    const service_fee_landlord = Math.round(rent_amount * 0.025);
    const total_paid          = rent_amount + service_fee_tenant;

    let deal;
    if (reusable) {
      // Refresh the existing deal — repairs old ₦0 / stale-total rows on retry too
      const updated = await client.query(
        `UPDATE deals SET rent_amount=$1, service_fee_tenant=$2, service_fee_landlord=$3,
           total_paid=$4, move_in_date=$5, lease_duration_months=$6, status='initiated', updated_at=NOW()
         WHERE id=$7 RETURNING *`,
        [rent_amount, service_fee_tenant, service_fee_landlord, total_paid,
         move_in_date, lease_duration_months, reusable.id]
      );
      deal = updated.rows[0];
      room_share_slot_number = deal.room_share_slot_number;
    } else {
      if (is_room_share_deal) room_share_slot_number = slots_filled + 1;

      const dealResult = await client.query(
        `INSERT INTO deals
         (listing_id, tenant_id, agent_id, rent_amount, service_fee_tenant,
          service_fee_landlord, total_paid, status, move_in_date, lease_duration_months,
          is_room_share_deal, room_share_slot_number)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'initiated',$8,$9,$10,$11) RETURNING *`,
        [listing_id, req.user.id, listing.agent_id, rent_amount,
         service_fee_tenant, service_fee_landlord, total_paid,
         move_in_date, lease_duration_months,
         is_room_share_deal, room_share_slot_number]
      );
      deal = dealResult.rows[0];

      // Increment room_share_slots_filled atomically within the transaction
      if (is_room_share_deal) {
        await client.query(
          'UPDATE listings SET room_share_slots_filled = room_share_slots_filled + 1 WHERE id=$1 AND room_share_slots_filled < room_share_slots',
          [listing_id]
        );
      }
    }

    await client.query('COMMIT');
    committed = true;

    // Initiate Paystack payment
    const paystackRes = await axios.post(
      'https://api.paystack.co/transaction/initialize',
      {
        email:     req.user.email,
        amount:    total_paid * 100, // Paystack uses kobo
        reference: `SS-${deal.id}-${Date.now()}`,
        metadata: {
          deal_id:      deal.id,
          listing_id,
          tenant_id:    req.user.id,
          custom_fields: [
            { display_name: 'Platform', variable_name: 'platform', value: 'SouthSwift SwiftShield' },
            { display_name: 'Deal ID',  variable_name: 'deal_id',  value: deal.id }
          ]
        },
        callback_url: `${process.env.CLIENT_URL}/deals/${deal.id}`,
      },
      { headers: paystackHeaders }
    );

    const { authorization_url, access_code, reference } = paystackRes.data.data;

    // Update deal with Paystack reference
    await pool.query(
      "UPDATE deals SET paystack_reference=$1, paystack_access_code=$2, status='payment_pending' WHERE id=$3",
      [reference, access_code, deal.id]
    );

    res.json({
      deal_id:           deal.id,
      payment_url:       authorization_url,
      paystack_reference: reference,
      breakdown: {
        rent:           `₦${rent_amount.toLocaleString()}`,
        swiftshield_fee: `₦${service_fee_tenant.toLocaleString()} (2.5%)`,
        total_you_pay:  `₦${total_paid.toLocaleString()}`,
      },
      message: is_room_share_deal
        ? `🏠 Room Share slot ${room_share_slot_number} secured. Complete payment to join this co-rental.`
        : '🛡️ SwiftShield escrow initiated. Complete payment to secure your deal.'
    });
  } catch (err) {
    if (!committed) await client.query('ROLLBACK');
    console.error('Deal initiation error:', err.message);
    res.status(500).json({
      error: committed
        ? 'Your deal was saved but the payment page could not be opened. Please try again — you will not be charged twice.'
        : 'Failed to initiate deal. Please try again.'
    });
  } finally {
    client.release();
  }
};

// POST /api/deals/verify-payment — Paystack webhook / manual verify
const verifyPayment = async (req, res) => {
  const { reference } = req.body;
  if (!reference) return res.status(400).json({ error: 'Payment reference required.' });

  try {
    const paystackRes = await axios.get(
      `https://api.paystack.co/transaction/verify/${reference}`,
      { headers: paystackHeaders }
    );

    const { status, metadata, amount, currency } = paystackRes.data.data;
    if (status !== 'success') return res.status(400).json({ error: 'Payment not successful.' });

    const deal_id = metadata?.deal_id;
    if (!deal_id) return res.status(400).json({ error: 'Invalid deal reference.' });

    // Find the deal — by reference first, then by the deal_id we embedded in the
    // transaction metadata. A retry refreshes the deal's stored reference, so a
    // payment completed on an older checkout page won't match by reference alone.
    let dealCheck = await pool.query(
      'SELECT id, total_paid, status, tenant_id FROM deals WHERE paystack_reference=$1',
      [reference]
    );
    if (!dealCheck.rows.length) {
      dealCheck = await pool.query(
        'SELECT id, total_paid, status, tenant_id FROM deals WHERE id=$1',
        [deal_id]
      );
    }
    if (!dealCheck.rows.length) return res.status(404).json({ error: 'Deal not found for this reference.' });
    const pendingDeal = dealCheck.rows[0];

    // 'initiated' is reachable too: Paystack accepted the charge but our
    // reference-update query failed after initialization
    if (!['payment_pending', 'initiated'].includes(pendingDeal.status))
      return res.status(400).json({ error: 'Payment already verified for this deal.' });

    if (req.user && pendingDeal.tenant_id !== req.user.id)
      return res.status(403).json({ error: 'Not authorised to verify this payment.' });

    const expectedKobo = pendingDeal.total_paid * 100;
    if (amount !== expectedKobo || (currency && currency !== 'NGN'))
      return res.status(400).json({ error: 'Payment amount mismatch. Contact support.' });

    // Update deal to escrow_held — the status guard keeps this idempotent.
    // Store the reference that was actually paid (may be an older attempt's).
    const dealResult = await pool.query(
      "UPDATE deals SET status='escrow_held', paystack_reference=$2, updated_at=NOW() WHERE id=$1 AND status IN ('payment_pending','initiated') RETURNING *",
      [pendingDeal.id, reference]
    );
    if (!dealResult.rows.length) return res.status(400).json({ error: 'Payment already verified for this deal.' });
    const deal = dealResult.rows[0];

    // Get listing and tenant info
    const listingRes = await pool.query('SELECT * FROM listings WHERE id=$1', [deal.listing_id]);
    const tenantRes  = await pool.query('SELECT * FROM users WHERE id=$1', [deal.tenant_id]);
    const agentRes   = await pool.query('SELECT * FROM users WHERE id=$1', [deal.agent_id]);

    const listing = listingRes.rows[0];
    const tenant  = tenantRes.rows[0];
    const agent   = agentRes.rows[0];

    // Escrow is secured — mark the listing unavailable and respond to the tenant immediately.
    await pool.query("UPDATE listings SET is_available=false WHERE id=$1", [deal.listing_id]);
    res.json({ message: '✅ Payment verified. Funds in SwiftShield escrow.', deal_id: deal.id });

    // SwiftDoc generation (slow AI + PDF + Cloudinary upload) runs AFTER the response so the
    // request can never time out mid-generation. Failures are recorded on the deal, not lost.
    runSwiftDocBackground({ deal, listing, tenant, agent });
    return;
  } catch (err) {
    console.error(err.message); res.status(500).json({ error: 'Something went wrong.' });
  }
};

// POST /api/deals/:id/confirm-movein — tenant confirms move-in, releases funds
const confirmMoveIn = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Lock the deal row so concurrent confirmations can't race the status/count checks.
    const dealResult = await client.query('SELECT * FROM deals WHERE id=$1 FOR UPDATE', [req.params.id]);
    if (!dealResult.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Deal not found.' }); }

    const deal = dealResult.rows[0];
    if (deal.tenant_id !== req.user.id) { await client.query('ROLLBACK'); return res.status(403).json({ error: 'Not authorised.' }); }
    if (!['escrow_held','docs_generated'].includes(deal.status)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Cannot confirm move-in at status: ${deal.status}` });
    }

    const agentRes  = await client.query('SELECT full_name, phone FROM users WHERE id=$1', [deal.agent_id]);
    const tenantRes = await client.query('SELECT full_name FROM users WHERE id=$1', [deal.tenant_id]);
    const agent  = agentRes.rows[0]  || {};
    const tenant = tenantRes.rows[0] || {};

    // ── Room share: complete all slots once the configured number of roommates confirm ──
    // Funds are NOT auto-released here — the admin release path performs the actual transfer
    // per slot. (Previously this set funds_released_at, which permanently blocked that path.)
    if (deal.is_room_share_deal) {
      const listingRes = await client.query('SELECT * FROM listings WHERE id=$1 FOR UPDATE', [deal.listing_id]);
      const listing = listingRes.rows[0];
      if (!listing) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'Listing record missing.' }); }

      const countRes = await client.query(
        "SELECT COUNT(*) FROM deals WHERE listing_id=$1 AND is_room_share_deal=true AND status='completed'",
        [deal.listing_id]
      );
      const completedSoFar = parseInt(countRes.rows[0].count, 10);
      const willBeCompleted = completedSoFar + 1;

      if (willBeCompleted >= listing.room_share_slots) {
        // Final confirmation — complete every funded room-share slot (this deal included).
        await client.query(
          `UPDATE deals SET status='completed', tenant_confirmed_at=COALESCE(tenant_confirmed_at, NOW()), updated_at=NOW()
           WHERE listing_id=$1 AND is_room_share_deal=true AND status IN ('escrow_held','docs_generated','movein_pending')`,
          [deal.listing_id]
        );
        await client.query('UPDATE agent_profiles SET total_deals=total_deals+1 WHERE user_id=$1', [deal.agent_id]);
        await client.query('COMMIT');

        await sendEmail({
          to: 'ceo@southswift.com.ng',
          subject: '🏠 ADMIN: Room Share Fund Release Required',
          html: `
            <h2>All Room Share Tenants Confirmed Move-In</h2>
            <p><strong>Listing ID:</strong> ${deal.listing_id}</p>
            <p><strong>Agent:</strong> ${agent.full_name} — ${agent.phone}</p>
            <p>All ${listing.room_share_slots} room-share tenants have confirmed. Please release funds for each slot via the admin panel.</p>
          `
        });
        return res.json({ message: '✅ All roommates confirmed! Funds will be released to your agent shortly. Thank you for using SouthSwift.' });
      }

      // Not all confirmed yet — mark just this slot confirmed.
      await client.query(
        "UPDATE deals SET status='movein_pending', tenant_confirmed_at=NOW(), updated_at=NOW() WHERE id=$1",
        [deal.id]
      );
      await client.query('COMMIT');
      const remaining = listing.room_share_slots - willBeCompleted;
      return res.json({
        message: `✅ Your move-in is confirmed. Funds release when all ${listing.room_share_slots} roommates confirm. ${remaining} still pending.`
      });
    }

    // ── Standard (non-room-share) deal — mark confirmed; admin releases funds separately ──
    await client.query(
      "UPDATE deals SET status='completed', tenant_confirmed_at=NOW(), updated_at=NOW() WHERE id=$1",
      [deal.id]
    );
    await client.query('UPDATE agent_profiles SET total_deals=total_deals+1 WHERE user_id=$1', [deal.agent_id]);
    await client.query('COMMIT');

    await sendEmail({
      to: 'ceo@southswift.com.ng',
      subject: '🛡️ ADMIN: Fund Release Required',
      html: `
        <h2>Tenant Confirmed Move-In</h2>
        <p><strong>Deal ID:</strong> ${deal.id}</p>
        <p><strong>Amount to release:</strong> ₦${(Number(deal.rent_amount) - Number(deal.service_fee_landlord)).toLocaleString()}</p>
        <p><strong>Agent:</strong> ${agent.full_name} — ${agent.phone}</p>
        <p><strong>Tenant:</strong> ${tenant.full_name}</p>
        <p>Please process fund release to the agent.</p>
      `
    });

    res.json({ message: '✅ Move-in confirmed. Funds are being released. Thank you for using SouthSwift.' });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    console.error('confirmMoveIn error:', err.message);
    if (!res.headersSent) res.status(500).json({ error: 'Something went wrong.' });
  } finally {
    client.release();
  }
};

// POST /api/deals/:id/dispute — raise a dispute
const raiseDispute = async (req, res) => {
  const { reason } = req.body;
  if (!reason) return res.status(400).json({ error: 'Dispute reason required.' });
  try {
    const dealCheck = await pool.query('SELECT * FROM deals WHERE id=$1', [req.params.id]);
    if (!dealCheck.rows.length) return res.status(404).json({ error: 'Deal not found.' });
    const deal = dealCheck.rows[0];

    if (deal.tenant_id !== req.user.id && deal.agent_id !== req.user.id)
      return res.status(403).json({ error: 'Only deal parties can raise a dispute.' });

    if (!['escrow_held', 'docs_generated', 'movein_pending'].includes(deal.status))
      return res.status(400).json({ error: `Cannot dispute a deal with status: ${deal.status}` });

    await pool.query(
      "UPDATE deals SET status='disputed', dispute_reason=$1, updated_at=NOW() WHERE id=$2 AND status IN ('escrow_held','docs_generated','movein_pending')",
      [reason, req.params.id]
    );
    // Alert admin
    await sendEmail({
      to: 'ceo@southswift.com.ng',
      subject: '⚠️ ADMIN: Deal Dispute Raised',
      html: `<p>Deal ${req.params.id} has been disputed by ${req.user.email}.</p><p>Reason: ${reason}</p>`
    });
    res.json({ message: 'Dispute raised. SouthSwift team will review within 24 hours.' });
  } catch (err) {
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
};

// GET /api/deals — get user's deals
const getMyDeals = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT d.*, l.title AS listing_title, l.address, l.city, l.state, l.images
       FROM deals d
       JOIN listings l ON l.id = d.listing_id
       WHERE (d.tenant_id=$1 OR d.agent_id=$1) AND d.status <> 'archived'
       ORDER BY d.created_at DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err.message); res.status(500).json({ error: 'Something went wrong.' });
  }
};

// GET /api/deals/:id
const getDeal = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT d.*,
              l.title AS listing_title, l.address, l.city, l.state, l.images, l.rent_period,
              t.full_name AS tenant_name, t.phone AS tenant_phone, t.email AS tenant_email,
              a.full_name AS agent_name, a.phone AS agent_phone
       FROM deals d
       JOIN listings l ON l.id = d.listing_id
       JOIN users t ON t.id = d.tenant_id
       JOIN users a ON a.id = d.agent_id
       WHERE d.id=$1`,
      [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Deal not found.' });
    const deal = result.rows[0];
    if (![deal.tenant_id, deal.agent_id].includes(req.user.id) && req.user.role !== 'admin')
      return res.status(403).json({ error: 'Not authorised to view this deal.' });
    res.json(deal);
  } catch (err) {
    console.error(err.message); res.status(500).json({ error: 'Something went wrong.' });
  }
};

// POST /api/deals/:id/cancel — cancel a deal before payment
const cancelDeal = async (req, res) => {
  const { reason } = req.body;
  if (!reason) return res.status(400).json({ error: 'Cancellation reason is required.' });

  try {
    const dealResult = await pool.query('SELECT * FROM deals WHERE id=$1', [req.params.id]);
    if (!dealResult.rows.length) return res.status(404).json({ error: 'Deal not found.' });
    const deal = dealResult.rows[0];

    if (deal.tenant_id !== req.user.id && deal.agent_id !== req.user.id)
      return res.status(403).json({ error: 'Only deal parties can cancel a deal.' });

    if (!['initiated', 'payment_pending'].includes(deal.status))
      return res.status(400).json({ error: 'Deals can only be cancelled before payment is completed. After payment, please raise a dispute through SwiftConnect.' });

    await pool.query(
      "UPDATE deals SET status='cancelled', cancellation_reason=$1, cancelled_by=$2, updated_at=NOW() WHERE id=$3",
      [reason, req.user.id, req.params.id]
    );

    // Release the room share slot — a state change, so finish it before responding
    if (deal.is_room_share_deal) {
      await pool.query(
        'UPDATE listings SET room_share_slots_filled = GREATEST(room_share_slots_filled - 1, 0) WHERE id=$1',
        [deal.listing_id]
      );
    }

    // Respond immediately. Notification emails are best-effort and must NOT block
    // the response — slow SMTP could exceed the client timeout and make a
    // successful cancellation look like a failure to the user.
    res.json({ message: 'Deal cancelled successfully.' });

    // Fire-and-forget notifications (errors logged, never surfaced to the user)
    (async () => {
      try {
        const tenantRes = await pool.query('SELECT full_name, email FROM users WHERE id=$1', [deal.tenant_id]);
        const agentRes  = await pool.query('SELECT full_name, email FROM users WHERE id=$1', [deal.agent_id]);
        const tenant = tenantRes.rows[0];
        const agent  = agentRes.rows[0];
        const cancelledByName = req.user.id === deal.tenant_id ? tenant.full_name : agent.full_name;
        const emailBody = `<h2>Deal Cancelled</h2><p>Deal for listing has been cancelled by ${cancelledByName}.</p><p><strong>Reason:</strong> ${reason}</p>`;
        await sendEmail({ to: tenant.email, subject: 'SouthSwift — Deal Cancelled', html: emailBody });
        await sendEmail({ to: agent.email, subject: 'SouthSwift — Deal Cancelled', html: emailBody });
      } catch (e) { console.error('Cancel notification error:', e.message); }
    })();
  } catch (err) {
    console.error('Cancel deal error:', err.message);
    res.status(500).json({ error: 'Something went wrong.' });
  }
};

module.exports = { initiateDeal, verifyPayment, confirmMoveIn, raiseDispute, cancelDeal, getMyDeals, getDeal, runSwiftDocBackground };
