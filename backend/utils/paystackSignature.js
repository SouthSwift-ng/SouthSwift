// Paystack webhook signature verification — extracted so it can be unit-tested and so the
// comparison is timing-safe (a plain === leaks timing information about the expected HMAC).
const crypto = require('crypto');

function computePaystackSignature(rawBody, secret) {
  return crypto.createHmac('sha512', secret).update(rawBody).digest('hex');
}

// Returns true only if `signature` is a valid HMAC-SHA512 of rawBody keyed with `secret`.
function verifyPaystackSignature(rawBody, signature, secret) {
  if (!secret || !signature) return false;
  const expected = Buffer.from(computePaystackSignature(rawBody, secret));
  const provided = Buffer.from(String(signature));
  if (expected.length !== provided.length) return false; // timingSafeEqual requires equal lengths
  return crypto.timingSafeEqual(expected, provided);
}

module.exports = { computePaystackSignature, verifyPaystackSignature };
