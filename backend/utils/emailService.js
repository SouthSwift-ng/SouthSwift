const nodemailer = require('nodemailer');
const axios = require('axios');
const { escapeHtml } = require('./escapeHtml');

const RESEND_API_KEY = process.env.RESEND_API_KEY
const EMAIL_FROM = process.env.EMAIL_FROM || 'SouthSwift 🛡️ <support@southswift.com.ng>';
// Create transporter with flexible configuration
const createTransporter = () => {
  const config = {
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT) || 587,
    secure: false, // Default to false, will be set based on port
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  };

  // Auto-configure secure based on port
  if (config.port === 465) {
    // SSL/TLS for port 465
  } else if (config.port === 587) {
    config.secure = false; // STARTTLS for port 587
    config.requireTLS = true;
  }

  // Provider-specific configurations
  const emailHost = process.env.EMAIL_HOST?.toLowerCase();

  if (emailHost?.includes('yandex')) {
    // Yandex 360 configuration
    config.port = 465;
    config.secure = true;
  } else if (emailHost?.includes('gmail')) {
    // Gmail configuration
    config.port = 587;
    config.secure = false;
    config.requireTLS = true;
  } else if (emailHost?.includes('outlook') || emailHost?.includes('hotmail')) {
    // Outlook configuration
    config.port = 587;
    config.secure = false;
    config.requireTLS = true;
  }

  return nodemailer.createTransport(config);
};

// Welcome email template
const getWelcomeEmailTemplate = (fullName, userRole) => {
  const roleMessages = {
    tenant: 'Find your perfect home with verified listings and secure transactions.',
    landlord: 'List your properties and connect with verified tenants seamlessly.',
    agent: 'Grow your real estate business with our comprehensive platform tools.'
  };

  return {
    subject: 'Welcome to SouthSwift - Nigeria\'s Trusted Property Platform 🏠',
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Welcome to SouthSwift</title>
          <style>
            body { 
              font-family: Arial, sans-serif; 
              line-height: 1.6; 
              color: #333; 
              background-color: #F8FAF8; 
              margin: 0; 
              padding: 0; 
            }
            .container { 
              max-width: 600px; 
              margin: 0 auto; 
              background: white; 
              padding: 0; 
              border-radius: 10px; 
              box-shadow: 0 0 20px rgba(0,0,0,0.1); 
              overflow: hidden;
            }
            .header { 
              background: #1B4332; 
              color: white; 
              padding: 40px 30px; 
              text-align: center; 
            }
            .header h1 { 
              margin: 0; 
              font-size: 28px; 
              font-weight: 900; 
              font-family: Georgia, serif;
            }
            .header p {
              margin: 8px 0 0 0;
              opacity: 0.9;
              font-size: 14px;
            }
            .content { 
              padding: 40px 30px; 
            }
            .welcome-badge {
              background: #F8FAF8;
              border: 2px solid #1B4332;
              border-radius: 50px;
              padding: 15px 25px;
              display: inline-block;
              margin: 20px 0;
              color: #1B4332;
              font-weight: 700;
            }
            .features {
              background: #F8FAF8;
              padding: 25px;
              border-radius: 10px;
              margin: 25px 0;
              border-left: 4px solid #C8963C;
            }
            .features h3 {
              color: #1B4332;
              margin-top: 0;
              font-family: Georgia, serif;
              font-weight: 800;
            }
            .features ul {
              list-style: none;
              padding: 0;
            }
            .features li {
              padding: 8px 0;
              border-bottom: 1px solid #E5E7EB;
            }
            .features li:last-child {
              border-bottom: none;
            }
            .features li:before {
              content: '✓';
              color: #22C55E;
              font-weight: bold;
              margin-right: 10px;
            }
            .cta-button {
              display: inline-block;
              background: #C8963C;
              color: white;
              padding: 15px 30px;
              text-decoration: none;
              border-radius: 8px;
              font-weight: 700;
              margin: 20px 0;
              transition: transform 0.2s;
            }
            .cta-button:hover {
              transform: translateY(-2px);
              opacity: 0.9;
            }
            .security-highlight {
              background: white;
              border: 2px solid #1B4332;
              border-radius: 12px;
              padding: 20px;
              margin: 25px 0;
              text-align: center;
            }
            .security-highlight h4 {
              color: #1B4332;
              font-family: Georgia, serif;
              font-weight: 800;
              margin: 0 0 10px;
            }
            .footer {
              background: #F8FAF8;
              padding: 30px;
              text-align: center;
              color: #666;
              border-top: 1px solid #E5E7EB;
            }
            .social-links {
              margin: 20px 0;
            }
            .social-links a {
              color: #1B4332;
              text-decoration: none;
              margin: 0 10px;
              font-weight: 600;
            }
            .brand-logo {
              font-family: Georgia, serif;
              font-weight: 900;
              font-size: 18px;
            }
            h2 {
              font-family: Georgia, serif;
              font-weight: 800;
              color: #111;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1 class="brand-logo">SouthSwift</h1>
              <p>Nigeria's Verified Property Transaction Platform</p>
            </div>
            
            <div class="content">
              <h2>Hello ${fullName}! 👋</h2>
              
              <div class="welcome-badge">
                Welcome as a ${userRole.charAt(0).toUpperCase() + userRole.slice(1)} ✨
              </div>
              
              <p>We're thrilled to have you join the SouthSwift community! You've taken the first step towards secure, transparent, and efficient property transactions in Nigeria.</p>
              
              <p><strong>${roleMessages[userRole]}</strong></p>
              
              <div class="security-highlight">
                <h4>🛡️ SwiftShield Escrow Protection</h4>
                <p style="margin: 0; font-size: 14px;">Your money is protected until you confirm move-in. Not a single naira reaches the agent until you're satisfied.</p>
              </div>
              
              <div class="features">
                <h3>What makes SouthSwift special:</h3>
                <ul>
                  <li>🔒 SwiftShield escrow payment protection</li>
                  <li>✅ Verified agents with identity checks</li>
                  <li>📋 AI-powered SwiftDoc tenancy agreements</li>
                  <li>💳 Same-day bank transfers for agents</li>
                  <li>📱 Mobile-first Nigerian experience</li>
                  <li>⚖️ In-app legal support and review</li>
                </ul>
              </div>
              
              <p>Ready to get started? Head to your dashboard to complete your profile and explore verified listings in your area.</p>
              
              <div style="text-align: center;">
                <a href="${process.env.CLIENT_URL}/dashboard" class="cta-button">
                  Go to Dashboard →
                </a>
              </div>
              
              <p><strong>Need help?</strong> Our support team is here for you. Simply reply to this email or reach us at <a href="mailto:ceo@southswift.com.ng" style="color: #1B4332;">ceo@southswift.com.ng</a></p>
              
              <p>Welcome to the future of Nigerian real estate! 🚀</p>
              
              <p>Best regards,<br>
              <strong>The SouthSwift Team</strong><br>
              <em style="color: #C8963C;">Building trust in every transaction</em></p>
            </div>
            
            <div class="footer">
              <div class="social-links">
                <a href="https://southswift.com.ng">Visit our website</a> | 
                <a href="mailto:ceo@southswift.com.ng">Contact support</a> | 
                <a href="tel:+2348168185692">+234 816 818 5692</a>
              </div>
              <p><strong class="brand-logo">SouthSwift</strong> Enterprise Limited<br>
              <span style="font-size: 12px; color: #999;">CAC BN 7310264 • Lagos, Nigeria</span></p>
              <p style="font-size: 12px; color: #999; margin-top: 16px;">
                This email was sent to ${fullName}. If you didn't create an account with us, please ignore this email.
              </p>
            </div>
          </div>
        </body>
      </html>
    `
  };
};



// Generate 6-digit OTP
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// OTP email template
const getOTPEmailTemplate = (fullName, otpCode) => {
  return {
    subject: 'Verify your SouthSwift account - OTP Code ',
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Verify Your SouthSwift Account</title>
          <style>
            body { 
              font-family: Arial, sans-serif; 
              line-height: 1.6; 
              color: #333; 
              background-color: #F8FAF8; 
              margin: 0; 
              padding: 0; 
            }
            .container { 
              max-width: 600px; 
              margin: 0 auto; 
              background: white; 
              padding: 0; 
              border-radius: 10px; 
              box-shadow: 0 0 20px rgba(0,0,0,0.1); 
              overflow: hidden;
            }
            .header { 
              background: #1B4332; 
              color: white; 
              padding: 40px 30px; 
              text-align: center; 
            }
            .header h1 { 
              margin: 0; 
              font-size: 24px; 
              font-weight: 900; 
              font-family: Georgia, serif;
            }
            .content { 
              padding: 40px 30px; 
              text-align: center;
            }
            .otp-box {
              background: #F8FAF8;
              border: 3px solid #1B4332;
              border-radius: 12px;
              padding: 30px;
              margin: 30px 0;
              font-size: 36px;
              font-weight: 900;
              color: #1B4332;
              letter-spacing: 8px;
              font-family: 'Courier New', monospace;
            }
            .warning-box {
              background: #FEF3C7;
              border-left: 4px solid #F59E0B;
              padding: 16px;
              margin: 25px 0;
              border-radius: 8px;
              text-align: left;
            }
            .security-tips {
              background: #F8FAF8;
              padding: 20px;
              border-radius: 10px;
              margin: 25px 0;
              text-align: left;
            }
            .security-tips h4 {
              color: #1B4332;
              margin-top: 0;
              font-weight: 800;
            }
            .security-tips ul {
              margin: 0;
              padding-left: 20px;
            }
            .security-tips li {
              margin: 8px 0;
              font-size: 14px;
            }
            .footer {
              background: #F8FAF8;
              padding: 30px;
              text-align: center;
              color: #666;
              border-top: 1px solid #E5E7EB;
              font-size: 14px;
            }
            .brand-logo {
              font-family: Georgia, serif;
              font-weight: 900;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1 class="brand-logo"> Verify Your Account</h1>
            </div>
            
            <div class="content">
              <h2 style="color: #1B4332; font-family: Georgia, serif; font-weight: 800;">Hello ${fullName}!</h2>
              
              <p>Welcome to SouthSwift! To complete your registration and secure your account, please use the verification code below:</p>
              
              <div class="otp-box">
                ${otpCode}
              </div>
              
              <div class="warning-box">
                <strong> This code expires in 10 minutes</strong><br>
                If you didn't request this code, please ignore this email.
              </div>
              
              <p>Enter this code on the verification page to activate your account and start exploring verified properties in Nigeria.</p>
              
              <div class="security-tips">
                <h4> Security Tips:</h4>
                <ul>
                  <li>Never share this code with anyone</li>
                  <li>SouthSwift will never ask for your verification code via phone</li>
                  <li>This code can only be used once</li>
                  <li>Report suspicious emails to our security team</li>
                </ul>
              </div>
              
              <p style="margin-top: 30px;">Need help? Contact our support team at <a href="mailto:ceo@southswift.com.ng" style="color: #1B4332; font-weight: 600;">ceo@southswift.com.ng</a></p>
            </div>
            
            <div class="footer">
              <p><strong class="brand-logo">SouthSwift</strong> Enterprise Limited<br>
              <span style="color: #999;">Nigeria's Verified Property Transaction Platform</span></p>
              <p style="font-size: 12px; color: #999; margin-top: 16px;">
                This verification email was sent to ${fullName}. If you didn't create an account with SouthSwift, please ignore this email.
              </p>
            </div>
          </div>
        </body>
      </html>
    `
  };
};

// Send OTP email (non-blocking)
const sendOTPEmail = (userEmail, fullName, otpCode) => {
  // Fire and forget - completely non-blocking
  setImmediate(() => {
    const emailTemplate = getOTPEmailTemplate(fullName, otpCode);

    const mailOptions = {
      from: `"Verify Your SouthSwift  Account" <${process.env.EMAIL_USER}>`,
      to: userEmail,
      subject: emailTemplate.subject,
      html: emailTemplate.html,
    };

    handleEmail(mailOptions)

    // Return immediately
    return { success: true };
  })
}

// Send welcome email (non-blocking)
const sendWelcomeEmail = (userEmail, fullName, userRole) => {
  setImmediate(() => {
    const transporter = createTransporter();
    const emailTemplate = getWelcomeEmailTemplate(fullName, userRole);

    const mailOptions = {
      from: `"SouthSwift Team" <${process.env.EMAIL_USER}>`,
      to: userEmail,
      subject: emailTemplate.subject,
      html: emailTemplate.html,
    };

    transporter.sendMail(mailOptions)
      .then(info => console.log(`✅ Welcome email sent to ${userEmail}:`, info.messageId))
      .catch(error => console.error(`❌ Failed to send welcome email to ${userEmail}:`, error.message));
  });
};
const handleEmail = ({ to, subject, html, from }) => {
  setImmediate(() => {
    const transporter = createTransporter();

    const mailOptions = {
      from: from || `"SouthSwift Team" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html
    };
    RESEND_API_KEY ? sendWithResend(mailOptions) :
      transporter.sendMail(mailOptions)
        .then(info => console.log(`Email sent to ${to}:`, info.messageId))
        .catch(error => console.error(` Failed to send  email to ${to}:`, error.message));
  });
};

const sendWithResend = async ({ to, subject, html, text, from }) => {
  if (!RESEND_API_KEY) {
    console.error('❌ Email send error: RESEND_API_KEY not configured');
    return { ok: false, error: 'Email not configured' };
  }
  if (!html && !text) {
    // Every current call site always passes html — this guards a future caller that
    // forgets to, which previously rendered the literal string "<p>undefined</p>" as
    // the entire email body and reported success.
    console.error('❌ Email send error: no html or text content provided');
    return { ok: false, error: 'No email content provided' };
  }
  try {
    await axios.post('https://api.resend.com/emails', {
      from: from || EMAIL_FROM,
      to: [to],
      subject,
      html: html || `<p>${text}</p>`,
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

// ── REFERRAL & WITHDRAWAL EMAILS ─────────────────────────────────────────────
const naira = (value) => `\u20A6${Number(value || 0).toLocaleString('en-NG')}`;

const simpleEmailShell = (title, body) => `
  <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#333">
    <div style="background:#1B4332;color:#fff;padding:28px 24px;text-align:center;border-radius:10px 10px 0 0">
      <div style="font-family:Georgia,serif;font-size:22px;font-weight:900">SouthSwift</div>
      <div style="font-size:12px;opacity:.8;margin-top:4px">Trust infrastructure for Nigerian real estate</div>
    </div>
    <div style="border:1px solid #E5E7EB;border-top:none;padding:28px 24px;border-radius:0 0 10px 10px">
      <h2 style="color:#1B4332;font-family:Georgia,serif;margin-top:0">${title}</h2>
      ${body}
      <p style="font-size:12px;color:#888;margin-top:28px;border-top:1px solid #E5E7EB;padding-top:14px">
        SouthSwift Enterprise · CAC BN 7310264 · southswift.com.ng
      </p>
    </div>
  </div>
`;

// To the referrer when someone registers with their code.
const sendReferralSignupEmail = (referrerEmail, referrerName, referredName) => {
  if (!referrerEmail) return;
  handleEmail({
    to: referrerEmail,
    subject: 'Someone joined SouthSwift with your referral code',
    html: simpleEmailShell(
      `Hello ${escapeHtml(referrerName || 'there')},`,
      `<p><strong>${escapeHtml(referredName || 'A new user')}</strong> just joined SouthSwift using your referral code.</p>
       <p>You will earn <strong>${naira(process.env.REFERRAL_REWARD_NGN || 1000)}</strong> once they complete a rental and confirm move-in.</p>`
    ),
  });
};

// To the referrer when a completed rental credits their balance.
const sendReferralRewardEmail = (referrerEmail, referrerName, referredName, listingTitle, newBalance) => {
  if (!referrerEmail) return;
  handleEmail({
    to: referrerEmail,
    subject: `You earned ${naira(process.env.REFERRAL_REWARD_NGN || 1000)} on SouthSwift`,
    html: simpleEmailShell(
      `Well done, ${escapeHtml(referrerName || 'there')}!`,
      `<p><strong>${escapeHtml(referredName || 'Your referral')}</strong> completed a rental${listingTitle ? ` at <strong>${escapeHtml(listingTitle)}</strong>` : ''
      }.</p>
       <p>Your referral reward has been credited. New available balance: <strong>${naira(newBalance)}</strong>.</p>
       <p>You can request a withdrawal from your SouthSwift dashboard.</p>`
    ),
  });
};

// To the user with the withdrawal OTP.
const sendWithdrawalOtpEmail = (userEmail, fullName, otpCode, amount, maskedAccount) => {
  if (!userEmail) return;
  handleEmail({
    to: userEmail,
    subject: 'Your SouthSwift withdrawal verification code',
    html: simpleEmailShell(
      'Confirm your withdrawal',
      `<p>Hello ${escapeHtml(fullName || 'there')},</p>
       <p>Use the code below to confirm your withdrawal of <strong>${naira(amount)}</strong>${maskedAccount ? ` to <strong>${escapeHtml(maskedAccount)}</strong>` : ''
      }.</p>
       <div style="background:#F8FAF8;border:2px solid #1B4332;border-radius:10px;padding:22px;text-align:center;
                   font-family:'Courier New',monospace;font-size:32px;font-weight:900;letter-spacing:8px;color:#1B4332;margin:20px 0">
         ${escapeHtml(otpCode)}
       </div>
       <p style="font-size:13px;color:#666">This code expires in 10 minutes. If you did not request a withdrawal, ignore this email and contact support immediately.</p>`
    ),
  });
};

// To the user when a withdrawal is submitted or its status changes.
const sendWithdrawalStatusEmail = (userEmail, fullName, status, amount, accountName, note) => {
  if (!userEmail) return;
  const titles = {
    submitted: 'Withdrawal request received',
    approved: 'Withdrawal approved',
    rejected: 'Withdrawal request rejected',
    paid: 'Withdrawal paid',
  };
  const messages = {
    submitted: 'Your withdrawal request has been sent to the SouthSwift team for review.',
    approved: 'Your withdrawal has been approved and is being processed.',
    rejected: 'Your withdrawal request was rejected. The funds remain available in your SouthSwift balance.',
    paid: 'Your withdrawal has been paid to your bank account.',
  };
  handleEmail({
    to: userEmail,
    subject: `SouthSwift — ${titles[status] || 'Withdrawal update'}`,
    html: simpleEmailShell(
      titles[status] || 'Withdrawal update',
      `<p>Hello ${escapeHtml(fullName || 'there')},</p>
       <p>${messages[status] || 'Your withdrawal status has changed.'}</p>
       <p><strong>Amount:</strong> ${naira(amount)}${accountName ? `<br><strong>Account:</strong> ${escapeHtml(accountName)}` : ''
      }</p>
       ${note ? `<p><strong>Admin note:</strong> ${escapeHtml(note)}</p>` : ''}`
    ),
  });
};

module.exports = {
  sendWelcomeEmail,
  generateOTP,
  sendOTPEmail,
  handleEmail,
  sendReferralSignupEmail,
  sendReferralRewardEmail,
  sendWithdrawalOtpEmail,
  sendWithdrawalStatusEmail,
};