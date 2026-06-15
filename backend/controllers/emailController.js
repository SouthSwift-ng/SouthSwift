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
