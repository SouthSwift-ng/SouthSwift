// ── AUTO-SHARE (Phase 2 — MOCKED) ────────────────────────────────────────────
// Auto-posts every new listing to WhatsApp / X / Facebook / Telegram.
//
// No credentials are configured yet, so every provider runs in MOCK mode:
// it logs the payload and resolves { ok: true, mocked: true } instead of
// hitting a real API. Drop real creds into .env + set SHARE_LIVE=true and
// each sender below will perform its HTTPS call automatically — call sites
// (listingController.createListing) do NOT change.
//
// Expected env when going live:
//   SHARE_LIVE=true
//   CLIENT_URL=https://southswift.com.ng   (public share links + redirect target)
//   SHARE_PATH_PREFIX=/s                   (must match frontend REACT_APP_SHARE_PATH_PREFIX + vercel.json)
//   SHARE_WEBHOOK_URL=https://...          (generic webhook, e.g. Slack/Discord)
//   WHATSAPP_TOKEN=...  WHATSAPP_PHONE_ID=...
//   X_BEARER_TOKEN=...
//   FACEBOOK_PAGE_TOKEN=...  FACEBOOK_PAGE_ID=...
//   TELEGRAM_BOT_TOKEN=...  TELEGRAM_CHAT_ID=...
// NOTE: BACKEND_ORIGIN (e.g. https://southswift.onrender.com) lives on the
// Vercel project env only — read by frontend/api/s/[id].js. Never put the
// backend host here or in any shared text.

const axios = require('axios');
const { buildShareText, buildListingFrontendUrl } = require('./share');

const isLive = () => String(process.env.SHARE_LIVE || '').toLowerCase() === 'true';
const isAutoShareMocked = () => !isLive();

const asId = (listing) => (typeof listing === 'object' ? listing?.id : listing);

// Public share URL — always on the CLIENT domain (<CLIENT_URL>/s/:id).
// Vercel proxies it to <BACKEND_ORIGIN>/api/share/:id (frontend/vercel.json +
// frontend/api/s/[id].js), so the backend host never appears in shared text.
// `req` is kept for backwards-compat but deliberately ignored — using the
// request host here is what leaked southswift.onrender.com into shares.
const buildApiShareUrl = (listingOrId) => {
  const id = asId(listingOrId);
  const base = String(process.env.CLIENT_URL || 'https://southswift.com.ng').replace(/\/+$/, '');
  const prefix = `/${String(process.env.SHARE_PATH_PREFIX || '/s').replace(/^\/+|\/+$/g, '')}`;
  return `${base}${prefix}/${id}`;
};

const buildListingSharePayload = (listing = {}, req) => {
  const frontendUrl = buildListingFrontendUrl(listing);
  const shareUrl = buildApiShareUrl(listing, req);
  return {
    listing_id: listing?.id ?? null,
    text: buildShareText(listing, shareUrl),
    frontendUrl,
    shareUrl,
    image: Array.isArray(listing.images) && listing.images[0] ? listing.images[0] : null,
  };
};

const mockResult = (provider, payload) => {
  console.log(`📣 [autoShare:MOCK] ${provider} → listing ${payload.listing_id}: ${payload.text.slice(0, 120)}…`);
  return Promise.resolve({ provider, ok: true, mocked: true });
};

// ── PROVIDERS (mock unless SHARE_LIVE=true + provider creds present) ──────────

const postToWebhook = async (payload) => {
  const url = process.env.SHARE_WEBHOOK_URL;
  if (!isLive() || !url) return mockResult('webhook', payload);
  try {
    await axios.post(url, { text: payload.text }, { timeout: 8000 });
    return { provider: 'webhook', ok: true, mocked: false };
  } catch (err) {
    console.error('❌ autoShare webhook failed:', err.response?.data || err.message);
    return { provider: 'webhook', ok: false, mocked: false, error: err.message };
  }
};

const postToWhatsApp = async (payload) => {
  const { WHATSAPP_TOKEN, WHATSAPP_PHONE_ID } = process.env;
  if (!isLive() || !WHATSAPP_TOKEN || !WHATSAPP_PHONE_ID) return mockResult('whatsapp', payload);
  try {
    await axios.post(
      `https://graph.facebook.com/v21.0/${WHATSAPP_PHONE_ID}/messages`,
      { messaging_product: 'whatsapp', to: process.env.WHATSAPP_TO || '', type: 'text', text: { body: payload.text } },
      { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` }, timeout: 8000 }
    );
    return { provider: 'whatsapp', ok: true, mocked: false };
  } catch (err) {
    console.error('❌ autoShare whatsapp failed:', err.response?.data || err.message);
    return { provider: 'whatsapp', ok: false, mocked: false, error: err.message };
  }
};

const postToX = async (payload) => {
  if (!isLive() || !process.env.X_BEARER_TOKEN) return mockResult('x', payload);
  try {
    await axios.post(
      'https://api.twitter.com/2/tweets',
      { text: payload.text.slice(0, 280) },
      { headers: { Authorization: `Bearer ${process.env.X_BEARER_TOKEN}` }, timeout: 8000 }
    );
    return { provider: 'x', ok: true, mocked: false };
  } catch (err) {
    console.error('❌ autoShare x failed:', err.response?.data || err.message);
    return { provider: 'x', ok: false, mocked: false, error: err.message };
  }
};

const postToFacebook = async (payload) => {
  const { FACEBOOK_PAGE_TOKEN, FACEBOOK_PAGE_ID } = process.env;
  if (!isLive() || !FACEBOOK_PAGE_TOKEN || !FACEBOOK_PAGE_ID) return mockResult('facebook', payload);
  try {
    await axios.post(
      `https://graph.facebook.com/v21.0/${FACEBOOK_PAGE_ID}/feed`,
      { message: payload.text, link: payload.shareUrl },
      { timeout: 8000 }
    );
    return { provider: 'facebook', ok: true, mocked: false };
  } catch (err) {
    console.error('❌ autoShare facebook failed:', err.response?.data || err.message);
    return { provider: 'facebook', ok: false, mocked: false, error: err.message };
  }
};

const postToTelegram = async (payload) => {
  const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = process.env;
  if (!isLive() || !TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return mockResult('telegram', payload);
  try {
    await axios.post(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      { chat_id: TELEGRAM_CHAT_ID, text: payload.text },
      { timeout: 8000 }
    );
    return { provider: 'telegram', ok: true, mocked: false };
  } catch (err) {
    console.error('❌ autoShare telegram failed:', err.response?.data || err.message);
    return { provider: 'telegram', ok: false, mocked: false, error: err.message };
  }
};

// Fire-and-forget entry point — NEVER throws, NEVER blocks listing creation.
const notifyNewListing = async (listing, req) => {
  try {
    const payload = buildListingSharePayload(listing, req);
    const results = await Promise.all([
      postToWebhook(payload),
      postToWhatsApp(payload),
      postToX(payload),
      postToFacebook(payload),
      postToTelegram(payload),
    ]);
    return results;
  } catch (err) {
    console.error('❌ autoShare failed:', err.message);
    return [{ provider: 'all', ok: false, mocked: isAutoShareMocked(), error: err.message }];
  }
};

module.exports = {
  isAutoShareMocked,
  buildApiShareUrl,
  buildListingSharePayload,
  postToWebhook,
  postToWhatsApp,
  postToX,
  postToFacebook,
  postToTelegram,
  notifyNewListing,
};
