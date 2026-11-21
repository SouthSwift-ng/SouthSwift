const assert = require('node:assert/strict');
const test = require('node:test');
const {
  REFERRAL_REWARD_NAIRA,
  MIN_WITHDRAWAL_NAIRA,
  generateReferralCode,
  normalizeReferralCode,
  isValidReferralCode,
  computeAvailableBalance,
  maskEmail,
  priceNaira,
  creditReferralReward,
} = require('../utils/referral');

test('referral reward defaults to 1000 naira', () => {
  assert.equal(REFERRAL_REWARD_NAIRA, 1000);
});

test('minimum withdrawal is 1000 naira', () => {
  assert.equal(MIN_WITHDRAWAL_NAIRA, 1000);
});

test('generateReferralCode is SS + 6 uppercase hex chars and unique', () => {
  const codes = new Set(Array.from({ length: 200 }, generateReferralCode));
  assert.equal(codes.size, 200);
  for (const code of codes) assert.match(code, /^SS[0-9A-F]{6}$/);
});

test('normalizeReferralCode trims and uppercases; rejects non-strings', () => {
  assert.equal(normalizeReferralCode('  ssab12cd '), 'SSAB12CD');
  assert.equal(normalizeReferralCode(null), '');
  assert.equal(normalizeReferralCode(42), '');
});

test('isValidReferralCode accepts 4-20 alphanumerics only', () => {
  assert.equal(isValidReferralCode('SSAB12CD'), true);
  assert.equal(isValidReferralCode('abcd'), true);
  assert.equal(isValidReferralCode('AB'), false);
  assert.equal(isValidReferralCode('SS-AB12'), false);
  assert.equal(isValidReferralCode('A'.repeat(21)), false);
});

test('computeAvailableBalance never goes negative and handles strings', () => {
  assert.equal(computeAvailableBalance(3000, 2000), 1000);
  assert.equal(computeAvailableBalance('3000', '5000'), 0);
  assert.equal(computeAvailableBalance(null, undefined), 0);
});

test('maskEmail exposes at most the first two local characters', () => {
  assert.equal(maskEmail('jane.doe@example.com'), 'ja******@example.com');
  assert.equal(maskEmail('ab@x.com'), 'ab*@x.com');
  assert.equal(maskEmail('not-an-email'), '');
  assert.equal(maskEmail(null), '');
});

test('priceNaira formats whole naira with the naira symbol', () => {
  assert.equal(priceNaira(1000), '\u20A61,000');
  assert.equal(priceNaira('2500'), '\u20A62,500');
  assert.equal(priceNaira(null), '\u20A60');
});

test('creditReferralReward inserts a reward for a referred tenant', async () => {
  const calls = [];
  const fakeQueryable = {
    query: async (sql, params) => {
      calls.push({ sql, params });
      return { rows: [{ referrer_id: 'r1', referred_user_id: 't1', amount: 1000 }] };
    },
  };

  const reward = await creditReferralReward(fakeQueryable, 'deal1', 't1');

  assert.deepEqual(reward, { referrer_id: 'r1', referred_user_id: 't1', amount: 1000 });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].params, ['deal1', 1000, 't1']);
  assert.match(calls[0].sql, /ON CONFLICT \(deal_id\) DO NOTHING/i);
});

test('creditReferralReward returns null when there is no referrer', async () => {
  const fakeQueryable = { query: async () => ({ rows: [] }) };
  assert.equal(await creditReferralReward(fakeQueryable, 'deal1', 't1'), null);
});
