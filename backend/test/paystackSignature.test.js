const { test } = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const { computePaystackSignature, verifyPaystackSignature } = require('../utils/paystackSignature');

const SECRET = 'sk_test_dummy_secret';
const body = JSON.stringify({ event: 'charge.success', data: { reference: 'ref_123', amount: 1025000 } });
const sign = (b, s = SECRET) => crypto.createHmac('sha512', s).update(b).digest('hex');

test('accepts a correctly-signed body', () => {
  assert.strictEqual(verifyPaystackSignature(body, sign(body), SECRET), true);
});

test('rejects a tampered body (e.g. amount changed)', () => {
  const tampered = body.replace('1025000', '1');
  assert.strictEqual(verifyPaystackSignature(tampered, sign(body), SECRET), false);
});

test('rejects a signature made with the wrong secret', () => {
  assert.strictEqual(verifyPaystackSignature(body, sign(body, 'attacker_secret'), SECRET), false);
});

test('rejects missing signature or secret', () => {
  assert.strictEqual(verifyPaystackSignature(body, '', SECRET), false);
  assert.strictEqual(verifyPaystackSignature(body, sign(body), ''), false);
});

test('computePaystackSignature matches Node crypto HMAC-SHA512', () => {
  assert.strictEqual(computePaystackSignature(body, SECRET), sign(body));
});
