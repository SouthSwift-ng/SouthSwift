const { test } = require('node:test');
const assert = require('node:assert');
const { computeDealAmounts, nairaToKobo, agentPayoutKobo, FEE_RATE } = require('../utils/money');

test('fee rate is 2.5%', () => {
  assert.strictEqual(FEE_RATE, 0.025);
});

test('computeDealAmounts: tenant pays rent + 2.5%', () => {
  const r = computeDealAmounts(1000000);
  assert.strictEqual(r.serviceFeeTenant, 25000);
  assert.strictEqual(r.serviceFeeLandlord, 25000);
  assert.strictEqual(r.totalPaid, 1025000);
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

test('nairaToKobo multiplies by 100 (and coerces strings)', () => {
  assert.strictEqual(nairaToKobo(1025000), 102500000);
  assert.strictEqual(nairaToKobo('1025000'), 102500000);
});

test('agentPayoutKobo = (rent - landlord fee) * 100', () => {
  assert.strictEqual(agentPayoutKobo(1000000, 25000), 97500000);
  assert.strictEqual(agentPayoutKobo('1000000', '25000'), 97500000);
});
