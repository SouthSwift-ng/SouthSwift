const nodemailer = require('nodemailer');

const emailHost = process.env.EMAIL_HOST || 'smtp.yandex.com';
const emailPort = parseInt(process.env.EMAIL_PORT) || 465;
// 465 = implicit TLS (secure:true) from the first byte. Any other port (587, 25) is
// STARTTLS — the connection starts plaintext and upgrades. secure:true on 587 sends a
// TLS ClientHello a plaintext-expecting server never replies to — the connection just
// hangs until it times out ("Connection timeout" with no other clue). requireTLS keeps
// the STARTTLS upgrade mandatory rather than optional.
const emailSecure = emailPort === 465;

const transporter = nodemailer.createTransport({
  host:   emailHost,
  port:   emailPort,
  secure: emailSecure,
  requireTLS: !emailSecure,
  family: 4, // Force IPv4 — Render has no outbound IPv6 route, so AAAA (e.g. Yandex) connections fail with ENETUNREACH
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  // nodemailer's defaults (2min connect, 10min socket) can hang a request WAY past
  // Express's 30s response timeout — a stuck SMTP handshake then looks like a generic
  // "Request timed out" with no indication email was the cause. Bound it tight so a
  // bad host/port/credential fails loud within a few seconds, in the logs.
  connectionTimeout: 8000,
  greetingTimeout:   8000,
  socketTimeout:     10000,
});

if (process.env.EMAIL_USER) {
  console.log(`📧 SMTP configured: ${emailHost}:${emailPort} (${emailSecure ? 'implicit TLS' : 'STARTTLS'}) as ${process.env.EMAIL_USER}`);
}

const sendEmail = async ({ to, subject, html, text }) => {
  try {
    await transporter.sendMail({
      from:    `"SouthSwift 🛡️" <${process.env.EMAIL_USER}>`,
      to, subject,
      html: html || `<p>${text}</p>`,
    });
    console.log(`✅ Email sent to ${to}`);
    return { ok: true };
  } catch (err) {
    console.error('❌ Email send error:', err.message);
    // Don't throw — email failure should not break the main flow — but report it
    // so callers can record the failure instead of it disappearing silently.
    return { ok: false, error: err.message };
  }
};

module.exports = { sendEmail };
