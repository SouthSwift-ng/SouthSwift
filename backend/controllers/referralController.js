const { pool } = require('../config/db');
const { redis } = require('../config/redis');
const { agentController } = require('./agentAdminController');
const { escapeHtml } = require('../utils/escapeHtml');
const {
  generateOTP,
  handleEmail,
  sendWithdrawalOtpEmail,
  sendWithdrawalStatusEmail,
  sendReferralRewardEmail,
} = require('../utils/emailService');
const {
  MIN_WITHDRAWAL_NAIRA,
  computeAvailableBalance,
  maskEmail,
  priceNaira,
} = require('../utils/referral');
const {
  resolveBankAccount,
  BANK_RESOLVE_UNAVAILABLE_MESSAGE,
} = require('../utils/bankCache');

const OTP_TTL_SECONDS = 600;
const OTP_COOLDOWN_SECONDS = 300;
const OTP_MAX_ATTEMPTS = 5;

const otpKey = (userId) => `withdraw_otp:${userId}`;
const otpAttemptsKey = (userId) => `withdraw_otp_attempts:${userId}`;
const otpCooldownKey = (userId) => `withdraw_otp_cooldown:${userId}`;

const getBalance = async (queryable, userId) => {
  const [earned, reserved] = await Promise.all([
    queryable.query(
      `SELECT COALESCE(SUM(amount),0) AS total
       FROM referral_rewards
       WHERE referrer_id=$1 AND status='available'`,
      [userId]
    ),
    queryable.query(
      `SELECT COALESCE(SUM(amount),0) AS total
       FROM withdrawal_requests
       WHERE user_id=$1 AND status IN ('pending','approved','paid')`,
      [userId]
    ),
  ]);
  return computeAvailableBalance(earned.rows[0].total, reserved.rows[0].total);
};

const referralLink = (code) =>
  `${(process.env.CLIENT_URL || 'https://southswift.com.ng').replace(/\/$/, '')}/register?ref=${encodeURIComponent(code || '')}`;

// GET /api/referrals/summary
const getSummary = async (req, res) => {
  try {
    const userId = req.user.id;
    const [userRes, rewardsRes, withdrawalsRes, totalsRes, paidRes] = await Promise.all([
      pool.query('SELECT referral_code, email FROM users WHERE id=$1', [userId]),
      pool.query(
        `SELECT rr.id, rr.amount, rr.created_at,
                u.full_name AS referred_name,
                l.title AS listing_title
         FROM referral_rewards rr
         JOIN users u ON u.id = rr.referred_user_id
         LEFT JOIN deals d ON d.id = rr.deal_id
         LEFT JOIN listings l ON l.id = d.listing_id
         WHERE rr.referrer_id=$1 AND rr.status='available'
         ORDER BY rr.created_at DESC
         LIMIT 50`,
        [userId]
      ),
      pool.query(
        `SELECT id, amount, account_name, account_number, bank_name,
                status, admin_note, requested_at, reviewed_at, paid_at
         FROM withdrawal_requests
         WHERE user_id=$1
         ORDER BY requested_at DESC
         LIMIT 50`,
        [userId]
      ),
      pool.query(
        `SELECT COALESCE(SUM(amount),0) AS total
         FROM referral_rewards
         WHERE referrer_id=$1 AND status='available'`,
        [userId]
      ),
      pool.query(
        `SELECT COALESCE(SUM(amount),0) AS total
         FROM withdrawal_requests
         WHERE user_id=$1 AND status='paid'`,
        [userId]
      ),
    ]);

    const user = userRes.rows[0] || {};
    const balance = await getBalance(pool, userId);
    const pendingWithdrawal = withdrawalsRes.rows.find(w => ['pending', 'approved'].includes(w.status)) || null;

    res.json({
      referral_code: user.referral_code,
      referral_link: referralLink(user.referral_code),
      balance,
      total_earned: Number(totalsRes.rows[0].total) || 0,
      total_withdrawn: Number(paidRes.rows[0].total) || 0,
      min_withdrawal: MIN_WITHDRAWAL_NAIRA,
      pending_withdrawal: pendingWithdrawal,
      rewards: rewardsRes.rows,
      withdrawals: withdrawalsRes.rows,
    });
  } catch (err) {
    console.error('getReferralSummary error:', err.message);
    res.status(500).json({ error: 'Something went wrong.' });
  }
};

// GET /api/referrals/banks — same list as agent verification
const getBanks = (req, res) => agentController.getBanks(req, res);

// POST /api/referrals/resolve-account — same Paystack lookup as agent verification
const resolveAccount = (req, res) => agentController.resolveAccount(req, res);

// POST /api/referrals/withdrawals/request-otp
const requestWithdrawalOtp = async (req, res) => {
  const { account_number, bank_code, bank_name } = req.body;
  const userId = req.user.id;

  if (!account_number || !bank_code)
    return res.status(400).json({ error: 'Bank and account number are required.' });
  if (!/^\d{10}$/.test(String(account_number)))
    return res.status(400).json({ error: 'Account number must be 10 digits.' });

  try {
    const cooldown = await redis.ttl(otpCooldownKey(userId));
    if (cooldown > 0) {
      return res.status(429).json({
        error: `Please wait ${Math.ceil(cooldown / 60)} minute(s) before requesting another code.`,
        cooldown_seconds: cooldown,
      });
    }

    const existing = await pool.query(
      `SELECT id FROM withdrawal_requests
       WHERE user_id=$1 AND status IN ('pending','approved') LIMIT 1`,
      [userId]
    );
    if (existing.rows.length) {
      return res.status(409).json({ error: 'You already have a withdrawal request in progress.' });
    }

    const balance = await getBalance(pool, userId);
    if (balance < MIN_WITHDRAWAL_NAIRA) {
      return res.status(400).json({
        error: `You need at least ${priceNaira(MIN_WITHDRAWAL_NAIRA)} to withdraw.`,
      });
    }

    // Resolve the real account name server-side; never trust the client's copy.
    let accountName;
    try {
      const resolved = await resolveBankAccount(account_number, bank_code);
      accountName = resolved.account_name;
    } catch (err) {
      return res.status(400).json({ error: BANK_RESOLVE_UNAVAILABLE_MESSAGE });
    }
    if (!accountName)
      return res.status(400).json({ error: BANK_RESOLVE_UNAVAILABLE_MESSAGE });

    const otpCode = generateOTP();
    const draft = {
      otp: otpCode,
      amount: balance,
      account_name: accountName,
      account_number: String(account_number),
      bank_code: String(bank_code),
      bank_name: bank_name || null,
      created_at: new Date().toISOString(),
    };

    await redis.setEx(otpKey(userId), OTP_TTL_SECONDS, JSON.stringify(draft));
    await redis.del(otpAttemptsKey(userId));
    await redis.setEx(otpCooldownKey(userId), OTP_COOLDOWN_SECONDS, '1');

    const maskedAccount = `${bank_name || 'your bank'} ••••${String(account_number).slice(-4)}`;
    sendWithdrawalOtpEmail(req.user.email, req.user.full_name, otpCode, balance, maskedAccount);

    res.json({
      message: 'Verification code sent to your email.',
      amount: balance,
      masked_email: maskEmail(req.user.email),
      expires_in: OTP_TTL_SECONDS,
      resend_after: OTP_COOLDOWN_SECONDS,
    });
  } catch (err) {
    console.error('requestWithdrawalOtp error:', err.message);
    res.status(500).json({ error: 'Something went wrong.' });
  }
};

// POST /api/referrals/withdrawals/confirm
const confirmWithdrawal = async (req, res) => {
  const { otp_code } = req.body;
  const userId = req.user.id;

  if (!/^\d{6}$/.test(String(otp_code || '')))
    return res.status(400).json({ error: 'Enter the 6-digit verification code.' });

  try {
    const raw = await redis.get(otpKey(userId));
    if (!raw) {
      return res.status(400).json({ error: 'This verification code has expired. Please request a new one.' });
    }
    const draft = JSON.parse(raw);

    const attempts = parseInt(await redis.get(otpAttemptsKey(userId)) || '0', 10);
    if (attempts >= OTP_MAX_ATTEMPTS) {
      await redis.del(otpKey(userId));
      return res.status(429).json({ error: 'Too many failed attempts. Please request a new code.' });
    }
    if (draft.otp !== String(otp_code)) {
      await redis.setEx(otpAttemptsKey(userId), OTP_TTL_SECONDS, String(attempts + 1));
      return res.status(400).json({ error: 'Invalid verification code.' });
    }

    const client = await pool.connect();
    let withdrawal;
    try {
      await client.query('BEGIN');

      // Serialise withdrawal confirmations for this user.
      await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [userId]);

      const existing = await client.query(
        `SELECT id FROM withdrawal_requests
         WHERE user_id=$1 AND status IN ('pending','approved') LIMIT 1`,
        [userId]
      );
      if (existing.rows.length) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'You already have a withdrawal request in progress.' });
      }

      const balance = await getBalance(client, userId);
      if (balance < MIN_WITHDRAWAL_NAIRA) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: `You need at least ${priceNaira(MIN_WITHDRAWAL_NAIRA)} to withdraw.`,
        });
      }

      const inserted = await client.query(
        `INSERT INTO withdrawal_requests
           (user_id, amount, account_name, account_number, bank_code, bank_name, status)
         VALUES ($1,$2,$3,$4,$5,$6,'pending')
         RETURNING id, amount, account_name, account_number, bank_code, bank_name, status, requested_at`,
        [
          userId,
          balance,
          draft.account_name,
          draft.account_number,
          draft.bank_code,
          draft.bank_name,
        ]
      );
      withdrawal = inserted.rows[0];
      await client.query('COMMIT');
    } catch (err) {
      try { await client.query('ROLLBACK'); } catch (_) {}
      throw err;
    } finally {
      client.release();
    }

    await redis.del(otpKey(userId));
    await redis.del(otpAttemptsKey(userId));

    // In-app notification + emails (best-effort, non-blocking).
    pool.query(
      `INSERT INTO notifications (user_id, title, body, type)
       VALUES ($1,$2,$3,'withdrawal')`,
      [
        userId,
        'Withdrawal request received',
        `Your withdrawal request for ${priceNaira(withdrawal.amount)} is pending admin review.`,
      ]
    ).catch(() => {});

    sendWithdrawalStatusEmail(
      req.user.email,
      req.user.full_name,
      'submitted',
      withdrawal.amount,
      withdrawal.account_name
    );

    handleEmail({
      to: process.env.ADMIN_EMAIL || 'ceo@southswift.com.ng',
      subject: 'ADMIN: New withdrawal request',
      html: `<h2>New withdrawal request</h2>
             <p><strong>User:</strong> ${escapeHtml(req.user.full_name)} — ${escapeHtml(req.user.email)}</p>
             <p><strong>Amount:</strong> ${priceNaira(withdrawal.amount)}</p>
             <p><strong>Account:</strong> ${escapeHtml(withdrawal.account_name)} · ${escapeHtml(withdrawal.bank_name || withdrawal.bank_code)} · ${escapeHtml(withdrawal.account_number)}</p>
             <p>Review it in the SouthSwift admin panel → Withdrawals.</p>`,
    });

    res.status(201).json({
      message: 'Withdrawal request sent to the SouthSwift team.',
      withdrawal,
    });
  } catch (err) {
    console.error('confirmWithdrawal error:', err.message);
    res.status(500).json({ error: 'Something went wrong.' });
  }
};

// GET /api/admin/withdrawals?status=
const adminListWithdrawals = async (req, res) => {
  const { status } = req.query;
  try {
    const result = await pool.query(
      `SELECT wr.*, u.full_name, u.email, u.phone
       FROM withdrawal_requests wr
       JOIN users u ON u.id = wr.user_id
       WHERE ($1::text IS NULL OR wr.status=$1)
       ORDER BY wr.requested_at DESC
       LIMIT 300`,
      [status || null]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('adminListWithdrawals error:', err.message);
    res.status(500).json({ error: 'Something went wrong.' });
  }
};

// PUT /api/admin/withdrawals/:id
const adminReviewWithdrawal = async (req, res) => {
  const { action, note } = req.body;
  const transitions = { approve: 'approved', reject: 'rejected', mark_paid: 'paid' };
  const nextStatus = transitions[action];
  if (!nextStatus) return res.status(400).json({ error: 'Invalid action.' });

  const client = await pool.connect();
  let row;
  try {
    await client.query('BEGIN');
    const current = await client.query(
      'SELECT * FROM withdrawal_requests WHERE id=$1 FOR UPDATE',
      [req.params.id]
    );
    if (!current.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Withdrawal request not found.' });
    }
    const wr = current.rows[0];

    const allowed =
      (action === 'approve' && wr.status === 'pending') ||
      (action === 'reject' && ['pending', 'approved'].includes(wr.status)) ||
      (action === 'mark_paid' && wr.status === 'approved');

    if (!allowed) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Cannot ${action.replace('_', ' ')} a ${wr.status} request.` });
    }

    const updated = await client.query(
      `UPDATE withdrawal_requests
       SET status=$1,
           admin_note=COALESCE($2, admin_note),
           reviewed_by=$3,
           reviewed_at=NOW(),
           paid_at=CASE WHEN $1='paid' THEN NOW() ELSE paid_at END,
           updated_at=NOW()
       WHERE id=$4
       RETURNING *`,
      [nextStatus, note || null, req.user.id, req.params.id]
    );
    row = updated.rows[0];
    await client.query('COMMIT');
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    console.error('adminReviewWithdrawal error:', err.message);
    return res.status(500).json({ error: 'Something went wrong.' });
  } finally {
    client.release();
  }

  try {
    const userRes = await pool.query('SELECT full_name, email FROM users WHERE id=$1', [row.user_id]);
    const user = userRes.rows[0] || {};
    pool.query(
      `INSERT INTO notifications (user_id, title, body, type)
       VALUES ($1,$2,$3,'withdrawal')`,
      [
        row.user_id,
        `Withdrawal ${row.status}`,
        `Your withdrawal request for ${priceNaira(row.amount)} is now ${row.status}.`,
      ]
    ).catch(() => {});
    sendWithdrawalStatusEmail(
      user.email,
      user.full_name,
      row.status,
      row.amount,
      row.account_name,
      row.admin_note
    );
  } catch (err) {
    console.error('withdrawal decision notification error:', err.message);
  }

  res.json({ message: `Withdrawal ${row.status}.`, withdrawal: row });
};

// Best-effort email after a reward has been committed. Never throws.
const notifyReferralReward = async ({ referrerId, referredUserId, dealId }) => {
  try {
    const [referrerRes, referredRes, listingRes] = await Promise.all([
      pool.query('SELECT full_name, email FROM users WHERE id=$1', [referrerId]),
      pool.query('SELECT full_name FROM users WHERE id=$1', [referredUserId]),
      pool.query(
        `SELECT l.title
         FROM deals d LEFT JOIN listings l ON l.id = d.listing_id
         WHERE d.id=$1`,
        [dealId]
      ),
    ]);
    const referrer = referrerRes.rows[0];
    if (!referrer?.email) return;
    const balance = await getBalance(pool, referrerId);
    sendReferralRewardEmail(
      referrer.email,
      referrer.full_name,
      referredRes.rows[0]?.full_name,
      listingRes.rows[0]?.title,
      balance
    );
  } catch (err) {
    console.error('notifyReferralReward error:', err.message);
  }
};

module.exports = {
  getSummary,
  getBanks,
  resolveAccount,
  requestWithdrawalOtp,
  confirmWithdrawal,
  adminListWithdrawals,
  adminReviewWithdrawal,
  notifyReferralReward,
};
