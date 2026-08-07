const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const { pool } = require('../config/db');
const { sendWelcomeEmail, generateOTP, sendOTPEmail } = require('../utils/emailService');
const { redis } = require('../config/redis');

const generateToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '30d' });

// Generate a fresh OTP, store it, reset attempts, set the 5-min cooldown, and email it
const issueOTP = async (email, userId, fullName) => {
  const otpCode = generateOTP();
  const otpKey = `otp:${email}`;
  const attemptsKey = `otp_attempts:${email}`;

  // Store OTP with 10 minute expiry
  await redis.setEx(otpKey, 600, JSON.stringify({
    otp: otpCode,
    userId,
    email,
    fullName,
    attempts: 0,
    createdAt: new Date().toISOString()
  }));

  // Reset attempts counter
  await redis.del(attemptsKey);

  // Set 5-minute cooldown for resend
  await redis.setEx(`otp_cooldown:${email}`, 300, '1');

  // Send OTP email (non-blocking)
  sendOTPEmail(email, fullName, otpCode);
};

// POST /api/auth/register
const register = async (req, res) => {
  const { full_name, email, phone, password, role, state, city } = req.body;

  if (!full_name || !email || !phone || !password)
    return res.status(400).json({ error: 'All fields are required.' });

  if (password.length < 8)
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });

  const allowedRoles = ['tenant','landlord','agent'];
  const userRole = allowedRoles.includes(role) ? role : 'tenant';

  try {
    const exists = await pool.query('SELECT id FROM users WHERE email=$1 OR phone=$2', [email, phone]);
    if (exists.rows.length) return res.status(400).json({ error: 'Registration failed. Please check your details or try logging in.' });

    const hash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      `INSERT INTO users (full_name, email, phone, password_hash, role, state, city, is_verified)
       VALUES ($1,$2,$3,$4,$5,$6,$7,false) RETURNING id, full_name, email, role, is_verified`,
      [full_name, email, phone, hash, userRole, state||null, city||null]
    );

    const user = result.rows[0];

    // If agent, create agent profile
    if (userRole === 'agent') {
      await pool.query(
        'INSERT INTO agent_profiles (user_id, nin) VALUES ($1, $2)',
        [user.id, req.body.nin || 'PENDING']
      );
    }

    // Generate and store OTP in Redis
    await issueOTP(email, user.id, full_name);

    res.status(201).json({ 
      message: 'Account created successfully. Please check your email for verification code.',
      user: { 
        id: user.id, 
        full_name: user.full_name, 
        email: user.email, 
        role: user.role,
        is_verified: false 
      },
      requiresVerification: true
    });

  } catch (err) {
    console.error(err.message); 
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}; 
   

// POST /api/auth/login
const login = async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required.' });

  try {
    const result = await pool.query('SELECT * FROM users WHERE email=$1', [email]);
    // Constant-time: always run bcrypt even if user not found (prevents timing oracle)
    const dummyHash = '$2a$12$000000000000000000000u2jCmrIRyBhNJLGHOb3DOiGH0FD2TFVC';
    const user = result.rows[0];
    const match = await bcrypt.compare(password, user ? user.password_hash : dummyHash);
    
    if (!user || !match) return res.status(401).json({ error: 'Invalid credentials.' });

    // Check if user is verified
    if (!user.is_verified) {
      const cooldownKey = `otp_cooldown:${email}`;
      const cooldownSeconds = await redis.ttl(cooldownKey);
      let codeSent = false;

      // Cooldown expired — send a fresh verification code
      if (cooldownSeconds <= 0) {
        await issueOTP(email, user.id, user.full_name);
        codeSent = true;
      }

      return res.status(403).json({ 
        error: codeSent
          ? 'A new verification code has been sent to your email.'
          : 'Please verify your email address before logging in.',
        requiresVerification: true,
        email: user.email,
        codeSent,
        cooldownSeconds: codeSent ? 300 : cooldownSeconds
      });
    }

    const { password_hash, ...safeUser } = user;
    res.json({ user: safeUser, token: generateToken(user.id) });
  } catch (err) {
    console.error(err.message); res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
};

// GET /api/auth/me
const getMe = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.full_name, u.email, u.phone, u.role, u.is_verified,
              u.state, u.city, u.avatar_url, u.created_at,
              ap.verification_status, ap.agency_name, ap.total_deals, ap.rating
       FROM users u
       LEFT JOIN agent_profiles ap ON ap.user_id = u.id
       WHERE u.id = $1`,
      [req.user.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err.message); res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
};

// PUT /api/auth/profile
const updateProfile = async (req, res) => {
  const { full_name, phone, state, city, nin } = req.body;
  try {
    await pool.query(
      `UPDATE users SET full_name=COALESCE($1,full_name),
       phone=COALESCE($2,phone), state=COALESCE($3,state),
       city=COALESCE($4,city), nin=COALESCE($5,nin), updated_at=NOW()
       WHERE id=$6`,
      [full_name, phone, state, city, nin, req.user.id]
    );
    res.json({ message: 'Profile updated successfully.' });
  } catch (err) {
    console.error(err.message); res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
};

// POST /api/auth/verify-otp
const verifyOTP = async (req, res) => {
  const { email, otp_code } = req.body;

  if (!email || !otp_code) {
    return res.status(400).json({ error: 'Email and OTP code are required.' });
  }

  try {
    const otpKey = `otp:${email}`;
    const attemptsKey = `otp_attempts:${email}`;

    // Get OTP data from Redis
    const otpData = await redis.get(otpKey);
    
    if (!otpData) {
      return res.status(400).json({ error: 'Invalid or expired verification code.' });
    }

    const { otp, userId, attempts } = JSON.parse(otpData);

    // Check attempts (max 5)
    const currentAttempts = parseInt(await redis.get(attemptsKey) || '0');
    if (currentAttempts >= 5) {
      await redis.del(otpKey); // Clear the OTP
      return res.status(429).json({ error: 'Too many failed attempts. Please request a new verification code.' });
    }

    // Verify OTP code
    if (otp !== otp_code) {
      // Increment attempts
      await redis.setEx(attemptsKey, 600, (currentAttempts + 1).toString());
      return res.status(400).json({ error: 'Invalid verification code.' });
    }

    // OTP is valid, update user
    await pool.query(
      'UPDATE users SET is_verified = true, updated_at = NOW() WHERE id = $1',
      [userId]
    );

    // Clean up Redis keys
    await redis.del(otpKey);
    await redis.del(attemptsKey);

    // Get updated user data
    const userResult = await pool.query(
      'SELECT id, full_name, email, role, is_verified FROM users WHERE id = $1',
      [userId]
    );

    const user = userResult.rows[0];

    // Send welcome email now that user is verified (non-blocking)
    sendWelcomeEmail(user.email, user.full_name, user.role);

    res.json({ 
      message: 'Email verified successfully! Welcome to SouthSwift.',
      user,
      token: generateToken(user.id)
    });

  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
};

// POST /api/auth/resend-otp
const resendOTP = async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email is required.' });
  }

  try {
    // Check if user exists and is not verified
    const userResult = await pool.query(
      'SELECT id, full_name, is_verified FROM users WHERE email = $1',
      [email]
    );

    if (userResult.rows.length === 0) {
      return res.status(400).json({ error: 'No account found with this email.' });
    }

    const user = userResult.rows[0];

    if (user.is_verified) {
      return res.status(400).json({ error: 'This account is already verified.' });
    }

    // Check cooldown period (5 minutes)
    const cooldownKey = `otp_cooldown:${email}`;
    const cooldownExists = await redis.exists(cooldownKey);
    
    if (cooldownExists) {
      return res.status(429).json({ error: 'Please wait 5 minutes before requesting a new code.' });
    }

    // Generate and send a fresh OTP
    await issueOTP(email, user.id, user.full_name);

    res.json({ message: 'New verification code sent to your email.' });

  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
};

module.exports = { register, login, getMe, updateProfile, verifyOTP, resendOTP };
