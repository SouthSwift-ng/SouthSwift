// ── AGENT CONTROLLER ─────────────────────────────────────────────────────────
const { pool } = require('../config/db');
const axios    = require('axios');

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
    } catch (err) { res.status(500).json({ error: err.message }); }
  },

  // GET /api/agents/:id
  getAgent: async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT u.id, u.full_name, u.phone, u.city, u.state, u.avatar_url,
               ap.agency_name, ap.verification_status, ap.total_deals,
               ap.rating, ap.bio, ap.verified_at
        FROM users u
        JOIN agent_profiles ap ON ap.user_id = u.id
        WHERE u.id = $1
      `, [req.params.id]);
      if (!result.rows.length) return res.status(404).json({ error: 'Agent not found.' });
      res.json(result.rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
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
                <h2 style="color:#1B4332">Congratulations, ${agent.full_name.split(' ')[0]}!</h2>
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
              <p>Dear ${agent.full_name.split(' ')[0]},</p>
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
            <p>Agent ${agent.full_name} (${agent.email}) requires manual review.</p>
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
      res.status(500).json({ error: err.message });
    }
  },

  // GET /api/agents/my/listings
  getAgentListings: async (req, res) => {
    try {
      const result = await pool.query(
        'SELECT * FROM listings WHERE agent_id=$1 ORDER BY created_at DESC', [req.user.id]
      );
      res.json(result.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
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
        pool.query("SELECT COALESCE(SUM(service_fee_tenant + service_fee_landlord),0) AS total FROM deals WHERE status='completed'"),
      ]);
      res.json({
        total_users:       parseInt(users.rows[0].count),
        total_listings:    parseInt(listings.rows[0].count),
        completed_deals:   parseInt(deals.rows[0].count),
        verified_agents:   parseInt(agents.rows[0].count),
        total_revenue_ngn: parseInt(revenue.rows[0].total),
      });
    } catch (err) { res.status(500).json({ error: err.message }); }
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
    } catch (err) { res.status(500).json({ error: err.message }); }
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
    } catch (err) { res.status(500).json({ error: err.message }); }
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
    } catch (err) { res.status(500).json({ error: err.message }); }
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

      if (!deal.account_number || !deal.bank_code)
        return res.status(400).json({ error: 'Agent has no bank account on record. Ask agent to update their profile.' });

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

      const transferAmount = (deal.rent_amount - deal.service_fee_landlord) * 100;

      const transferRes = await axios.post('https://api.paystack.co/transfer', {
        source:    'balance',
        amount:    transferAmount,
        recipient: recipientCode,
        reason:    `SouthSwift Deal ${deal.id.slice(0,8)} — Property Rental`,
      }, { headers: paystackHeaders });

      const transferCode = transferRes.data.data.transfer_code;

      await pool.query(
        "UPDATE deals SET status='completed', funds_released_at=NOW(), notes=$1 WHERE id=$2",
        [`Paystack transfer: ${transferCode}`, req.params.id]
      );

      res.json({ message: 'Funds disbursed via Paystack Transfer.', transfer_code: transferCode });
    } catch (err) {
      console.error('Fund release error:', err.response?.data || err.message);
      res.status(500).json({ error: err.response?.data?.message || err.message });
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

      await pool.query(
        "UPDATE deals SET status='completed', notes=$1, funds_released_at=NOW(), updated_at=NOW() WHERE id=$2",
        [`DISPUTE RESOLVED: ${resolution} | Winner: ${winner}`, req.params.id]
      );

      const { sendEmail } = require('./emailController');
      const tenantRes = await pool.query('SELECT email, full_name FROM users WHERE id=$1', [deal.tenant_id]);
      const agentRes  = await pool.query('SELECT email, full_name FROM users WHERE id=$1', [deal.agent_id]);
      const tenant = tenantRes.rows[0]; const agent = agentRes.rows[0];

      await sendEmail({
        to: tenant.email,
        subject: '🛡️ SouthSwift — Dispute Resolved',
        html: `<p>Dear ${tenant.full_name}, your dispute for deal ${deal.id.slice(0,8)} has been resolved.</p><p><strong>Resolution:</strong> ${resolution}</p>`,
      });
      await sendEmail({
        to: agent.email,
        subject: '🛡️ SouthSwift — Dispute Resolved',
        html: `<p>Dear ${agent.full_name}, the dispute for deal ${deal.id.slice(0,8)} has been resolved.</p><p><strong>Resolution:</strong> ${resolution}</p>`,
      });

      res.json({ message: 'Dispute resolved and parties notified.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
  },

  // GET /api/admin/users
  getUsers: async (req, res) => {
    try {
      const result = await pool.query(
        'SELECT id, full_name, email, phone, role, is_verified, state, city, created_at FROM users ORDER BY created_at DESC'
      );
      res.json(result.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
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
    } catch (err) { res.status(500).json({ error: err.message }); }
  },
};

module.exports = { agentController, adminController };
