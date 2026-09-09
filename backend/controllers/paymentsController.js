const crypto  = require('crypto');
const axios   = require('axios');
const { pool } = require('../config/db');
const { escapeHtml }    = require('../utils/escapeHtml');
const { runSwiftDocBackground, reserveListingForDeal } = require('./dealController');
const { dealHoldsReservation, inspectionSatisfied } = require('../utils/money');
const { handleEmail } = require('../utils/emailService');

const ADMIN_NOTIFY_EMAIL =  'finance@southswift.com.ng';
// const ADMIN_NOTIFY_EMAIL = process.env.ADMIN_EMAIL || 'ceo@southswift.com.ng';

// Curated list of Nigerian banks for the payer-bank dropdown. (The Paystack
// /bank proxy in agentAdminController requires a Paystack key, which isn't
// available pre-production — this keeps the field populated without that dependency.)
const NIGERIAN_BANKS = [
  'Access Bank', 'Ecobank Nigeria', 'Fidelity Bank', 'First Bank of Nigeria',
  'First City Monument Bank (FCMB)', 'Globus Bank', 'Guaranty Trust Bank (GTBank)',
  'Heritage Bank', 'Keystone Bank', 'Moniepoint Microfinance Bank', 'OPay',
  'PalmPay', 'Parallex Bank', 'Polaris Bank', 'Premium Trust Bank', 'Providus Bank',
  'Stanbic IBTC Bank', 'Standard Chartered Bank', 'Sterling Bank', 'SunTrust Bank',
  'Union Bank of Nigeria', 'United Bank for Africa (UBA)', 'Unity Bank',
  'Wema Bank', 'Zenith Bank', 'Kuda Microfinance Bank', 'Citibank Nigeria',
  'Titan Trust Bank',
];

// In-process cache of the bank list (refreshed at most every 3 days) so we don't
// hit Paystack on every page load.
const BANK_CACHE_TTL_MS = 3 * 24 * 60 * 60 * 1000;
let bankCache = { at: 0, banks: null };

// GET /api/payments/banks — list of Nigerian banks for the payer-bank dropdown.
// Prefers the live Paystack /bank list when a key is configured; otherwise falls
// back to the curated static list so the field is never empty pre-production.
const getNigerianBanks = async (req, res) => {
  if (bankCache.banks && Date.now() - bankCache.at < BANK_CACHE_TTL_MS) {
    return res.json({ banks: bankCache.banks });
  }
  let banks = NIGERIAN_BANKS;
  if (process.env.PAYSTACK_SECRET_KEY) {
    try {
      const r = await axios.get('https://api.paystack.co/bank?country=nigeria&currency=NGN', {
        headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
        timeout: 10000,
      });
      const live = (r.data?.data || [])
        .filter(b => b.country === 'Nigeria' && b.active !== false)
        .map(b => b.name)
        .sort((a, b) => a.localeCompare(b));
      if (live.length) banks = live;
    } catch (e) {
      console.warn('Paystack bank list fetch failed, using static fallback:', e.message);
    }
  }
  bankCache = { at: Date.now(), banks };
  res.json({ banks });
};

// Server-generated, human-readable unique transaction reference. The UNIQUE
// constraint on payment_transactions.reference is the source of truth; this
// generator just makes collisions (and the retry loop) practically impossible.
const generateTxnReference = () =>
  `SS-TRX-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;

// GET /api/payments/account — SouthSwift's receiving account for manual transfers.
const getCompanyAccount = async (req, res) => {
  const account_name   = process.env.SS_ACCOUNT_NAME;
  const account_number = process.env.SS_ACCOUNT_NUMBER;
  const bank_name      = process.env.SS_BANK_NAME;
  if (!account_name || !account_number || !bank_name)
    return res.status(503).json({ error: 'Company bank account is not configured. Please contact support.' });
  res.json({ account_name, account_number, bank_name });
};

// POST /api/payments/submit — tenant submits transfer proof for admin review.
// payment_type: 'rent' (default, full escrow) or 'inspection' (per-deal
// inspection fee). Scoped per type: an inspection proof and a rent proof can
// pend side-by-side; same-type duplicates stay blocked.
const submitTransfer = async (req, res) => {
  const { deal_id, amount_naira, payer_bank, transfer_reference, transfer_date } = req.body;
  const payment_type = req.body.payment_type === 'inspection' ? 'inspection' : 'rent';
  if (!deal_id) return res.status(400).json({ error: 'Deal ID required.' });
  if (!transfer_reference || !transfer_reference.trim())
    return res.status(400).json({ error: 'Transfer reference is required.' });
  if (!payer_bank || !payer_bank.trim())
    return res.status(400).json({ error: 'The bank you transferred from is required.' });
  if (!transfer_date)
    return res.status(400).json({ error: 'Transfer date is required.' });
  if (!req.file)
    return res.status(400).json({ error: 'A receipt screenshot or PDF is required.' });
  const amount = Math.round(Number(amount_naira));
  if (!Number.isFinite(amount) || amount <= 0)
    return res.status(400).json({ error: 'A valid amount sent is required.' });

  const receipt_url = req.file?.path || null;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const dealRes = await client.query('SELECT * FROM deals WHERE id=$1 FOR UPDATE', [deal_id]);
    if (!dealRes.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Deal not found.' }); }
    const deal = dealRes.rows[0];
    if (deal.tenant_id !== req.user.id) { await client.query('ROLLBACK'); return res.status(403).json({ error: 'Not authorised for this deal.' }); }
    if (!['initiated', 'payment_pending'].includes(deal.status)) {
      await client.query('ROLLBACK');
      if (deal.status === 'archived')
        return res.status(400).json({ error: 'This booking expired and the unit was released. Please start a fresh booking from the listing page.' });
      return res.status(400).json({ error: `Cannot submit proof for a deal in status: ${deal.status}` });
    }

    const isInspection = payment_type === 'inspection';
    const expectedAmount = isInspection ? Number(deal.inspection_fee) || 0 : Number(deal.total_paid);
    if (isInspection) {
      if (expectedAmount <= 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'This listing has no inspection fee.' });
      }
      if (deal.has_paid_inspection || deal.inspection_skipped) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Inspection already resolved for this deal.' });
      }
    } else if (!inspectionSatisfied(deal)) {
      // Rent escrow requires the inspection gate first (paid, skipped, or no
      // fee). The wizard enforces order; this guards direct API submissions.
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Please complete the inspection step first.' });
    }

    // Idempotent per type: a pending_review txn of the SAME type already
    // exists → return it, don't duplicate. The other type is unaffected.
    const existing = await client.query(
      "SELECT * FROM payment_transactions WHERE deal_id=$1 AND payment_type=$2 AND status='pending_review' ORDER BY created_at DESC LIMIT 1",
      [deal_id, payment_type]
    );
    if (existing.rows.length) {
      await client.query('COMMIT');
      return res.json({ message: `A pending ${payment_type} proof already exists for this deal.`, transaction: existing.rows[0] });
    }

    // Generate a unique reference, retrying (rare) collisions. If the partial-unique
    // index still rejects us (a concurrent submit won the race), return the existing one.
    let inserted = null;
    for (let attempt = 0; attempt < 3 && !inserted; attempt++) {
      const reference = generateTxnReference();
      try {
        const r = await client.query(
          `INSERT INTO payment_transactions
            (deal_id, reference, tenant_id, payment_type, amount_expected_naira, amount_naira,
             payer_bank, transfer_reference, transfer_date, receipt_url, status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pending_review') RETURNING *`,
          [deal_id, reference, req.user.id, payment_type, expectedAmount, amount,
           payer_bank?.trim() || null, transfer_reference.trim(),
           transfer_date ? new Date(transfer_date) : null, receipt_url]
        );
        inserted = r.rows[0];
      } catch (insErr) {
        const msg = insErr.message || '';
        const isDup = /duplicate|uniq_pending_txn_per_deal/i.test(msg);
        if (!isDup) throw insErr;
        const ex = await client.query(
          "SELECT * FROM payment_transactions WHERE deal_id=$1 AND payment_type=$2 AND status='pending_review' LIMIT 1", [deal_id, payment_type]);
        if (ex.rows[0]) { inserted = ex.rows[0]; break; }
      }
    }
    if (!inserted) { await client.query('ROLLBACK'); return res.status(500).json({ error: 'Could not create transaction reference. Please try again.' }); }

    await client.query(
      "INSERT INTO transaction_audit (transaction_id, actor_id, actor_role, action, note) VALUES ($1,$2,$3,'created',$4)",
      [inserted.id, req.user.id, req.user.role, `Submitted transfer proof: ${transfer_reference.trim()}`]
    );

    await client.query('COMMIT');

    // Notify tenant + admin (best-effort, non-blocking).
    (async () => {
      try {
        const tenantRes = await pool.query('SELECT full_name, email FROM users WHERE id=$1', [req.user.id]);
        const tenant = tenantRes.rows[0];
        const kindLabel = isInspection ? 'inspection fee' : 'rent';
        if (tenant?.email) {
          await handleEmail({
            to: tenant.email,
            subject: '🛡️ SouthSwift — Transfer Proof Received',
            html: `<h2>We received your transfer proof</h2>
              <p>Dear ${escapeHtml(tenant.full_name)},</p>
              <p>Thank you. We've received your ${kindLabel} transfer proof for Deal <strong>${deal_id.slice(0, 8)}</strong> and it's now awaiting admin confirmation.</p>
              <p><strong>Transaction Reference:</strong> ${inserted.reference}</p>
              <p><strong>Amount sent:</strong> ₦${amount.toLocaleString()}</p>
              ${isInspection
                ? '<p>Once an admin confirms it, you can continue your booking.</p>'
                : '<p>Your rent will be secured in SwiftShield escrow once an admin confirms the transfer. You\'ll get a receipt by email.</p>'}`,
          });
        }
        await handleEmail({
          to: ADMIN_NOTIFY_EMAIL,
          subject: '🛡️ ADMIN: New Transfer Awaiting Review',
          html: `<h2>New bank transfer awaiting review</h2>
            <p><strong>Type:</strong> ${kindLabel}</p>
            <p><strong>Deal ID:</strong> ${deal_id}</p>
            <p><strong>Tenant:</strong> ${escapeHtml(tenant?.full_name || '')} (${tenant?.email || ''})</p>
            <p><strong>Transaction Reference:</strong> ${inserted.reference}</p>
            <p><strong>Amount sent:</strong> ₦${amount.toLocaleString()} (expected ₦${Number(expectedAmount).toLocaleString()})</p>
            <p><strong>Transfer Ref:</strong> ${escapeHtml(transfer_reference.trim())}</p>
            <p>Review and approve in the admin panel → Transactions.</p>`,
        });
      } catch (e) { console.error('submitTransfer notify error:', e.message); }
    })();

    res.json({ message: 'Transfer proof submitted. Awaiting admin confirmation.', transaction: inserted });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    console.error('submitTransfer error:', err.message);
    res.status(500).json({ error: 'Something went wrong submitting your proof.' });
  } finally {
    client.release();
  }
};

// GET /api/admin/transactions — queue + audit list (admin).
const listTransactions = async (req, res) => {
  try {
    const { status, payment_type } = req.query;
    const params = [];
    const conds = [];
    if (status) { params.push(status); conds.push(`t.status=$${params.length}`); }
    if (payment_type === 'rent' || payment_type === 'inspection') {
      params.push(payment_type); conds.push(`t.payment_type=$${params.length}`);
    }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const result = await pool.query(`
      SELECT t.*, d.listing_id, d.total_paid, d.inspection_fee, d.status AS deal_status,
             l.title AS listing_title, l.city, l.state,
             u.full_name AS tenant_name, u.email AS tenant_email
       FROM payment_transactions t
       JOIN deals d ON d.id = t.deal_id
       JOIN listings l ON l.id = d.listing_id
       JOIN users u ON u.id = t.tenant_id
       ${where}
       ORDER BY CASE WHEN t.status='pending_review' THEN 0 ELSE 1 END, t.created_at DESC
       LIMIT 200
     `, params);
    res.json(result.rows);
  } catch (err) { console.error(err.message); res.status(500).json({ error: 'Something went wrong.' }); }
};

// GET /api/admin/transactions/:id — detail + audit timeline (admin).
const getTransaction = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT t.*, d.listing_id, d.total_paid, d.inspection_fee, d.status AS deal_status,
             l.title AS listing_title, l.city, l.state,
             u.full_name AS tenant_name, u.email AS tenant_email,
             a.full_name AS reviewer_name
       FROM payment_transactions t
       JOIN deals d ON d.id = t.deal_id
       JOIN listings l ON l.id = d.listing_id
       JOIN users u ON u.id = t.tenant_id
       LEFT JOIN users a ON a.id = t.reviewed_by
       WHERE t.id=$1
     `, [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Transaction not found.' });
    const txn = result.rows[0];
    const audit = await pool.query(
      `SELECT ta.*, u.full_name AS actor_name
       FROM transaction_audit ta LEFT JOIN users u ON u.id = ta.actor_id
       WHERE ta.transaction_id=$1 ORDER BY ta.created_at ASC`, [req.params.id]);
    res.json({ transaction: txn, audit: audit.rows });
  } catch (err) { console.error(err.message); res.status(500).json({ error: 'Something went wrong.' }); }
};

// PUT /api/admin/transactions/:id — approve or reject (admin).
const reviewTransaction = async (req, res) => {
  const { action, note } = req.body;
  if (!['approve', 'reject'].includes(action))
    return res.status(400).json({ error: "action must be 'approve' or 'reject'." });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const txnRes = await client.query('SELECT * FROM payment_transactions WHERE id=$1 FOR UPDATE', [req.params.id]);
    if (!txnRes.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Transaction not found.' }); }
    const txn = txnRes.rows[0];
    if (txn.status !== 'pending_review') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Transaction is already ${txn.status}.` });
    }

    const dealRes = await client.query('SELECT * FROM deals WHERE id=$1 FOR UPDATE', [txn.deal_id]);
    if (!dealRes.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Deal not found.' }); }
    const deal = dealRes.rows[0];
    // Rows predating the discriminator backfill as rent; default defensively.
    const txnType = txn.payment_type || 'rent';
    const isInspectionTxn = txnType === 'inspection';

    if (action === 'reject') {
      // Inspection rejections never release the listing: the rent reservation
      // belongs to the deal, not the inspection proof — tenant can resubmit.
      // Pre-inspection deals hold no reservation either — releasing would free
      // another tenant's (or nobody's) hold.
      const holdsReservation = dealHoldsReservation(deal);
      const release = !!req.body.release_listing && !isInspectionTxn && holdsReservation;
      await client.query(
        "UPDATE payment_transactions SET status='rejected', reviewed_by=$1, reviewed_at=NOW(), review_note=$2, updated_at=NOW() WHERE id=$3",
        [req.user.id, note || null, txn.id]);
      await client.query(
        "INSERT INTO transaction_audit (transaction_id, actor_id, actor_role, action, note) VALUES ($1,$2,$3,'rejected',$4)",
        [txn.id, req.user.id, req.user.role, `${note || 'Rejected by admin'}${release ? ' — listing released' : ' — listing held'}`]);

      // "Reject & release unit" frees the reservation; "Reject proof (keep held)"
      // leaves it reserved so the tenant can resubmit. Guarded so a unit already
      // booked by another deal is never freed.
      if (release) {
        if (deal.is_room_share_deal) {
          await client.query(
            `UPDATE listings l
             SET room_share_slots_filled = GREATEST(l.room_share_slots_filled - 1, 0),
                 is_available = (l.room_share_slots_filled - 1 < l.room_share_slots)
             WHERE id=$1`, [deal.listing_id]);
        } else {
          await client.query(
            `UPDATE listings SET is_available=true WHERE id=$1
             AND NOT EXISTS (SELECT 1 FROM deals d
                             WHERE d.listing_id=$1 AND d.status IN ('escrow_held','docs_generated','movein_pending','completed','disputed'))`,
            [deal.listing_id]);
        }
      }

      await client.query('COMMIT');

      // Notify the tenant (best-effort, non-blocking).
      (async () => {
        try {
          const tenantRes = await pool.query('SELECT full_name, email FROM users WHERE id=$1', [deal.tenant_id]);
          const tenant = tenantRes.rows[0];
          if (tenant?.email) {
            await handleEmail({
              to: tenant.email,
              subject: '🛡️ SouthSwift — Transfer Proof Rejected',
              html: `<h2>Your transfer proof was rejected</h2>
                <p>Dear ${escapeHtml(tenant.full_name)},</p>
                <p>An admin reviewed the transfer proof for Deal <strong>${deal.id.slice(0, 8)}</strong> and rejected it${note ? ` with the note: “${escapeHtml(note)}”` : ''}.</p>
                ${release
                  ? '<p>The listing is now open to other tenants. If you have already made the bank transfer, please resubmit corrected proof promptly or contact SouthSwift support about a refund.</p>'
                  : '<p>Your reservation is still held. You can submit a corrected proof from your deal page.</p>'}
              `,
            });
          }
        } catch (e) { console.error('reject notify error:', e.message); }
      })();

      res.json({ message: release ? 'Transaction rejected and listing released.' : 'Transaction rejected. Listing reservation kept.' });
      return;
    }

    // ── APPROVE ──

    // Inspection approval: mark has_paid_inspection AND reserve the listing
    // (deferred reservation — the unit stays open while tenants inspect).
    // SouthSwift revenue, non-refundable. Never flips deal.status.
    // Returns early — the escrow flip below is rent-only.
    if (isInspectionTxn) {
      if (deal.has_paid_inspection || deal.inspection_skipped) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Inspection already resolved for this deal.' });
      }
      if (!['initiated', 'payment_pending'].includes(deal.status)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `Deal is no longer awaiting payment — cannot approve (status: ${deal.status}).` });
      }
      // Guard: listing must still be available for inspection. Prevent admin from
      // approving two inspections on the same full unit (<24h) or approving a
      // property already booked in escrow — the second tenant would otherwise
      // believe they hold a reserved unit.
      const availCheck = await client.query('SELECT is_available, is_room_share FROM listings WHERE id=$1 FOR UPDATE', [deal.listing_id]);
      const availListing = availCheck.rows[0];
      if (!availListing) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Listing not found.' });
      }
      const bookedCheck = await client.query(
        `SELECT 1 FROM deals WHERE listing_id=$1 AND id<>$2 AND status IN ('escrow_held','docs_generated','movein_pending','completed','disputed') LIMIT 1`,
        [deal.listing_id, deal.id]
      );
      if (bookedCheck.rows.length) {
        await client.query(
          "UPDATE payment_transactions SET status='rejected', reviewed_by=$1, reviewed_at=NOW(), review_note=$2, updated_at=NOW() WHERE id=$3",
          [req.user.id, 'Rejected: listing already booked and no longer available for inspection.', txn.id]);
        await client.query(
          "INSERT INTO transaction_audit (transaction_id, actor_id, actor_role, action, note) VALUES ($1,$2,$3,'rejected',$4)",
          [txn.id, req.user.id, req.user.role, 'Auto-rejected: listing already booked']);
        await client.query('COMMIT');
        return res.status(409).json({ error: 'Listing is already booked. Inspection cannot be approved. Please refund the fee.' });
      }
      if (!deal.is_room_share_deal && !availListing.is_available) {
        await client.query(
          "UPDATE payment_transactions SET status='rejected', reviewed_by=$1, reviewed_at=NOW(), review_note=$2, updated_at=NOW() WHERE id=$3",
          [req.user.id, 'Rejected: listing is currently reserved by another tenant (inspection hold).', txn.id]);
        await client.query(
          "INSERT INTO transaction_audit (transaction_id, actor_id, actor_role, action, note) VALUES ($1,$2,$3,'rejected',$4)",
          [txn.id, req.user.id, req.user.role, 'Auto-rejected: already held by another inspection']);
        await client.query('COMMIT');
        return res.status(409).json({ error: 'Listing is currently reserved by another tenant who paid inspection. Cannot approve a second inspection. Please refund.' });
      }
      // Room-share: refuse BEFORE setting any flag — a rejected approval must
      // leave has_paid_inspection=false so the tenant can be refunded cleanly.
      if (deal.is_room_share_deal) {
        const slotRes = await client.query(
          `SELECT room_share_slots, room_share_slots_filled FROM listings WHERE id=$1`,
          [deal.listing_id]
        );
        const slotListing = slotRes.rows[0];
        if (!slotListing || Number(slotListing.room_share_slots_filled) >= Number(slotListing.room_share_slots)) {
          await client.query(
            "UPDATE payment_transactions SET status='rejected', reviewed_by=$1, reviewed_at=NOW(), review_note=$2, updated_at=NOW() WHERE id=$3",
            [req.user.id, 'Rejected: all room-share slots filled.', txn.id]);
          await client.query(
            "INSERT INTO transaction_audit (transaction_id, actor_id, actor_role, action, note) VALUES ($1,$2,$3,'rejected',$4)",
            [txn.id, req.user.id, req.user.role, 'Auto-rejected: room-share slots full']);
          await client.query('COMMIT');
          return res.status(409).json({ error: 'All room-share slots are filled. Please refund the inspection fee manually.' });
        }
      }
      await client.query(
        `UPDATE deals SET has_paid_inspection=true, inspection_paid_at=NOW(),
          inspection_reference=$1, updated_at=NOW()
         WHERE id=$2 AND has_paid_inspection=false AND inspection_skipped=false`,
        [txn.reference, deal.id]);
      // Claim the reservation now (atomic guarded increment for room-share —
      // a lost race resets the flag so the tenant stays refundable).
      const reservation = await reserveListingForDeal(client, deal);
      if (!reservation.reserved) {
        await client.query(
          `UPDATE deals SET has_paid_inspection=false, inspection_paid_at=NULL,
            inspection_reference=NULL, updated_at=NOW() WHERE id=$1`,
          [deal.id]);
        const isAlreadyHeld = reservation.reason === 'already_held';
        const rejectNote = isAlreadyHeld ? 'Rejected: listing already reserved by another inspection.' : 'Rejected: all room-share slots filled.';
        const auditNote = isAlreadyHeld ? 'Auto-rejected: already held by another inspection' : 'Auto-rejected: room-share slots full';
        const errMsg = isAlreadyHeld ? 'Listing is currently reserved by another tenant. Cannot approve. Please refund.' : 'All room-share slots are filled. Please refund the inspection fee manually.';
        await client.query(
          "UPDATE payment_transactions SET status='rejected', reviewed_by=$1, reviewed_at=NOW(), review_note=$2, updated_at=NOW() WHERE id=$3",
          [req.user.id, rejectNote, txn.id]);
        await client.query(
          "INSERT INTO transaction_audit (transaction_id, actor_id, actor_role, action, note) VALUES ($1,$2,$3,'rejected',$4)",
          [txn.id, req.user.id, req.user.role, auditNote]);
        await client.query('COMMIT');
        return res.status(409).json({ error: errMsg });
      }
      await client.query(
        "UPDATE payment_transactions SET status='approved', reviewed_by=$1, reviewed_at=NOW(), review_note=$2, updated_at=NOW() WHERE id=$3",
        [req.user.id, note || 'Inspection fee approved', txn.id]);
      await client.query(
        "INSERT INTO transaction_audit (transaction_id, actor_id, actor_role, action, note) VALUES ($1,$2,$3,'approved',$4)",
        [txn.id, req.user.id, req.user.role, note || 'Inspection fee approved']);
      await client.query('COMMIT');

      const tenant = (await pool.query('SELECT * FROM users WHERE id=$1', [deal.tenant_id])).rows[0];
      const agent  = (await pool.query('SELECT * FROM users WHERE id=$1', [deal.agent_id])).rows[0];
      const listingFull = (await pool.query('SELECT title FROM listings WHERE id=$1', [deal.listing_id])).rows[0] || {};
      (async () => {
        try {
          const paid = Number(txn.amount_naira || deal.inspection_fee);
          if (tenant?.email) {
            const rEmail = await handleEmail({
              to: tenant.email,
              subject: '🛡️ SouthSwift — Inspection Fee Confirmed',
              html: `<h2>Inspection fee confirmed</h2>
                <p>Dear ${escapeHtml(tenant.full_name)},</p>
                <p>Your inspection fee of <strong>₦${paid.toLocaleString()}</strong> for <strong>${escapeHtml(listingFull.title || '')}</strong> (Deal <strong>${deal.id.slice(0, 8)}</strong>) has been confirmed.</p>
                <p><strong>Receipt / Transaction ID:</strong> ${txn.reference}</p>
                <p>This fee is non-refundable and the listing is now reserved for your booking. You can now continue booking.</p>`,
            });
            if (rEmail && rEmail.ok) {
              await pool.query("UPDATE payment_transactions SET receipt_sent_at=NOW() WHERE id=$1", [txn.id]).catch(() => {});
              await pool.query(
                "INSERT INTO transaction_audit (transaction_id, actor_id, actor_role, action) VALUES ($1,$2,$3,'receipt_sent')",
                [txn.id, req.user.id, req.user.role]).catch(() => {});
            }
          }
          if (agent?.email) {
            await handleEmail({
              to: agent.email,
              subject: 'SouthSwift — Tenant Paid Inspection Fee',
              html: `<h2>Inspection fee paid</h2>
                <p>Dear ${escapeHtml(agent.full_name)},</p>
                <p><strong>${escapeHtml(tenant?.full_name || '')}</strong> paid the <strong>₦${paid.toLocaleString()}</strong> inspection fee for <strong>${escapeHtml(listingFull.title || '')}</strong> (Deal <code>${deal.id.slice(0, 8)}</code>). The listing is now reserved for their booking — please schedule their inspection visit.</p>`,
            });
          }
          await handleEmail({
            to: ADMIN_NOTIFY_EMAIL,
            subject: '🛡️ ADMIN: Inspection Fee Approved',
            html: `<h2>Inspection fee approved</h2>
              <p><strong>Transaction:</strong> ${txn.reference}</p>
              <p><strong>Approved by:</strong> ${escapeHtml(req.user.full_name)} (${req.user.email})</p>
              <p><strong>Deal ID:</strong> ${deal.id}</p>
              <p><strong>Amount:</strong> ₦${paid.toLocaleString()}</p>`,
          });
        } catch (e) { console.error('inspection approve notify error:', e.message); }
      })();

      res.json({ message: '✅ Inspection fee approved. Tenant can continue booking.', transaction_id: txn.id });
      return;
    }

    const listingRes = await client.query('SELECT * FROM listings WHERE id=$1 FOR UPDATE', [deal.listing_id]);
    const listing = listingRes.rows[0];

    // Double-booking guard: another deal already booked this apartment?
    if (!deal.is_room_share_deal) {
      const booked = await client.query(
        `SELECT 1 FROM deals
         WHERE listing_id=$1 AND id<>$2
           AND status IN ('escrow_held','docs_generated','movein_pending','completed','disputed')
         LIMIT 1`, [deal.listing_id, deal.id]);
      if (booked.rows.length) {
        await client.query(
          "UPDATE payment_transactions SET status='rejected', reviewed_by=$1, reviewed_at=NOW(), review_note=$2, updated_at=NOW() WHERE id=$3",
          [req.user.id, 'Rejected: listing already booked by another tenant.', txn.id]);
        await client.query(
          "UPDATE deals SET status='cancelled', cancellation_reason=$1, cancelled_by=$2, updated_at=NOW() WHERE id=$3",
          ['Listing already booked by another tenant.', req.user.id, deal.id]);
        await client.query(
          "INSERT INTO transaction_audit (transaction_id, actor_id, actor_role, action, note) VALUES ($1,$2,$3,'rejected',$4)",
          [txn.id, req.user.id, req.user.role, 'Auto-rejected: listing already booked']);
        // Release only a reservation this deal actually held — a pre-inspection
        // deal holds nothing, and freeing here could drop another tenant's hold.
        // Listing is already booked by another deal — guarded release is a safe no-op.
        if (dealHoldsReservation(deal)) {
          await client.query(`UPDATE listings SET is_available=true WHERE id=$1
            AND NOT EXISTS (SELECT 1 FROM deals d WHERE d.listing_id=$1 AND d.status IN ('escrow_held','docs_generated','movein_pending','completed','disputed'))`,
            [deal.listing_id]);
        }
        await client.query('COMMIT');
        return res.status(409).json({ error: 'This listing was already booked by another tenant. The deal has been cancelled — please refund the tenant.' });
      }
    } else if (Number(listing.room_share_slots_filled) >= Number(listing.room_share_slots)) {
      // Room-share: ensure a slot is still free.
      await client.query(
        "UPDATE payment_transactions SET status='rejected', reviewed_by=$1, reviewed_at=NOW(), review_note=$2, updated_at=NOW() WHERE id=$3",
        [req.user.id, 'Rejected: all room-share slots filled.', txn.id]);
      await client.query(
        "INSERT INTO transaction_audit (transaction_id, actor_id, actor_role, action, note) VALUES ($1,$2,$3,'rejected',$4)",
        [txn.id, req.user.id, req.user.role, 'Auto-rejected: room-share slots full']);
      // Return this deal's reserved slot — but only if it held one.
      if (dealHoldsReservation(deal)) {
        await client.query(`UPDATE listings l
          SET room_share_slots_filled = GREATEST(l.room_share_slots_filled - 1, 0),
              is_available = (l.room_share_slots_filled - 1 < l.room_share_slots)
          WHERE id=$1`, [deal.listing_id]);
      }
      await client.query('COMMIT');
      return res.status(409).json({ error: 'All room-share slots are filled. The deal has been cancelled — please refund the tenant.' });
    }

    // Secure escrow (status guard keeps this idempotent).
    const dealUpdate = await client.query(
      `UPDATE deals SET status='escrow_held', payment_reference=$1, updated_at=NOW()
       WHERE id=$2 AND status IN ('initiated','payment_pending') RETURNING *`,
      [txn.reference, deal.id]);
    if (!dealUpdate.rows.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Deal is no longer awaiting payment — cannot approve.' });
    }

    await client.query("UPDATE listings SET is_available=false WHERE id=$1", [deal.listing_id]);
    await client.query(
      "UPDATE payment_transactions SET status='approved', reviewed_by=$1, reviewed_at=NOW(), review_note=$2, updated_at=NOW() WHERE id=$3",
      [req.user.id, note || 'Approved by admin', txn.id]);
    await client.query(
      "INSERT INTO transaction_audit (transaction_id, actor_id, actor_role, action, note) VALUES ($1,$2,$3,'approved',$4)",
      [txn.id, req.user.id, req.user.role, note || 'Approved by admin']);
    await client.query('COMMIT');

    // Parties for notifications + SwiftDoc (agent gets "payment secured" email).
    const listingFull = (await pool.query('SELECT * FROM listings WHERE id=$1', [deal.listing_id])).rows[0];
    const tenant = (await pool.query('SELECT * FROM users WHERE id=$1', [deal.tenant_id])).rows[0];
    const agent  = (await pool.query('SELECT * FROM users WHERE id=$1', [deal.agent_id])).rows[0];

    // Receipt to tenant + admin approval notice (best-effort, non-blocking).
    (async () => {
      try {
        const paid = Number(txn.amount_naira || deal.total_paid);
        if (tenant?.email) {
          const rEmail = await handleEmail({
            to: tenant.email,
            subject: '🛡️ SouthSwift — Payment Receipt & Escrow Confirmed',
            html: `<h2>Payment Received & Secured in Escrow</h2>
              <p>Dear ${escapeHtml(tenant.full_name)},</p>
              <p>Your transfer for <strong>${escapeHtml(listingFull.title)}</strong> has been confirmed by SouthSwift.</p>
              <p><strong>Receipt / Transaction ID:</strong> ${txn.reference}</p>
              <p><strong>Amount paid:</strong> ₦${paid.toLocaleString()}</p>
              <p><strong>Deal ID:</strong> ${deal.id}</p>
              <p>₦${Number(deal.rent_amount).toLocaleString()} is now held securely in SwiftShield escrow. Your tenancy agreement will follow, and funds release to your agent after you confirm move-in.</p>`,
          });
          if (rEmail && rEmail.ok) {
            await pool.query("UPDATE payment_transactions SET receipt_sent_at=NOW() WHERE id=$1", [txn.id]).catch(() => {});
            await pool.query(
              "INSERT INTO transaction_audit (transaction_id, actor_id, actor_role, action) VALUES ($1,$2,$3,'receipt_sent')",
              [txn.id, req.user.id, req.user.role]).catch(() => {});
          }
        }
        await handleEmail({
          to: ADMIN_NOTIFY_EMAIL,
          subject: '🛡️ ADMIN: Transfer Approved — Escrow Secured',
          html: `<h2>Transfer approved</h2>
            <p><strong>Transaction:</strong> ${txn.reference}</p>
            <p><strong>Approved by:</strong> ${escapeHtml(req.user.full_name)} (${req.user.email})</p>
            <p><strong>Deal ID:</strong> ${deal.id}</p>
            <p><strong>Amount:</strong> ₦${paid.toLocaleString()}</p>`,
        });
      } catch (e) { console.error('reviewTransaction notify error:', e.message); }
    })();

    // Generate SwiftDoc in background (emails agent "payment secured in escrow").
    runSwiftDocBackground({ deal: dealUpdate.rows[0], listing: listingFull, tenant, agent }).catch(() => {});

    res.json({ message: '✅ Transfer approved. Funds secured in SwiftShield escrow.', transaction_id: txn.id });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    console.error('reviewTransaction error:', err.message);
    res.status(500).json({ error: 'Something went wrong reviewing the transaction.' });
  } finally {
    client.release();
  }
};

// GET /api/payments/transaction/:dealId — tenant's own transfer(s) for a deal.
// ?payment_type=rent|inspection selects one type; omitted returns the latest.
const getMyTransaction = async (req, res) => {
  try {
    const { payment_type } = req.query;
    if (payment_type === 'rent' || payment_type === 'inspection') {
      const result = await pool.query(
        `SELECT * FROM payment_transactions WHERE deal_id=$1 AND tenant_id=$2 AND payment_type=$3 ORDER BY created_at DESC LIMIT 1`,
        [req.params.dealId, req.user.id, payment_type]
      );
      return res.json({ transaction: result.rows[0] || null });
    }
    const result = await pool.query(
      `SELECT * FROM payment_transactions WHERE deal_id=$1 AND tenant_id=$2 ORDER BY created_at DESC LIMIT 1`,
      [req.params.dealId, req.user.id]
    );
    res.json({ transaction: result.rows[0] || null });
  } catch (err) { console.error(err.message); res.status(500).json({ error: 'Something went wrong.' }); }
};

module.exports = { getCompanyAccount, submitTransfer, listTransactions, getTransaction, reviewTransaction, getMyTransaction, generateTxnReference, getNigerianBanks };
