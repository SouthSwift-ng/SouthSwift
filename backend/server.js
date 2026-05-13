require('dotenv').config();
const express      = require('express');
const cors         = require('cors');
const compression  = require('compression');
const helmet       = require('helmet');
const { pool, initDB } = require('./config/db');

const authRoutes    = require('./routes/auth');
const agentRoutes   = require('./routes/agents');
const listingRoutes = require('./routes/listings');
const dealRoutes    = require('./routes/deals');
const adminRoutes   = require('./routes/admin');
const paymentRoutes = require('./routes/payments');
const messageRoutes = require('./routes/messages');
const reviewRoutes  = require('./routes/reviews');
const waitlistRoutes= require('./routes/waitlist');

const app  = express();
const PORT = process.env.PORT || 5000;

// ── SECURITY & PERFORMANCE ────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false })); // security headers
app.use(compression());                             // gzip all responses

// ── CORS ──────────────────────────────────────────────────────────────────────
const allowedOrigins = [
  'https://southswift.com.ng',
  'https://www.southswift.com.ng',
  process.env.CLIENT_URL,
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (Postman, mobile apps, server-to-server)
    if (!origin) return callback(null, true);
    // Allow any vercel.app preview URL for this project
    if (origin.includes('southswift') || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── REQUEST TIMEOUT (30s) ─────────────────────────────────────────────────────
app.use((req, res, next) => {
  res.setTimeout(30000, () => {
    res.status(503).json({ error: 'Request timed out. Please try again.' });
  });
  next();
});

// ── HEALTH CHECK ─────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    message:  '🛡️ SouthSwift API is running',
    version:  '1.0.0',
    platform: "Nigeria's Verified Property Transaction Platform",
    status:   'healthy',
  });
});

// ── DB PING (keep Render free tier warm) ─────────────────────────────────────
app.get('/api/ping', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, ts: Date.now() });
  } catch (e) {
    res.status(500).json({ ok: false });
  }
});

// ── ROUTES ────────────────────────────────────────────────────────────────────
app.use('/api/auth',     authRoutes);
app.use('/api/agents',   agentRoutes);
app.use('/api/listings', listingRoutes);
app.use('/api/deals',    dealRoutes);
app.use('/api/admin',    adminRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/reviews',  reviewRoutes);
app.use('/api/waitlist', waitlistRoutes);

// ── 404 ────────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found.` });
});

// ── ERROR HANDLER ─────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('❌ Unhandled error:', err.message);
  res.status(500).json({ error: 'Something went wrong on SouthSwift servers.' });
});

// ── START ─────────────────────────────────────────────────────────────────────
app.listen(PORT, async () => {
  console.log(`🛡️  SouthSwift backend running on port ${PORT}`);
  await initDB();
});
