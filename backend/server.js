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

const rateLimit = require('express-rate-limit');

const app  = express();
const PORT = process.env.PORT || 5000;

// ── JWT SECRET GUARD — refuse to start with weak/default secrets ────────────
const WEAK_SECRETS = ['SouthSwift_JWT_SuperSecret_2026_ChangeInProduction', 'changeme', 'secret', 'jwt_secret'];
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32 || WEAK_SECRETS.includes(process.env.JWT_SECRET)) {
  console.error('❌ FATAL: JWT_SECRET is missing, too short (min 32 chars), or a known default. Set a strong random secret.');
  if (process.env.NODE_ENV === 'production') process.exit(1);
}

// ── SECURITY & PERFORMANCE ────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'", "'unsafe-inline'"],
      styleSrc:   ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://unpkg.com"],
      imgSrc:     ["'self'", "data:", "https:", "blob:"],
      connectSrc: ["'self'", "https://api.paystack.co", "https://nominatim.openstreetmap.org", "https://*.tile.openstreetmap.org"],
      fontSrc:    ["'self'", "https://fonts.gstatic.com"],
      frameSrc:   ["'none'"],
      objectSrc:  ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));
app.use(compression());

// ── RATE LIMITING ─────────────────────────────────────────────────────────────
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 200, standardHeaders: true, legacyHeaders: false }));
app.use('/api/auth',     rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: { error: 'Too many attempts. Please try again later.' } }));
app.use('/api/waitlist',  rateLimit({ windowMs: 60 * 60 * 1000, max: 5, message: { error: 'Too many requests. Please try again later.' } }));
app.use('/api/payments', rateLimit({ windowMs: 15 * 60 * 1000, max: 30, message: { error: 'Too many payment requests.' } }));

// ── CORS ──────────────────────────────────────────────────────────────────────
const allowedOrigins = [
  'https://southswift.com.ng',
  'https://www.southswift.com.ng',
  process.env.CLIENT_URL,
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    // Allow Vercel preview deployments: must end with .vercel.app and contain 'southswift'
    if (/^https:\/\/southswift[a-z0-9-]*\.vercel\.app$/.test(origin)) return callback(null, true);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

// ── WEBHOOK ROUTE — must be mounted BEFORE express.json() so raw body is preserved for HMAC ──
app.use('/api/payments/webhook', require('./routes/webhookRoute'));

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
