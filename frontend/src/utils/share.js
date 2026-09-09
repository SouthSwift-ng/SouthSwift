// ── LISTING SHARE HELPERS ─────────────────────────────────────────────────────
// Pure functions (no React) so listings can be shared from ListingDetail,
// ListingCard, and the agent Dashboard with identical text + links.

// Share path prefix — override with REACT_APP_SHARE_PATH_PREFIX if the
// vercel.json rewrite source ever changes (must match it + backend
// SHARE_PATH_PREFIX).
const sharePath = () => {
  const raw = process.env.REACT_APP_SHARE_PATH_PREFIX || '/s';
  return `/${String(raw).replace(/^\/+|\/+$/g, '')}`;
};

// Client origin — runtime window.location.origin first (works across
// localhost / preview / prod with zero config), REACT_APP_CLIENT_URL as the
// explicit override for contexts without window.
const clientOrigin = () => {
  if (typeof window !== 'undefined' && window.location?.origin) return window.location.origin;
  return String(process.env.REACT_APP_CLIENT_URL || '').replace(/\/+$/, '');
};

// Crawlable share URL — always on the CLIENT domain (/s/:id). Vercel proxies
// it to <BACKEND_ORIGIN>/api/share/:id (see frontend/vercel.json + api/s/[id].js),
// so crawlers get per-listing OG tags while users never see the backend host.
// The raw /listings/:id SPA URL has only static OG tags, so it is not shared.
export const buildShareUrl = (listingOrId) => {
  const id = typeof listingOrId === 'object' ? listingOrId?.id : listingOrId;
  if (id === undefined || id === null || id === '') return '';
  return `${clientOrigin()}${sharePath()}/${id}`;
};

// Human listing URL (fallback / canonical for display).
export const buildListingUrl = (listingOrId) => {
  const id = typeof listingOrId === 'object' ? listingOrId?.id : listingOrId;
  if (id === undefined || id === null || id === '') return '';
  const origin = clientOrigin();
  if (origin) return `${origin}/listings/${id}`;
  return `/listings/${id}`;
};

const fmtPrice = (n) => {
  const num = Number(n);
  return Number.isFinite(num) ? num.toLocaleString() : '—';
};

// Pre-filled promo text — used for WhatsApp/X/Telegram + native share.
export const buildShareText = (listing = {}, shareUrl = '') => {
  const url = shareUrl || buildShareUrl(listing);
  const beds = listing.bedrooms ? `${listing.bedrooms}bd ` : '';
  const ptype = listing.property_type ? `${listing.property_type} in ` : '';
  const loc = [listing.city, listing.state].filter(Boolean).join(', ');
  const head = `${beds}${ptype}${loc || listing.title || 'property'}`.trim();
  const price = `₦${fmtPrice(listing.rent_price)}${listing.rent_period === 'monthly' ? '/mo' : '/yr'}`;
  const shield = listing.is_swiftshield ? ' 🛡️ SwiftShield Protected' : '';
  const title = listing.title && listing.title !== head ? `\n${listing.title}` : '';
  return `${head} — ${price}${shield}${title}\n${url}`.trim();
};


export const buildShareLinks = (listing = {}) => {
  const url = buildShareUrl(listing);
  const text = buildShareText(listing, url);
  const eu = encodeURIComponent(url);
  const et = encodeURIComponent(text);
  return {
    url,
    text,
    whatsapp: `https://wa.me/?text=${et}`,
    x: `https://twitter.com/intent/tweet?text=${et}&url=${eu}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${eu}`,
    telegram: `https://t.me/share/url?url=${eu}&text=${et}`,
  };
};

export const canNativeShare = () =>
  typeof navigator !== 'undefined' && typeof navigator.share === 'function';

export const copyListingLink = async (listingOrId) => {
  const url = typeof listingOrId === 'string' && listingOrId.startsWith('http')
    ? listingOrId
    : buildShareUrl(listingOrId);
  if (navigator?.clipboard?.writeText) {
    await navigator.clipboard.writeText(url);
    return url;
  }
  // Clipboard API unavailable (old browser / non-secure context) — legacy fallback.
  const ta = document.createElement('textarea');
  ta.value = url;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  document.body.removeChild(ta);
  return url;
};

export const nativeShareListing = (listing = {}) => {
  const { url, text } = buildShareLinks(listing);
  return navigator.share({ title: listing.title || 'SouthSwift listing', text, url });
};
