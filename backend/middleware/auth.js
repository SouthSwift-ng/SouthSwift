const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');

const protect = async (req, res, next) => {
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }
  if (!token) return res.status(401).json({ error: 'Not authorised — no token provided.' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    const result  = await pool.query('SELECT id, full_name, email, role, is_verified FROM users WHERE id = $1', [decoded.id]);
    if (!result.rows.length) return res.status(401).json({ error: 'User not found.' });
    req.user = result.rows[0];
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
};

const adminOnly = (req, res, next) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required.' });
  next();
};

const agentOnly = (req, res, next) => {
  if (!['agent','admin'].includes(req.user.role)) return res.status(403).json({ error: 'Agent access required.' });
  next();
};

module.exports = { protect, adminOnly, agentOnly };
