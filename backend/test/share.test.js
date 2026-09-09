const { test } = require('node:test');
const assert = require('node:assert');
const { escapeHtml, buildShareText, buildShareHtml } = require('../utils/share');
const { buildListingSharePayload, notifyNewListing, isAutoShareMocked } = require('../utils/autoShare');

const listing = {
  id: 42,
  title: '3-Bedroom Flat in Lekki',
  bedrooms: 3,
  property_type: 'apartment',
  city: 'Lekki',
  state: 'Lagos',
  rent_price: 2500000,
  rent_period: 'yearly',
  is_swiftshield: true,
  images: ['https://example.com/photo.jpg'],
};

test('escapeHtml neutralises attribute-breaking chars', () => {
  assert.strictEqual(escapeHtml('a"b<c>&\''), 'a&quot;b&lt;c&gt;&amp;&#39;');
});

test('buildShareText contains price, location, shield and URL', () => {
  const t = buildShareText(listing, 'https://api.example/s/42');
  assert.match(t, /Lekki/);
  assert.match(t, /2,500,000/);
  assert.match(t, /SwiftShield/);
  assert.match(t, /https:\/\/api\.example\/s\/42/);
});

test('buildShareHtml emits OG tags, escapes title, redirects', () => {
  const evil = { ...listing, title: 'Nice"><script>alert(1)</script>' };
  const html = buildShareHtml({ listing: evil, shareUrl: 'https://api.example/s/42', frontendUrl: 'https://southswift.com.ng/listings/42' });
  assert.match(html, /og:title/);
  assert.match(html, /og:image/);
  assert.match(html, /content="0;url=/);
  assert.doesNotMatch(html, /<script>alert\(1\)/);
  assert.match(html, /southswift\.com\.ng\/listings\/42/);
});

test('autoShare is mocked without SHARE_LIVE', () => {
  delete process.env.SHARE_LIVE;
  assert.strictEqual(isAutoShareMocked(), true);
});

test('notifyNewListing resolves mocked results and never throws', async () => {
  delete process.env.SHARE_LIVE;
  const payload = buildListingSharePayload(listing);
  assert.strictEqual(payload.listing_id, 42);
  assert.match(payload.text, /Lekki/);
  const results = await notifyNewListing(listing);
  assert.strictEqual(results.length, 5);
  for (const r of results) {
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.mocked, true);
  }
});

test('share URLs stay on the client domain (never the backend host)', async () => {
  process.env.CLIENT_URL = 'https://southswift.com.ng';
  delete process.env.SHARE_PATH_PREFIX;
  const { buildApiShareUrl } = require('../utils/autoShare');
  // A request from the backend host must NOT leak into the share URL.
  const fakeReq = { protocol: 'https', get: () => 'southswift.onrender.com' };
  const url = buildApiShareUrl(listing, fakeReq);
  assert.strictEqual(url, 'https://southswift.com.ng/s/42');
  const payload = buildListingSharePayload(listing, fakeReq);
  assert.match(payload.shareUrl, /^https:\/\/southswift\.com\.ng\/s\/42$/);
  assert.doesNotMatch(payload.text, /onrender/);
});
