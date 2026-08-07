const nodemailer = require('nodemailer');

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
    config.secure = true; // SSL/TLS for port 465
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
    const transporter = createTransporter();
    const emailTemplate = getOTPEmailTemplate(fullName, otpCode);
    
    const mailOptions = {
      from: `"Verify Your SouthSwift  Account" <${process.env.EMAIL_USER}>`,
      to: userEmail,
      subject: emailTemplate.subject,
      html: emailTemplate.html,
    };

    transporter.sendMail(mailOptions)
      .then(info => console.log(`✅ OTP email sent to ${userEmail}:`, info.messageId))
      .catch(error => console.error(`❌ Failed to send OTP email to ${userEmail}:`, error.message));
  });
  
  // Return immediately
  return { success: true };
};

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

module.exports = {
  sendWelcomeEmail,
  generateOTP,
  sendOTPEmail,
};