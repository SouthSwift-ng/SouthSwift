// ── AGENT CONTROLLER ─────────────────────────────────────────────────────────
const { pool } = require('../config/db');
const axios    = require('axios');
const { escapeHtml } = require('../utils/escapeHtml');

// ── DOJAH VERIFICATION ENGINE ────────────────────────────────────────────────
const verifyWithDojah = async ({ nin, selfie_url, agent_name, user_id }) => {
  const headers = {
    'AppId':         process.env.DOJAH_APP_ID,
    'Authorization': process.env.DOJAH_API_KEY,
    'Content-Type':  'application/json',
  };

  const result = { nin_match:false, face_score:0, auto_verified:false, auto_rejected:false, reason:'' };

  try {
    // Step 1 — NIN lookup via Dojah/NIMC
    const ninRes = await axios.get(
      `https://api.dojah.io/api/v1/kyc/nin?nin=${nin}`,
      { headers }
    );
    const ninData = ninRes.data?.entity;

    if (!ninData || !ninData.nin) {
      result.auto_rejected = true;
      result.reason = 'The NIN provided could not be found in the NIMC database. Please check and resubmit.';
      return result;
    }

    // Name match — at least 1 name part must match
    const ninFullName    = `${ninData.firstname||''} ${ninData.middlename||''} ${ninData.surname||''}`.toLowerCase().trim();
    const nameParts      = agent_name.toLowerCase().split(' ').filter(Boolean);
    result.nin_match     = nameParts.some(part => ninFullName.includes(part));

    if (!result.nin_match) {
      result.auto_rejected = true;
      result.reason = 'The name on your account does not match the name registered to this NIN.';
      return result;
    }

    // Step 2 — Face match: selfie vs NIN database photo
    if (selfie_url && ninData.photo) {
      try {
        const faceRes = await axios.post(
          'https://api.dojah.io/api/v1/ml/face.match',
          { image_url_1: selfie_url, image_url_2: `data:image/jpeg;base64,${ninData.photo}` },
          { headers }
        );
        const confidence = faceRes.data?.entity?.confidence || 0;
        result.face_score = Math.round(confidence * 100);

        if      (result.face_score >= 75) result.auto_verified = true;
        else if (result.face_score >= 45) result.reason = `Face match ${result.face_score}% — queued for manual review.`;
        else {
          result.auto_rejected = true;
          result.reason = 'Selfie does not match your NIN photo. Please retake in good lighting.';
        }
      } catch (faceErr) {
        console.warn('Dojah face match error:', faceErr.message);
        result.reason = 'NIN verified. Face match unavailable — queued for manual review.';
      }
    } else {
      result.reason = 'NIN verified. Selfie will be reviewed manually.';
    }

    return result;
  } catch (err) {
    console.error('Dojah error:', err.response?.data || err.message);
    result.reason = 'Automated verification temporarily unavailable. Documents saved for manual review.';
    return result;
  }
};


const agentController = {

  // GET /api/agents — all verified agents
  getAgents: async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT u.id, u.full_name, u.phone, u.city, u.state, u.avatar_url,
               ap.agency_name, ap.verification_status, ap.total_deals,
               ap.rating, ap.bio, ap.verified_at
        FROM users u
        JOIN agent_profiles ap ON ap.user_id = u.id
        WHERE ap.verification_status = 'verified'
        ORDER BY ap.total_deals DESC
      `);
      res.json(result.rows);
    } catch (err) { console.error(err.message); res.status(500).json({ error: 'Something went wrong.' }); }
  },

  // GET /api/agents/:id
  getAgent: async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT u.id, u.full_name, u.phone, u.city, u.state, u.avatar_url,
               ap.agency_name, ap.verification_status, ap.total_deals,
               ap.rating, ap.bio, ap.verified_at, ap.intro_video_url
        FROM users u
        JOIN agent_profiles ap ON ap.user_id = u.id
        WHERE u.id = $1
      `, [req.params.id]);
      if (!result.rows.length) return res.status(404).json({ error: 'Agent not found.' });
      res.json(result.rows[0]);
    } catch (err) { console.error(err.message); res.status(500).json({ error: 'Something went wrong.' }); }
  },

  // POST /api/agents/verify-request — agent submits verification docs
  submitVerification: async (req, res) => {
    const { nin, agency_name, bio } = req.body;
    if (!nin) return res.status(400).json({ error: 'NIN is required for verification.' });

    const id_document_url = req.files?.id_document?.[0]?.path || null;
    const selfie_url      = req.files?.selfie?.[0]?.path || null;

    try {
      // Save docs first
      await pool.query(`
        UPDATE agent_profiles
        SET nin=$1, agency_name=$2, bio=$3, id_document_url=$4, selfie_url=$5,
            account_number=$6, bank_code=$7, account_name=$8,
            verification_status='pending', updated_at=NOW()
        WHERE user_id=$9
      `, [nin, agency_name||null, bio||null, id_document_url, selfie_url,
          req.body.account_number||null, req.body.bank_code||null,
          req.body.account_name||null, req.user.id]);

      // Get agent user details
      const userRes = await pool.query(
        'SELECT full_name, email FROM users WHERE id=$1', [req.user.id]
      );
      const agent = userRes.rows[0];

      // Pre-create Paystack Transfer Recipient so bad bank details fail HERE,
      // not later when admin clicks "Release Funds". Failure is non-fatal —
      // verification still proceeds and admin can retry on release.
      if (req.body.account_number && req.body.bank_code && process.env.PAYSTACK_SECRET_KEY) {
        let recipientCode = null;
        try {
          const recipRes = await axios.post('https://api.paystack.co/transferrecipient', {
            type:           'nuban',
            name:           req.body.account_name || agent.full_name,
            account_number: req.body.account_number,
            bank_code:      req.body.bank_code,
            currency:       'NGN',
          }, {
            headers: {
              Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
              'Content-Type': 'application/json',
            },
            timeout: 10000,
          });
          recipientCode = recipRes.data?.data?.recipient_code;
        } catch (paystackErr) {
          // Bad bank code or unreachable Paystack — log it; admin release path will retry.
          console.warn('Paystack recipient pre-create failed:',
            paystackErr.response?.data?.message || paystackErr.message);
        }
        if (recipientCode) {
          // If the DB write fails after Paystack succeeded the recipient is orphaned on
          // Paystack — log the code so it can be reconciled rather than vanishing.
          try {
            await pool.query(
              'UPDATE agent_profiles SET paystack_recipient_code=$1 WHERE user_id=$2',
              [recipientCode, req.user.id]
            );
          } catch (dbErr) {
            console.error(`⚠️  ORPHAN Paystack recipient: code=${recipientCode} agent=${req.user.id} reason=${dbErr.message}`);
          }
        }
      }

      // Run Dojah verification if API key is configured
      if (process.env.DOJAH_API_KEY && process.env.DOJAH_APP_ID) {
        const dojahResult = await verifyWithDojah({
          nin,
          selfie_url,
          agent_name: agent.full_name,
          agent_email: agent.email,
          user_id: req.user.id,
        });

        if (dojahResult.auto_verified) {
          // High confidence match — auto-verify
          await pool.query(`
            UPDATE agent_profiles
            SET verification_status='verified', verified_at=NOW(),
                dojah_nin_match=$1, dojah_face_score=$2
            WHERE user_id=$3
          `, [true, dojahResult.face_score, req.user.id]);
          await pool.query('UPDATE users SET is_verified=true WHERE id=$1', [req.user.id]);

          const { sendEmail } = require('./emailController');
          await sendEmail({
            to: agent.email,
            subject: '✅ SouthSwift — You are now a Verified Agent!',
            html: `
              <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px">
                <h1 style="color:#1B4332">South<span style="color:#C8963C">Swift</span></h1>
                <h2 style="color:#1B4332">Congratulations, ${escapeHtml(agent.full_name.split(' ')[0])}!</h2>
                <p style="color:#444;font-size:15px;line-height:1.7">
                  Your identity has been verified by SouthSwift. Your green Verified Agent badge
                  is now active. You can start posting listings immediately.
                </p>
                <div style="background:#F0F9F0;border-radius:12px;padding:18px 20px;margin:20px 0">
                  <p style="color:#1B4332;font-weight:700;margin:0 0 8px">Verification Summary</p>
                  <p style="color:#555;font-size:13px;margin:4px 0">✅ NIN verified against NIMC database</p>
                  <p style="color:#555;font-size:13px;margin:4px 0">✅ Face match confidence: ${dojahResult.face_score}%</p>
                  <p style="color:#555;font-size:13px;margin:4px 0">✅ Identity confirmed</p>
                </div>
                <a href="https://southswift.com.ng/create-listing"
                   style="display:inline-block;background:#1B4332;color:white;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700">
                  Post Your First Listing →
                </a>
              </div>
            `,
          });

          return res.json({
            message: '✅ Identity verified automatically! Your Verified Agent badge is now active.',
            status: 'verified',
            face_score: dojahResult.face_score,
          });
        }

        if (dojahResult.auto_rejected) {
          // Low confidence or clear mismatch — auto-reject
          await pool.query(
            "UPDATE agent_profiles SET verification_status='rejected' WHERE user_id=$1",
            [req.user.id]
          );
          const { sendEmail } = require('./emailController');
          await sendEmail({
            to: agent.email,
            subject: '⚠️ SouthSwift — Verification Unsuccessful',
            html: `
              <p>Dear ${escapeHtml(agent.full_name.split(' ')[0])},</p>
              <p>We were unable to verify your identity automatically. ${dojahResult.reason}</p>
              <p>Please ensure your selfie clearly shows your face and your ID document is legible.
              You may resubmit at any time. If you believe this is an error, contact us at
              legal@southswift.com.ng.</p>
            `,
          });
          return res.status(400).json({
            message: dojahResult.reason || 'Identity verification failed. Please resubmit with a clearer selfie.',
            status: 'rejected',
          });
        }

        // Medium confidence — flag for manual review
        const { sendEmail } = require('./emailController');
        await sendEmail({
          to: 'ceo@southswift.com.ng',
          subject: `🔍 Manual Review Required — ${agent.full_name}`,
          html: `
            <p>Agent ${escapeHtml(agent.full_name)} (${escapeHtml(agent.email)}) requires manual review.</p>
            <p>Face match score: ${dojahResult.face_score}%</p>
            <p>NIN match: ${dojahResult.nin_match ? 'Yes' : 'Partial'}</p>
            <p>Reason: ${dojahResult.reason}</p>
            <p><a href="https://southswift.com.ng/admin">Review in Admin Panel →</a></p>
          `,
        });
        return res.json({
          message: 'Verification submitted. Our team will review your documents within 24 hours.',
          status: 'pending',
        });
      }

      // No Dojah key — fall back to manual review
      res.json({ message: 'Verification request submitted. SouthSwift will review within 48 hours.' });
    } catch (err) {
      console.error('Verification error:', err.message);
      console.error(err.message); res.status(500).json({ error: 'Something went wrong.' });
    }
  },

  // GET /api/agents/my/listings
  getAgentListings: async (req, res) => {
    try {
      const result = await pool.query(
        'SELECT * FROM listings WHERE agent_id=$1 ORDER BY created_at DESC', [req.user.id]
      );
      res.json(result.rows);
    } catch (err) { console.error(err.message); res.status(500).json({ error: 'Something went wrong.' }); }
  },

  // GET /api/agents/banks — proxies Paystack /bank so the dropdown shows live, valid
  // bank codes. Cached in-process for 6h to dodge Paystack rate limits.
  getBanks: async (req, res) => {
    try {
      const now = Date.now();
      const cache = agentController._bankCache;
      if (cache && (now - cache.ts) < 6 * 60 * 60 * 1000) return res.json(cache.banks);
      const r = await axios.get('https://api.paystack.co/bank?country=nigeria', {
        headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
        timeout: 10000,
      });
      const banks = (r.data?.data || [])
        .map(b => ({ name: b.name, code: b.code }))
        .sort((a, b) => a.name.localeCompare(b.name));
      agentController._bankCache = { ts: now, banks };
      res.json(banks);
    } catch (err) {
      console.error('Bank list fetch failed:', err.response?.data?.message || err.message);
      res.status(502).json({ error: 'Could not fetch bank list. Please try again.' });
    }
  },

  // POST /api/agents/resolve-account — proxies Paystack /bank/resolve so the agent
  // sees the real account holder name before saving wrong details. Auth required so
  // this can't be abused as a free account-name lookup service.
  resolveAccount: async (req, res) => {
    const { account_number, bank_code } = req.body;
    if (!account_number || !bank_code)
      return res.status(400).json({ error: 'Account number and bank code are required.' });
    if (!/^\d{10}$/.test(String(account_number)))
      return res.status(400).json({ error: 'Account number must be 10 digits.' });
    try {
      const r = await axios.get(
        `https://api.paystack.co/bank/resolve?account_number=${encodeURIComponent(account_number)}&bank_code=${encodeURIComponent(bank_code)}`,
        {
          headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
          timeout: 10000,
        }
      );
      const data = r.data?.data;
      if (!data?.account_name) return res.status(400).json({ error: 'Account not found at the selected bank.' });
      res.json({ account_name: data.account_name, account_number: data.account_number });
    } catch (err) {
      const msg = err.response?.data?.message || 'Could not resolve account. Check the number and bank.';
      console.warn('Account resolve failed:', msg);
      res.status(400).json({ error: msg });
    }
  },

  // POST /api/agents/intro-video — agent uploads/replaces their profile intro video
  uploadIntroVideo: async (req, res) => {
    const intro_video_url = req.file?.path || null;
    if (!intro_video_url) return res.status(400).json({ error: 'No video file received.' });
    try {
      await pool.query(
        'UPDATE agent_profiles SET intro_video_url=$1, updated_at=NOW() WHERE user_id=$2',
        [intro_video_url, req.user.id]
      );
      res.json({ intro_video_url });
    } catch (err) { console.error(err.message); res.status(500).json({ error: 'Something went wrong.' }); }
  },
};

// ── ADMIN CONTROLLER ─────────────────────────────────────────────────────────
const adminController = {

  // GET /api/admin/dashboard
  getDashboard: async (req, res) => {
    try {
      const [users, listings, deals, agents, revenue] = await Promise.all([
        pool.query('SELECT COUNT(*) FROM users'),
        pool.query('SELECT COUNT(*) FROM listings'),
        pool.query("SELECT COUNT(*) FROM deals WHERE status='completed'"),
        pool.query("SELECT COUNT(*) FROM agent_profiles WHERE verification_status='verified'"),
        // Only count fees from deals whose funds were actually disbursed AND not later
        // refunded — otherwise a refunded deal inflates revenue forever.
        pool.query(`SELECT COALESCE(SUM(service_fee_tenant + service_fee_landlord),0) AS total
                    FROM deals
                    WHERE funds_released_at IS NOT NULL AND refunded_at IS NULL`),
      ]);
      res.json({
        total_users:       parseInt(users.rows[0].count),
        total_listings:    parseInt(listings.rows[0].count),
        completed_deals:   parseInt(deals.rows[0].count),
        verified_agents:   parseInt(agents.rows[0].count),
        total_revenue_ngn: parseInt(revenue.rows[0].total),
      });
    } catch (err) { console.error(err.message); res.status(500).json({ error: 'Something went wrong.' }); }
  },

  // GET /api/admin/agents/pending
  getPendingAgents: async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT u.id, u.full_name, u.email, u.phone, u.state, u.city, u.created_at,
               ap.nin, ap.agency_name, ap.bio, ap.id_document_url, ap.selfie_url, ap.id AS profile_id
        FROM users u
        JOIN agent_profiles ap ON ap.user_id = u.id
        WHERE ap.verification_status = 'pending'
        ORDER BY u.created_at DESC
      `);
      res.json(result.rows);
    } catch (err) { console.error(err.message); res.status(500).json({ error: 'Something went wrong.' }); }
  },

  // PUT /api/admin/agents/:userId/verify
  verifyAgent: async (req, res) => {
    const { action } = req.body; // 'verify' or 'reject'
    if (!['verify','reject'].includes(action))
      return res.status(400).json({ error: 'Action must be verify or reject.' });
    try {
      const status = action === 'verify' ? 'verified' : 'rejected';
      await pool.query(`
        UPDATE agent_profiles
        SET verification_status=$1, verified_at=$2, verified_by=$3
        WHERE user_id=$4
      `, [status, action==='verify'?new Date():null, req.user.id, req.params.userId]);

      if (action === 'verify') {
        await pool.query("UPDATE users SET is_verified=true WHERE id=$1", [req.params.userId]);
      }
      res.json({ message: `Agent ${action}d successfully.` });
    } catch (err) { console.error(err.message); res.status(500).json({ error: 'Something went wrong.' }); }
  },

  // GET /api/admin/deals
  getAllDeals: async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT d.*, l.title AS listing_title, l.city,
               t.full_name AS tenant_name, t.phone AS tenant_phone,
               a.full_name AS agent_name
        FROM deals d
        JOIN listings l ON l.id=d.listing_id
        JOIN users t ON t.id=d.tenant_id
        JOIN users a ON a.id=d.agent_id
        ORDER BY d.created_at DESC LIMIT 100
      `);
      res.json(result.rows);
    } catch (err) { console.error(err.message); res.status(500).json({ error: 'Something went wrong.' }); }
  },

  // PUT /api/admin/deals/:id/release-funds
  releaseFunds: async (req, res) => {
    const axios = require('axios');
    const paystackHeaders = {
      Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
      'Content-Type': 'application/json',
    };

    try {
      const dealResult = await pool.query(`
        SELECT d.*, ap.account_number, ap.bank_code, ap.account_name, ap.paystack_recipient_code,
               u.full_name AS agent_full_name
        FROM deals d
        JOIN agent_profiles ap ON ap.user_id = d.agent_id
        JOIN users u ON u.id = d.agent_id
        WHERE d.id = $1
      `, [req.params.id]);

      if (!dealResult.rows.length) return res.status(404).json({ error: 'Deal not found.' });
      const deal = dealResult.rows[0];

      if (deal.funds_released_at)
        return res.status(400).json({ error: 'Funds already released for this deal.' });

      if (!['escrow_held', 'docs_generated', 'completed'].includes(deal.status))
        return res.status(400).json({ error: `Cannot release funds for deal in status: ${deal.status}` });

      if (deal.status === 'disputed')
        return res.status(400).json({ error: 'Cannot release funds for a disputed deal. Resolve the dispute first.' });

      if (!deal.account_number || !deal.bank_code)
        return res.status(400).json({ error: 'Agent has no bank account on record. Ask agent to update their profile.' });

      // Validate the payout amount BEFORE doing anything irreversible (BIGINT columns come back
      // as strings from pg, so coerce explicitly; guard against negative/NaN legacy values).
      const transferAmount = (Number(deal.rent_amount) - Number(deal.service_fee_landlord)) * 100;
      if (!Number.isFinite(transferAmount) || transferAmount <= 0)
        return res.status(400).json({ error: `Invalid payout amount for this deal (₦${transferAmount / 100}). Check its rent and fee values.` });

      // Atomically claim the release. Three guards in the WHERE:
      //   funds_released_at IS NULL      — no double-release
      //   refunded_at IS NULL            — refunded deals must not also be paid out
      //   status IN (...safe statuses)   — disputed/cancelled deals must not pay out
      // Without these checks a race between Refund → Release (or Dispute → Release)
      // could send money on a deal that's already cancelled, refunded, or disputed.
      const lockResult = await pool.query(
        `UPDATE deals SET funds_released_at=NOW(), updated_at=NOW()
         WHERE id=$1
           AND funds_released_at IS NULL
           AND refunded_at IS NULL
           AND status IN ('escrow_held','docs_generated','movein_pending','completed')
         RETURNING id`,
        [req.params.id]
      );
      if (!lockResult.rows.length)
        return res.status(400).json({ error: 'Funds cannot be released: already released, refunded, or deal not in a releasable state.' });

      // From here, ANY failure must release the lock so the payout can be retried — otherwise the
      // deal would look "released" while no money was sent. The deterministic transfer reference
      // (SS-RELEASE-<dealId>) lets Paystack reject a duplicate, so a retry can never double-pay.
      try {
        let recipientCode = deal.paystack_recipient_code;

        if (!recipientCode) {
          const recipRes = await axios.post('https://api.paystack.co/transferrecipient', {
            type:           'nuban',
            name:           deal.account_name || deal.agent_full_name,
            account_number: deal.account_number,
            bank_code:      deal.bank_code,
            currency:       'NGN',
          }, { headers: paystackHeaders });

          recipientCode = recipRes.data.data.recipient_code;

          await pool.query(
            'UPDATE agent_profiles SET paystack_recipient_code=$1 WHERE user_id=$2',
            [recipientCode, deal.agent_id]
          );
        }

        const transferRes = await axios.post('https://api.paystack.co/transfer', {
          source:    'balance',
          amount:    transferAmount,
          recipient: recipientCode,
          reason:    `SouthSwift Deal ${deal.id.slice(0,8)} — Property Rental`,
          reference: `SS-RELEASE-${deal.id}`,
        }, { headers: paystackHeaders });

        const transferCode = transferRes.data.data.transfer_code;

        await pool.query(
          "UPDATE deals SET status='completed', notes=$1 WHERE id=$2",
          [`Paystack transfer: ${transferCode}`, req.params.id]
        );

        res.json({ message: 'Funds disbursed via Paystack Transfer.', transfer_code: transferCode });
      } catch (transferErr) {
        // Network errors are the dangerous case: Paystack might have processed the transfer
        // before our connection dropped. Before nulling the lock, ask Paystack whether the
        // deterministic reference already exists — if so, claim success and DON'T allow retry.
        const transferReference = `SS-RELEASE-${deal.id}`;
        let alreadySettled = false;
        try {
          const verify = await axios.get(
            `https://api.paystack.co/transfer/verify/${encodeURIComponent(transferReference)}`,
            { headers: paystackHeaders, timeout: 10000 }
          );
          const settledStatus = verify.data?.data?.status;
          // Paystack states: 'pending' | 'success' | 'failed' | 'reversed'
          // Anything except 'failed'/'reversed' means the transfer is live on their side.
          if (settledStatus && !['failed','reversed'].includes(settledStatus)) {
            alreadySettled = true;
            await pool.query(
              "UPDATE deals SET status='completed', notes=$1 WHERE id=$2",
              [`Paystack transfer (recovered ${settledStatus}): ${transferReference}`, req.params.id]
            ).catch(() => {});
          }
        } catch (verifyErr) {
          // 404 from /transfer/verify means Paystack never received the transfer — safe to retry.
          // Anything else, be conservative and treat as live to avoid double-pay.
          const status = verifyErr.response?.status;
          if (status && status !== 404) alreadySettled = true;
        }

        if (alreadySettled) {
          console.warn('Transfer error but Paystack reports it landed — keeping lock:', transferErr.response?.data || transferErr.message);
          return res.status(502).json({
            error: 'Transfer status uncertain — Paystack reports the payment may have landed. Check the agent\'s bank before retrying.',
          });
        }

        // Confirmed safe to retry — no money on Paystack's side.
        await pool.query(
          "UPDATE deals SET funds_released_at=NULL, updated_at=NOW() WHERE id=$1",
          [req.params.id]
        ).catch(() => {});
        console.error('Fund transfer failed (verified no-send, lock released for retry):', transferErr.response?.data || transferErr.message);
        return res.status(502).json({ error: 'Paystack transfer failed. No funds were sent — you can retry.' });
      }
    } catch (err) {
      console.error('Fund release error:', err.response?.data || err.message);
      res.status(500).json({ error: 'Fund release failed. Please try again or contact support.' });
    }
  },

  // PUT /api/admin/deals/:id/refund — refund the tenant's escrow (tenant-wins dispute, unwind, etc.)
  refundDeal: async (req, res) => {
    const axios = require('axios');
    const paystackHeaders = {
      Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
      'Content-Type': 'application/json',
    };
    try {
      const dealResult = await pool.query('SELECT * FROM deals WHERE id=$1', [req.params.id]);
      if (!dealResult.rows.length) return res.status(404).json({ error: 'Deal not found.' });
      const deal = dealResult.rows[0];

      if (deal.funds_released_at)
        return res.status(400).json({ error: 'Funds were already released to the agent — cannot refund.' });
      if (deal.refunded_at)
        return res.status(400).json({ error: 'This deal has already been refunded.' });
      if (!deal.paystack_reference)
        return res.status(400).json({ error: 'No payment reference on this deal — nothing to refund.' });
      if (!['escrow_held','docs_generated','movein_pending','disputed'].includes(deal.status))
        return res.status(400).json({ error: `Cannot refund a deal in status: ${deal.status}` });

      // Atomically claim the refund (and re-assert funds not released) to prevent double-refund.
      const lock = await pool.query(
        "UPDATE deals SET refunded_at=NOW(), updated_at=NOW() WHERE id=$1 AND refunded_at IS NULL AND funds_released_at IS NULL RETURNING id",
        [req.params.id]
      );
      if (!lock.rows.length)
        return res.status(400).json({ error: 'Refund already in progress, already done, or funds already released.' });

      // If anything fails, release the claim so it can be retried — no money was returned yet.
      // Paystack itself rejects a duplicate refund on the same transaction, so a retry can't double-refund.
      try {
        const refundRes = await axios.post('https://api.paystack.co/refund', {
          transaction: deal.paystack_reference, // omit amount → full refund of the captured charge
        }, { headers: paystackHeaders });

        await pool.query(
          "UPDATE deals SET status='cancelled', notes=$1, updated_at=NOW() WHERE id=$2",
          [`Refunded via Paystack (txn ${deal.paystack_reference})`, req.params.id]
        );

        const { sendEmail } = require('./emailController');
        const tenantRes = await pool.query('SELECT email, full_name FROM users WHERE id=$1', [deal.tenant_id]);
        const tenant = tenantRes.rows[0];
        if (tenant?.email) {
          await sendEmail({
            to: tenant.email,
            subject: '🛡️ SouthSwift — Refund Initiated',
            html: `<p>Dear ${escapeHtml(tenant.full_name)}, a refund of ₦${Number(deal.total_paid).toLocaleString()} has been initiated to your original payment method. Refunds typically settle within 14–28 business days.</p>`,
          });
        }

        res.json({ message: 'Refund initiated via Paystack.', status: refundRes.data?.data?.status || 'pending' });
      } catch (refundErr) {
        await pool.query(
          "UPDATE deals SET refunded_at=NULL, updated_at=NOW() WHERE id=$1",
          [req.params.id]
        ).catch(() => {});
        console.error('Refund failed (claim released for retry):', refundErr.response?.data || refundErr.message);
        return res.status(502).json({ error: 'Paystack refund failed. No refund was made — you can retry.' });
      }
    } catch (err) {
      console.error('Refund handler error:', err.message);
      res.status(500).json({ error: 'Refund failed. Please try again or contact support.' });
    }
  },

  // PUT /api/admin/deals/:id/resolve-dispute
  resolveDispute: async (req, res) => {
    const { resolution, winner } = req.body;
    if (!resolution || !winner)
      return res.status(400).json({ error: 'resolution text and winner required.' });
    if (!['tenant','agent','split'].includes(winner))
      return res.status(400).json({ error: 'winner must be tenant, agent, or split.' });

    try {
      const dealResult = await pool.query('SELECT * FROM deals WHERE id=$1', [req.params.id]);
      if (!dealResult.rows.length) return res.status(404).json({ error: 'Deal not found.' });
      const deal = dealResult.rows[0];
      if (deal.status !== 'disputed')
        return res.status(400).json({ error: 'Deal is not disputed.' });

      // Determine next status based on winner — only mark funds_released for agent winner
      let newStatus, newNotes;
      if (winner === 'tenant') {
        newStatus = 'cancelled';
        newNotes = `DISPUTE RESOLVED (tenant wins — refund required): ${resolution}`;
      } else if (winner === 'agent') {
        newStatus = 'completed';
        newNotes = `DISPUTE RESOLVED (agent wins — release funds via admin): ${resolution}`;
      } else {
        newStatus = 'completed';
        newNotes = `DISPUTE RESOLVED (split — partial refund + partial release required): ${resolution}`;
      }

      await pool.query(
        "UPDATE deals SET status=$1, notes=$2, updated_at=NOW() WHERE id=$3",
        [newStatus, newNotes, req.params.id]
      );

      const { sendEmail } = require('./emailController');
      const tenantRes = await pool.query('SELECT email, full_name FROM users WHERE id=$1', [deal.tenant_id]);
      const agentRes  = await pool.query('SELECT email, full_name FROM users WHERE id=$1', [deal.agent_id]);
      const tenant = tenantRes.rows[0]; const agent = agentRes.rows[0];

      const winnerLabel = winner === 'tenant' ? 'Funds will be refunded to the tenant.'
        : winner === 'agent' ? 'Funds will be released to the agent.'
        : 'A split resolution will be processed.';

      await sendEmail({
        to: tenant.email,
        subject: '🛡️ SouthSwift — Dispute Resolved',
        html: `<p>Dear ${escapeHtml(tenant.full_name)}, your dispute for deal ${deal.id.slice(0,8)} has been resolved.</p><p><strong>Resolution:</strong> ${escapeHtml(resolution)}</p><p>${winnerLabel}</p>`,
      });
      await sendEmail({
        to: agent.email,
        subject: '🛡️ SouthSwift — Dispute Resolved',
        html: `<p>Dear ${escapeHtml(agent.full_name)}, the dispute for deal ${deal.id.slice(0,8)} has been resolved.</p><p><strong>Resolution:</strong> ${escapeHtml(resolution)}</p><p>${winnerLabel}</p>`,
      });

      // Alert admin for manual fund routing
      await sendEmail({
        to: 'ceo@southswift.com.ng',
        subject: `💰 ADMIN: Dispute Resolved — ${winner} wins — Action Required`,
        html: `<p>Deal ${deal.id.slice(0,8)} dispute resolved. Winner: <strong>${winner}</strong>.</p><p>${winnerLabel}</p><p>Amount: ₦${Number(deal.rent_amount).toLocaleString()}</p>`,
      });

      res.json({ message: 'Dispute resolved and parties notified.' });
    } catch (err) { res.status(500).json({ error: 'Something went wrong. Please try again.' }); }
  },

  // GET /api/admin/users
  getUsers: async (req, res) => {
    try {
      const result = await pool.query(
        'SELECT id, full_name, email, phone, role, is_verified, state, city, created_at FROM users ORDER BY created_at DESC'
      );
      res.json(result.rows);
    } catch (err) { console.error(err.message); res.status(500).json({ error: 'Something went wrong.' }); }
  },

  // GET /api/admin/listings
  getAllListings: async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT l.*, u.full_name AS agent_name, ap.verification_status
        FROM listings l
        JOIN users u ON u.id=l.agent_id
        LEFT JOIN agent_profiles ap ON ap.user_id=l.agent_id
        ORDER BY l.created_at DESC
      `);
      res.json(result.rows);
    } catch (err) { console.error(err.message); res.status(500).json({ error: 'Something went wrong.' }); }
  },

  // DELETE /api/admin/listings — bulk delete. Refuses to delete any listing that has
  // a paid (or in-flight) deal so money flows can't be orphaned. Returns counts.
  deleteListingsBulk: async (req, res) => {
    const { ids } = req.body;
    if (!Array.isArray(ids) || !ids.length)
      return res.status(400).json({ error: 'Provide an array of listing ids.' });
    if (ids.length > 100)
      return res.status(400).json({ error: 'Cannot delete more than 100 listings at once.' });
    // Validate all ids are uuids — DB will reject otherwise but failing fast is friendlier.
    const uuidRe = /^[0-9a-fA-F-]{36}$/;
    if (!ids.every(id => uuidRe.test(id)))
      return res.status(400).json({ error: 'One or more ids are not valid UUIDs.' });

    try {
      // Find listings with deals that are NOT safe to wipe (anything past payment_pending).
      const guardRes = await pool.query(
        `SELECT DISTINCT listing_id FROM deals
         WHERE listing_id = ANY($1::uuid[])
           AND status NOT IN ('initiated','payment_pending','cancelled','archived')`,
        [ids]
      );
      const blocked = new Set(guardRes.rows.map(r => r.listing_id));
      const deletable = ids.filter(id => !blocked.has(id));

      if (!deletable.length) {
        return res.status(400).json({
          error: 'All selected listings have active or completed deals and cannot be deleted.',
          blocked: ids,
        });
      }

      const del = await pool.query(
        'DELETE FROM listings WHERE id = ANY($1::uuid[]) RETURNING id',
        [deletable]
      );

      res.json({
        deleted: del.rows.map(r => r.id),
        blocked: Array.from(blocked),
        deleted_count: del.rowCount,
        blocked_count: blocked.size,
      });
    } catch (err) {
      console.error('Bulk delete error:', err.code || '', err.message);
      res.status(500).json({ error: `Bulk delete failed: ${String(err.message || '').split('\n')[0].slice(0,200)}` });
    }
  },

  // POST /api/admin/test-email — verify SMTP config is actually working. Unlike every
  // other sendEmail() call site (which swallows failures and only logs), this one
  // returns the real {ok, error} synchronously so a config change (new provider, new
  // credentials) can be confirmed over HTTP without needing server log access.
  sendTestEmail: async (req, res) => {
    const { sendEmail } = require('./emailController');
    const to = (req.body?.to && String(req.body.to).trim()) || 'ceo@southswift.com.ng';
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(to)) return res.status(400).json({ error: 'Invalid email address.' });

    const startedAt = Date.now();
    const result = await sendEmail({
      to,
      subject: '✅ SouthSwift — SMTP Test Email',
      html: `
        <p>This is a test email triggered from the SouthSwift admin panel.</p>
        <p>If you're reading this, outbound email (host: <code>${escapeHtml(process.env.EMAIL_HOST || 'smtp.yandex.com (default)')}</code>,
           sender: <code>${escapeHtml(process.env.EMAIL_USER || 'not set')}</code>) is working correctly.</p>
        <p>Sent at: ${new Date().toISOString()}</p>
      `,
    });
    const elapsedMs = Date.now() - startedAt;

    if (result.ok) {
      return res.json({ message: `Test email sent to ${to}.`, elapsed_ms: elapsedMs });
    }
    // Surface the real SMTP error (auth failure, wrong host, connection refused) so
    // the operator doesn't have to go digging in Render logs to diagnose it.
    return res.status(502).json({ error: `Email send failed: ${result.error}`, elapsed_ms: elapsedMs });
  },
};

module.exports = { agentController, adminController };
