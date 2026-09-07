const { test } = require('node:test');
const assert = require('node:assert');
const {
  computeDealAmounts,
  nairaToKobo,
  agentPayoutKobo,
  totalPayableForRent,
  FEE_RATE,
  AGENT_FEE_PERCENT,
  SOUTHSWIFT_FEE_PERCENT,
  TOTAL_FEE_PERCENT,
} = require('../utils/money');

test('fee rate is 2.5%', () => {
  assert.strictEqual(FEE_RATE, 0.025);
});

test('fee percents sum to 5%', () => {
  assert.strictEqual(AGENT_FEE_PERCENT, 2.5);
  assert.strictEqual(SOUTHSWIFT_FEE_PERCENT, 2.5);
  assert.strictEqual(TOTAL_FEE_PERCENT, 5.0);
  assert.strictEqual(AGENT_FEE_PERCENT + SOUTHSWIFT_FEE_PERCENT, TOTAL_FEE_PERCENT);
});

test('computeDealAmounts: tenant pays rent + 2.5%', () => {
  const r = computeDealAmounts(1000000);
  assert.strictEqual(r.serviceFeeTenant, 25000);
  assert.strictEqual(r.serviceFeeLandlord, 25000);
  assert.strictEqual(r.totalPaid, 1025000);
});

test('computeDealAmounts: carries fixed audit percents', () => {
  const r = computeDealAmounts(800000);
  assert.strictEqual(r.serviceFeeTenant, 20000);
  assert.strictEqual(r.serviceFeeLandlord, 20000);
  assert.strictEqual(r.totalPaid, 820000);
  assert.strictEqual(r.agentFeePercent, 2.5);
  assert.strictEqual(r.southswiftFeePercent, 2.5);
  assert.strictEqual(r.totalFeePercent, 5.0);
});

test('computeDealAmounts: accepts BIGINT-as-string from Postgres', () => {
  const r = computeDealAmounts('1000000');
  assert.strictEqual(r.totalPaid, 1025000);
  assert.strictEqual(typeof r.totalPaid, 'number');
});

test('computeDealAmounts: rounds fees to whole naira', () => {
  const r = computeDealAmounts(333333);
  assert.strictEqual(r.serviceFeeTenant, Math.round(333333 * 0.025)); // 8333
  assert.strictEqual(r.totalPaid, 333333 + r.serviceFeeTenant);
});

test('totalPayableForRent: 800k base derives 820k (old listings need no rewrite)', () => {
  assert.strictEqual(totalPayableForRent(800000), 820000);
  assert.strictEqual(totalPayableForRent('800000'), 820000);
  assert.strictEqual(totalPayableForRent(0), null);
  assert.strictEqual(totalPayableForRent(-5), null);
});

test('nairaToKobo multiplies by 100 (and coerces strings)', () => {
  assert.strictEqual(nairaToKobo(1025000), 102500000);
  assert.strictEqual(nairaToKobo('1025000'), 102500000);
});

test('agentPayoutKobo = (rent - landlord fee) * 100', () => {
  assert.strictEqual(agentPayoutKobo(1000000, 25000), 97500000);
  assert.strictEqual(agentPayoutKobo('1000000', '25000'), 97500000);
});

test('agentPayoutKobo: 800k example flows 780k via agent to landlord', () => {
  assert.strictEqual(agentPayoutKobo(800000, 20000), 78000000);
});
