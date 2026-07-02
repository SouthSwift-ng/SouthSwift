const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host:   process.env.EMAIL_HOST || 'smtp.yandex.com',
  port:   parseInt(process.env.EMAIL_PORT) || 465,
  secure: true,
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
