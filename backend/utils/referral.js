const crypto = require('crypto');

const REFERRAL_REWARD_NAIRA = Math.max(
  0,
  parseInt(process.env.REFERRAL_REWARD_NGN, 10) || 1000
);

const MIN_WITHDRAWAL_NAIRA = 1000;

const generateReferralCode = () =>
  'SS' + crypto.randomBytes(3).toString('hex').toUpperCase();

const normalizeReferralCode = (code) =>
  typeof code === 'string' ? code.trim().toUpperCase() : '';

const isValidReferralCode = (code) => /^[A-Z0-9]{4,20}$/.test(normalizeReferralCode(code));

const computeAvailableBalance = (earnedNaira, reservedNaira) => {
  const earned = Number(earnedNaira) || 0;
  const reserved = Number(reservedNaira) || 0;
  return Math.max(0, earned - reserved);
};

const maskEmail = (email) => {
  if (!email || !email.includes('@')) return '';
  const [local, domain] = email.split('@');
  const visible = local.slice(0, 2);
  return `${visible}${'*'.repeat(Math.max(local.length - 2, 1))}@${domain}`;
};

const priceNaira = (value) =>
  `\u20A6${Number(value || 0).toLocaleString('en-NG')}`;

async function creditReferralReward(queryable, dealId, tenantId) {
  const result = await queryable.query(
    `INSERT INTO referral_rewards (referrer_id, referred_user_id, deal_id, amount)
     SELECT u.referred_by, u.id, $1, $2
     FROM users u
     WHERE u.id = $3
       AND u.referred_by IS NOT NULL
       AND u.referred_by <> u.id
     ON CONFLICT (deal_id) DO NOTHING
     RETURNING referrer_id, referred_user_id, amount`,
    [dealId, REFERRAL_REWARD_NAIRA, tenantId]
  );
  return result.rows[0] || null;
}

module.exports = {
  REFERRAL_REWARD_NAIRA,
  MIN_WITHDRAWAL_NAIRA,
  generateReferralCode,
  normalizeReferralCode,
  isValidReferralCode,
  computeAvailableBalance,
  maskEmail,
  priceNaira,
  creditReferralReward,
};
