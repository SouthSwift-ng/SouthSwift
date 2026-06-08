const axios    = require('axios');
const { pool } = require('../config/db');
const { generateSwiftDoc } = require('./swiftdocController');
const { sendEmail }         = require('./emailController');

// ── PAYSTACK HELPERS ─────────────────────────────────────────────────────────
const paystackHeaders = {
  Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
  'Content-Type': 'application/json',
};

// POST /api/deals/initiate — tenant initiates a deal
const initiateDeal = async (req, res) => {
  const { listing_id, move_in_date, lease_duration_months } = req.body;
  if (!listing_id) return res.status(400).json({ error: 'Listing ID required.' });

  const client = await pool.connect();
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

    // Room share handling
    let rent_amount;
    let is_room_share_deal = false;
    let room_share_slot_number = null;

    if (listing.is_room_share) {
      if (listing.room_share_slots_filled >= listing.room_share_slots) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'All room share slots are filled for this listing.' });
      }
      rent_amount = listing.room_share_price_per_person;
      is_room_share_deal = true;
      room_share_slot_number = listing.room_share_slots_filled + 1;
    } else {
      rent_amount = listing.rent_price;
    }

    // Calculate fees — 2.5% from tenant, 2.5% from agent (5% total split equally)
    const service_fee_tenant   = Math.round(rent_amount * 0.025);
    const service_fee_landlord = Math.round(rent_amount * 0.025);
    const total_paid          = rent_amount + service_fee_tenant;

    // Create deal record
    const dealResult = await client.query(
      `INSERT INTO deals
       (listing_id, tenant_id, agent_id, rent_amount, service_fee_tenant,
        service_fee_landlord, total_paid, status, move_in_date, lease_duration_months,
        is_room_share_deal, room_share_slot_number)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'initiated',$8,$9,$10,$11) RETURNING *`,
      [listing_id, req.user.id, listing.agent_id, rent_amount,
       service_fee_tenant, service_fee_landlord, total_paid,
       move_in_date||null, lease_duration_months||12,
       is_room_share_deal, room_share_slot_number]
    );
    const deal = dealResult.rows[0];

    // Increment room_share_slots_filled atomically within the transaction
    if (is_room_share_deal) {
      await client.query(
        'UPDATE listings SET room_share_slots_filled = room_share_slots_filled + 1 WHERE id=$1 AND room_share_slots_filled < room_share_slots',
        [listing_id]
      );
    }

    await client.query('COMMIT');

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
        callback_url: `${process.env.CLIENT_URL}/deals/${deal.id}/confirm`,
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
    await client.query('ROLLBACK');
    console.error('Deal initiation error:', err.message);
    res.status(500).json({ error: 'Failed to initiate deal. Please try again.' });
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

    // Verify amount matches expected total (Paystack returns kobo)
    const dealCheck = await pool.query(
      'SELECT id, total_paid, status, tenant_id FROM deals WHERE paystack_reference=$1',
      [reference]
    );
    if (!dealCheck.rows.length) return res.status(404).json({ error: 'Deal not found for this reference.' });
    const pendingDeal = dealCheck.rows[0];

    if (pendingDeal.status !== 'payment_pending')
      return res.status(400).json({ error: 'Payment already verified for this deal.' });

    if (req.user && pendingDeal.tenant_id !== req.user.id)
      return res.status(403).json({ error: 'Not authorised to verify this payment.' });

    const expectedKobo = pendingDeal.total_paid * 100;
    if (amount !== expectedKobo || (currency && currency !== 'NGN'))
      return res.status(400).json({ error: 'Payment amount mismatch. Contact support.' });

    // Update deal to escrow_held — only if still payment_pending (idempotent)
    const dealResult = await pool.query(
      "UPDATE deals SET status='escrow_held', updated_at=NOW() WHERE paystack_reference=$1 AND status='payment_pending' RETURNING *",
      [reference]
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

    // Generate SwiftDoc
    try {
      const docUrl = await generateSwiftDoc({ deal, listing, tenant, agent });
      await pool.query(
        "UPDATE deals SET swiftdoc_url=$1, swiftdoc_generated=true, status='docs_generated' WHERE id=$2",
        [docUrl, deal.id]
      );

      // Email tenant and agent
      await sendEmail({
        to: tenant.email,
        subject: '🛡️ SouthSwift — Funds in Escrow. Document Ready.',
        html: `
          <h2>Your SwiftShield escrow is active</h2>
          <p>Dear ${tenant.full_name},</p>
          <p>₦${deal.rent_amount.toLocaleString()} is now held securely in SwiftShield escrow.</p>
          <p>Your tenancy agreement (SwiftDoc) has been generated: <a href="${docUrl}">Download Agreement</a></p>
          <p>Once you move in and confirm, funds will be released to your landlord.</p>
          <p><strong>Deal ID:</strong> ${deal.id}</p>
        `
      });

      await sendEmail({
        to: agent.email,
        subject: '🛡️ SouthSwift — Payment secured in escrow for your listing',
        html: `
          <h2>Escrow payment received</h2>
          <p>Dear ${agent.full_name},</p>
          <p>A tenant has secured ₦${deal.rent_amount.toLocaleString()} in SwiftShield escrow for: ${listing.title}</p>
          <p>Funds will be released after the tenant confirms their move-in.</p>
        `
      });
    } catch (docErr) {
      console.error('SwiftDoc generation error:', docErr.message);
      // Still mark as escrow_held even if doc fails — don't block
    }

    // Mark listing as unavailable
    await pool.query("UPDATE listings SET is_available=false WHERE id=$1", [deal.listing_id]);

    res.json({ message: '✅ Payment verified. Funds in SwiftShield escrow.', deal_id: deal.id });
  } catch (err) {
    console.error(err.message); res.status(500).json({ error: 'Something went wrong.' });
  }
};

// POST /api/deals/:id/confirm-movein — tenant confirms move-in, releases funds
const confirmMoveIn = async (req, res) => {
  try {
    const dealResult = await pool.query('SELECT * FROM deals WHERE id=$1', [req.params.id]);
    if (!dealResult.rows.length) return res.status(404).json({ error: 'Deal not found.' });

    const deal = dealResult.rows[0];
    if (deal.tenant_id !== req.user.id) return res.status(403).json({ error: 'Not authorised.' });
    if (!['escrow_held','docs_generated'].includes(deal.status))
      return res.status(400).json({ error: `Cannot confirm move-in at status: ${deal.status}` });

    const agentRes  = await pool.query('SELECT * FROM users WHERE id=$1', [deal.agent_id]);
    const tenantRes = await pool.query('SELECT * FROM users WHERE id=$1', [deal.tenant_id]);
    const agent = agentRes.rows[0]; const tenant = tenantRes.rows[0];

    // ── Room share: check if all slots are now confirmed ──────────────────────
    if (deal.is_room_share_deal) {
      const listingRes = await pool.query('SELECT * FROM listings WHERE id=$1', [deal.listing_id]);
      const listing = listingRes.rows[0];

      // Count how many room share deals for this listing already completed (excluding this one)
      const countRes = await pool.query(`
        SELECT COUNT(*) FROM deals
        WHERE listing_id=$1 AND is_room_share_deal=true AND status='completed'
      `, [deal.listing_id]);
      const completedSoFar = parseInt(countRes.rows[0].count);
      const willBeCompleted = completedSoFar + 1;

      if (willBeCompleted >= listing.room_share_slots) {
        // All roommates confirmed — complete all room share deals and release funds
        await pool.query(
          `UPDATE deals SET status='completed', tenant_confirmed_at=NOW(), funds_released_at=NOW(), updated_at=NOW()
           WHERE listing_id=$1 AND is_room_share_deal=true AND status IN ('escrow_held','docs_generated','movein_pending')`,
          [deal.listing_id]
        );
        // Mark this deal too
        await pool.query(
          "UPDATE deals SET status='completed', tenant_confirmed_at=NOW(), funds_released_at=NOW(), updated_at=NOW() WHERE id=$1",
          [deal.id]
        );
        await pool.query(
          'UPDATE agent_profiles SET total_deals=total_deals+1 WHERE user_id=$1', [deal.agent_id]
        );
        await sendEmail({
          to: 'ceo@southswift.com.ng',
          subject: '🏠 ADMIN: Room Share Fund Release Required',
          html: `
            <h2>All Room Share Tenants Confirmed Move-In</h2>
            <p><strong>Listing ID:</strong> ${deal.listing_id}</p>
            <p><strong>Agent:</strong> ${agent.full_name} — ${agent.phone}</p>
            <p>All ${listing.room_share_slots} room share tenants have confirmed. Please release funds.</p>
          `
        });
        return res.json({ message: '✅ All roommates confirmed! Funds are being released. Thank you for using SouthSwift.' });
      } else {
        // Not all confirmed yet — mark this deal as movein_pending
        await pool.query(
          "UPDATE deals SET status='movein_pending', tenant_confirmed_at=NOW(), updated_at=NOW() WHERE id=$1",
          [deal.id]
        );
        const remaining = listing.room_share_slots - willBeCompleted;
        return res.json({
          message: `✅ Your move-in is confirmed. Funds will release when all ${listing.room_share_slots} roommates confirm. ${remaining} still pending.`
        });
      }
    }

    // ── Standard (non-room-share) deal — mark movein confirmed, admin releases funds separately
    await pool.query(
      "UPDATE deals SET status='completed', tenant_confirmed_at=NOW(), updated_at=NOW() WHERE id=$1",
      [deal.id]
    );

    // Update agent deal count
    await pool.query(
      'UPDATE agent_profiles SET total_deals=total_deals+1 WHERE user_id=$1', [deal.agent_id]
    );

    await sendEmail({
      to: 'ceo@southswift.com.ng',
      subject: '🛡️ ADMIN: Fund Release Required',
      html: `
        <h2>Tenant Confirmed Move-In</h2>
        <p><strong>Deal ID:</strong> ${deal.id}</p>
        <p><strong>Amount to release:</strong> ₦${(deal.rent_amount - deal.service_fee_landlord).toLocaleString()}</p>
        <p><strong>Agent:</strong> ${agent.full_name} — ${agent.phone}</p>
        <p><strong>Tenant:</strong> ${tenant.full_name}</p>
        <p>Please process fund release to landlord/agent immediately.</p>
      `
    });

    res.json({ message: '✅ Move-in confirmed. Funds are being released. Thank you for using SouthSwift.' });
  } catch (err) {
    console.error(err.message); res.status(500).json({ error: 'Something went wrong.' });
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
       WHERE d.tenant_id=$1 OR d.agent_id=$1
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

module.exports = { initiateDeal, verifyPayment, confirmMoveIn, raiseDispute, getMyDeals, getDeal };
