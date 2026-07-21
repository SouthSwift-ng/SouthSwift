const { test } = require('node:test');
const assert = require('node:assert');
const { validateClientLeadInput } = require('../utils/clientFunnel');

test('accepts a complete funnel submission', () => {
  const result = validateClientLeadInput({
    fullName: 'Ada Okafor',
    email: 'ada@example.com',
    phone: '+2348000000000',
    role: 'tenant',
    city: 'Lagos',
    propertyType: 'rent',
    budget: '1500000',
    moveInTiming: 'within-30-days',
    needs: ['verified-agents', 'escrow']
  });

  assert.deepStrictEqual(result, { ok: true });
});

test('rejects missing required fields', () => {
  const result = validateClientLeadInput({
    fullName: '',
    email: 'bad-email',
    role: 'tenant',
    city: 'Lagos',
    propertyType: 'rent',
    budget: '',
    moveInTiming: 'within-30-days',
    needs: []
  });

  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.includes('fullName'));
  assert.ok(result.errors.includes('email'));
  assert.ok(result.errors.includes('budget'));
  assert.ok(result.errors.includes('needs'));
});
