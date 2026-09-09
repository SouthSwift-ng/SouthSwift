const { test } = require('node:test');
const assert = require('node:assert');
const {
  computeDealAmounts,
  nairaToKobo,
  agentPayoutKobo,
  totalPayableForRent,
  parseInspectionFee,
  isInspectionHoldExpired,
  FEE_RATE,
  AGENT_FEE_PERCENT,
  SOUTHSWIFT_FEE_PERCENT,
  TOTAL_FEE_PERCENT,
  INSPECTION_FEE_DEFAULT,
  INSPECTION_FEE_MAX,
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

test('inspection fee defaults to 3000 when blank', () => {
  assert.strictEqual(INSPECTION_FEE_DEFAULT, 3000);
  assert.strictEqual(INSPECTION_FEE_MAX, 5000);
  assert.strictEqual(parseInspectionFee(undefined), 3000);
  assert.strictEqual(parseInspectionFee(null), 3000);
  assert.strictEqual(parseInspectionFee(''), 3000);
  assert.strictEqual(parseInspectionFee(0), 0);
  assert.strictEqual(parseInspectionFee('2500'), 2500);
  assert.strictEqual(parseInspectionFee(5000), 5000);
});

test('parseInspectionFee rejects over-cap and negative fees', () => {
  assert.match(parseInspectionFee(5001).error, /must not exceed/);
  assert.match(parseInspectionFee('99999').error, /must not exceed/);
  assert.match(parseInspectionFee(-100).error, /non-negative/);
  assert.match(parseInspectionFee('abc').error, /non-negative/);
});

test('isInspectionHoldExpired: fresh paid hold is kept', () => {
  const now = Date.now();
  const deal = { status: 'payment_pending', inspection_fee: 3000,
    has_paid_inspection: true, inspection_paid_at: new Date(now - 2 * 3600 * 1000).toISOString() };
  assert.strictEqual(isInspectionHoldExpired(deal, 24, now), false);
});

test('isInspectionHoldExpired: paid hold past timeout lapses', () => {
  const now = Date.now();
  const deal = { status: 'initiated', inspection_fee: 3000,
    has_paid_inspection: true, inspection_paid_at: new Date(now - 25 * 3600 * 1000).toISOString() };
  assert.strictEqual(isInspectionHoldExpired(deal, 24, now), true);
});

test('isInspectionHoldExpired: skipped hold uses skipped_at and lapses', () => {
  const now = Date.now();
  const deal = { status: 'payment_pending', inspection_fee: 3000, inspection_skipped: true,
    inspection_skipped_at: new Date(now - 26 * 3600 * 1000).toISOString() };
  assert.strictEqual(isInspectionHoldExpired(deal, 24, now), true);
});

test('isInspectionHoldExpired: pre-inspection, escrowed, and bad inputs never lapse', () => {
  const now = Date.now();
  const old = new Date(now - 99 * 3600 * 1000).toISOString();
  // Unsatisfied gate holds nothing.
  assert.strictEqual(isInspectionHoldExpired(
    { status: 'payment_pending', inspection_fee: 3000, inspection_paid_at: old }, 24, now), false);
  // Rent secured — no longer a hold.
  assert.strictEqual(isInspectionHoldExpired(
    { status: 'escrow_held', inspection_fee: 3000, has_paid_inspection: true, inspection_paid_at: old }, 24, now), false);
  // No timestamp anywhere (legacy row): falls back to updated_at like the sweeper.
  assert.strictEqual(isInspectionHoldExpired(
    { status: 'payment_pending', inspection_fee: 3000, has_paid_inspection: true, updated_at: old }, 24, now), true);
  assert.strictEqual(isInspectionHoldExpired(null, 24, now), false);
  assert.strictEqual(isInspectionHoldExpired(
    { status: 'payment_pending', inspection_fee: 3000, has_paid_inspection: true, inspection_paid_at: old }, 0, now), false);
});
