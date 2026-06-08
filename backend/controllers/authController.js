const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const { pool } = require('../config/db');

const generateToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '30d' });

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
      `INSERT INTO users (full_name, email, phone, password_hash, role, state, city)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, full_name, email, role, is_verified`,
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

    res.status(201).json({ user, token: generateToken(user.id) });
  } catch (err) {
    console.error(err.message); res.status(500).json({ error: 'Something went wrong. Please try again.' });
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

module.exports = { register, login, getMe, updateProfile };
