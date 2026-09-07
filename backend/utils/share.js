// ── SHARE HELPERS (pure, DB-free — safe to unit test) ─────────────────────────
// Builds the crawlable share page content + promo text for a listing.

const escapeHtml = (v) => String(v ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const fmtPrice = (n) => {
  const num = Number(n);
  return Number.isFinite(num) ? num.toLocaleString() : '—';
};

// Human listing URL on the frontend SPA.
const buildListingFrontendUrl = (listingOrId) => {
  const id = typeof listingOrId === 'object' ? listingOrId?.id : listingOrId;
  const base = String(process.env.CLIENT_URL || 'https://southswift.com.ng').replace(/\/+$/, '');
  return `${base}/listings/${id}`;
};

// Pre-filled promo text — mirrors frontend/src/utils/share.js buildShareText.
const buildShareText = (listing = {}, shareUrl = '') => {
  const beds = listing.bedrooms ? `${listing.bedrooms}bd ` : '';
  const ptype = listing.property_type ? `${listing.property_type} in ` : '';
  const loc = [listing.city, listing.state].filter(Boolean).join(', ');
  const head = `${beds}${ptype}${loc || listing.title || 'property'}`.trim();
  const price = `\u20A6${fmtPrice(listing.rent_price)}${listing.rent_period === 'monthly' ? '/mo' : '/yr'}`;
  const shield = listing.is_swiftshield ? ' \u{1F6E1}\uFE0F SwiftShield Protected' : '';
  const title = listing.title && listing.title !== head ? `\n${listing.title}` : '';
  const url = shareUrl || buildListingFrontendUrl(listing);
  return `${head} — ${price}${shield}${title}\n${url}`.trim();
};

// Full HTML for GET /api/share/:id — crawlers read the OG tags, humans bounce
// to the SPA via meta refresh + JS + fallback link.
const buildShareHtml = ({ listing = {}, shareUrl = '', frontendUrl = '' }) => {
  const title = `${listing.title || 'Property listing'} — SouthSwift`;
  const desc = buildShareText(listing, '').split('\n')[0].slice(0, 200);
  const image = Array.isArray(listing.images) && listing.images[0]
    ? listing.images[0]
    : `${String(process.env.CLIENT_URL || 'https://southswift.com.ng').replace(/\/+$/, '')}/og-image.png`;
  const e = escapeHtml;
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" />`
    + `<meta name="viewport" content="width=device-width, initial-scale=1.0" />`
    + `<title>${e(title)}</title>`
    + `<meta name="description" content="${e(desc)}" />`
    + `<meta property="og:type" content="website" />`
    + `<meta property="og:site_name" content="SouthSwift" />`
    + `<meta property="og:title" content="${e(title)}" />`
    + `<meta property="og:description" content="${e(desc)}" />`
    + `<meta property="og:image" content="${e(image)}" />`
    + `<meta property="og:url" content="${e(shareUrl)}" />`
    + `<meta name="twitter:card" content="summary_large_image" />`
    + `<meta name="twitter:title" content="${e(title)}" />`
    + `<meta name="twitter:description" content="${e(desc)}" />`
    + `<meta name="twitter:image" content="${e(image)}" />`
    + `<link rel="canonical" href="${e(frontendUrl)}" />`
    + `<meta http-equiv="refresh" content="0;url=${e(frontendUrl)}" />`
    + `</head><body>`
    + `<p>Redirecting to <a href="${e(frontendUrl)}">${e(title)}</a>…</p>`
    + `<script>window.location.replace(${JSON.stringify(frontendUrl)});</script>`
    + `</body></html>`;
};

module.exports = { escapeHtml, buildShareText, buildListingFrontendUrl, buildShareHtml };
