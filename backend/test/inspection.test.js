const { test } = require('node:test');
const assert = require('node:assert');
const { sanitizeListingForRole } = require('../controllers/listingController');
const { sanitizeDealForRole } = require('../controllers/dealController');

const baseListing = {
  id: 'l1', agent_id: 'agent1', rent_price: 800000, total_payable: 820000,
  agent_fee_percent: 2.5, southswift_fee_percent: 2.5, total_fee_percent: 5.0,
  inspection_fee: 3000,
};

test('public listing keeps inspection_fee (tenant-facing price) but strips fee split', () => {
  const pub = sanitizeListingForRole({ ...baseListing }, null);
  assert.strictEqual(pub.inspection_fee, 3000);
  assert.strictEqual(pub.total_payable, 820000);
  assert.ok(!('agent_fee_percent' in pub));
  assert.ok(!('southswift_fee_percent' in pub));
  assert.ok(!('total_fee_percent' in pub));
});

test('listing owner (agent) sees full split + inspection fee', () => {
  const owner = sanitizeListingForRole({ ...baseListing }, { id: 'agent1', role: 'agent' });
  assert.strictEqual(owner.agent_fee_percent, 2.5);
  assert.strictEqual(owner.inspection_fee, 3000);
});

test('zero-fee listing signals skipped inspection step', () => {
  const pub = sanitizeListingForRole({ ...baseListing, inspection_fee: 0 }, null);
  assert.strictEqual(Number(pub.inspection_fee) > 0, false);
});

const baseDeal = {
  id: 'd1', tenant_id: 't1', agent_id: 'agent1', rent_amount: 800000, total_paid: 820000,
  service_fee_tenant: 20000, service_fee_landlord: 20000,
  agent_fee_percent: 2.5, southswift_fee_percent: 2.5, total_fee_percent: 5.0,
  inspection_fee: 3000, has_paid_inspection: false,
};

test('tenant deal view keeps inspection state but strips fee split', () => {
  const t = sanitizeDealForRole({ ...baseDeal }, { id: 't1', role: 'tenant' });
  assert.strictEqual(t.inspection_fee, 3000);
  assert.strictEqual(t.has_paid_inspection, false);
  assert.strictEqual(t.total_paid, 820000);
  assert.ok(!('agent_fee_percent' in t));
  assert.ok(!('service_fee_landlord' in t));
});

test('agent deal view keeps full inspection + split audit', () => {
  const a = sanitizeDealForRole(
    { ...baseDeal, has_paid_inspection: true, inspection_reference: 'SS-TRX-X' },
    { id: 'agent1', role: 'agent' }
  );
  assert.strictEqual(a.has_paid_inspection, true);
  assert.strictEqual(a.inspection_reference, 'SS-TRX-X');
  assert.strictEqual(a.agent_fee_percent, 2.5);
});
