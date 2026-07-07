const axios = require('axios');

// Render's FREE-tier web services block outbound traffic on SMTP ports 25, 465, and
// 587 (confirmed via Render's own changelog/docs, effective 2025-09-26 —
// https://render.com/changelog/free-web-services-will-no-longer-allow-outbound-traffic-to-smtp-ports).
// Three different SMTP providers (Zoho on two ports, Resend's own SMTP relay) all hung
// identically in production — the port was blocked, not the destination. HTTPS (443) is
// never blocked, so we send through Resend's REST API instead of raw SMTP. This also
// means Render's plan tier no longer matters for email — no need to upgrade just to send.
//
// RESEND_API_KEY is preferred; falls back to EMAIL_PASS since that's the var already
// populated on Render from the earlier SMTP-relay setup (same value — Resend's SMTP
// relay password IS the API key), so this ships with zero required env var changes.
const RESEND_API_KEY = process.env.RESEND_API_KEY || process.env.EMAIL_PASS;
// Resend requires the sending domain to be verified, not a specific mailbox — any
// address @southswift.com.ng works once the domain itself is verified. Replies still
// land in the real inbox (Zoho), since Resend only handles sending, not receiving —
// MX/inbound routing is untouched.
const EMAIL_FROM = process.env.EMAIL_FROM || 'SouthSwift 🛡️ <support@southswift.com.ng>';

if (RESEND_API_KEY) {
  console.log(`📧 Email transport: Resend HTTP API — from ${EMAIL_FROM}`);
} else {
  console.warn('⚠️  Email not configured — set RESEND_API_KEY (or EMAIL_PASS) on Render.');
}

const sendEmail = async ({ to, subject, html, text }) => {
  if (!RESEND_API_KEY) {
    console.error('❌ Email send error: RESEND_API_KEY not configured');
    return { ok: false, error: 'Email not configured' };
  }
  try {
    await axios.post('https://api.resend.com/emails', {
      from:    EMAIL_FROM,
      to:      [to],
      subject,
      html:    html || `<p>${text}</p>`,
    }, {
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    });
    console.log(`✅ Email sent to ${to}`);
    return { ok: true };
  } catch (err) {
    // Resend returns a structured { message } on 4xx/5xx — surface that over the
    // generic axios error text so a bad API key or unverified domain is obvious.
    const msg = err.response?.data?.message || err.message;
    console.error('❌ Email send error:', msg);
    // Don't throw — email failure should not break the main flow — but report it
    // so callers can record the failure instead of it disappearing silently.
    return { ok: false, error: msg };
  }
};

module.exports = { sendEmail };
