require('dotenv').config();
const express      = require('express');
const cors         = require('cors');
const compression  = require('compression');
const helmet       = require('helmet');
const { pool, initDB } = require('./config/db');
const { initRedis } = require('./config/redis');

// ── PROCESS-LEVEL SAFETY NET — a single stray async error must not kill the worker ──
// (Node crashes on unhandledRejection by default since v15 — this keeps the service up
//  on Render's single worker and, crucially, logs WHAT failed instead of dying silently.)
process.on('unhandledRejection', (reason) => {
  console.error('❌ Unhandled promise rejection:', reason instanceof Error ? reason.stack : reason);
});
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught exception — restarting:', err.stack || err.message);
  // The process state is undefined after an uncaught exception; exit cleanly and let Render restart.
  process.exit(1);
});

const authRoutes    = require('./routes/auth');
const agentRoutes   = require('./routes/agents');
const listingRoutes = require('./routes/listings');
const dealRoutes    = require('./routes/deals');
const adminRoutes   = require('./routes/admin');
const paymentRoutes = require('./routes/payments');
const messageRoutes = require('./routes/messages');
const reviewRoutes  = require('./routes/reviews');
const waitlistRoutes= require('./routes/waitlist');
const clientFunnelRoutes = require('./routes/clientFunnel');

const rateLimit = require('express-rate-limit');

// Global timeout for every outbound axios call (Paystack, Dojah, Nominatim) — axios is a
// shared singleton, so this covers all call sites. Without it a hung upstream ties up the
// single Render worker indefinitely. (The Gemini SDK is configured separately.)
require('axios').defaults.timeout = 15000;

const app  = express();
const PORT = process.env.PORT || 5000;

// ── TRUST RENDER'S PROXY — required so req.ip / X-Forwarded-For work for rate limiting ──
app.set('trust proxy', 1);

// ── JWT SECRET GUARD — refuse to start with a weak/default secret in ANY environment ──
// (Fatal everywhere: a known secret means anyone can forge an admin token, so it must never
//  be used even in dev. Set a strong random JWT_SECRET locally too.)
const WEAK_SECRETS = ['SouthSwift_JWT_SuperSecret_2026_ChangeInProduction', 'changeme', 'secret', 'jwt_secret'];
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32 || WEAK_SECRETS.includes(process.env.JWT_SECRET)) {
  console.error('❌ FATAL: JWT_SECRET is missing, too short (min 32 chars), or a known default. Set a strong random secret.');
  process.exit(1);
}

// ── CONFIG GUARD — surface missing config loudly at boot instead of failing mid-request ──
const REQUIRED_ENV = [
  'DATABASE_URL', 'PAYSTACK_SECRET_KEY', 'CLIENT_URL',
  'CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET',
  // Email now sends via Resend's HTTP API (see emailController.js) — EMAIL_USER is a
  // leftover from the old SMTP setup and no longer read anywhere. EMAIL_PASS is kept as
  // the required var since it doubles as the Resend API key (RESEND_API_KEY preferred
  // if set instead).
  'EMAIL_PASS',
];
const missingEnv = REQUIRED_ENV.filter(k => !process.env[k]);
if (missingEnv.length) {
  console.error(`⚠️  Missing environment variables: ${missingEnv.join(', ')} — dependent features will fail until set.`);
  // In production, missing DB/payment config is fatal — fail the deploy rather than serve broken money flows.
  const fatal = missingEnv.filter(k => ['DATABASE_URL', 'PAYSTACK_SECRET_KEY'].includes(k));
  if (process.env.NODE_ENV === 'production' && fatal.length) {
    console.error(`❌ FATAL: cannot run in production without ${fatal.join(', ')}.`);
    process.exit(1);
  }
}

// ── SECURITY & PERFORMANCE ────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      // Backend serves JSON only — the inline-script allowance was a leftover that
      // weakened CSP everywhere. Drop it.
      scriptSrc:  ["'self'"],
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
// Tighter bucket on bank-resolve specifically — a compromised agent could otherwise
// use it as a paid name-lookup service or burn Paystack quota.
app.use('/api/agents/resolve-account', rateLimit({ windowMs: 60 * 1000, max: 20, message: { error: 'Too many account lookups. Please wait a moment.' } }));
app.use('/api/agents/banks',           rateLimit({ windowMs: 60 * 1000, max: 30, message: { error: 'Too many requests.' } }));

// ── CORS ──────────────────────────────────────────────────────────────────────
const allowedOrigins = [
  'https://southswift.com.ng',
  'https://www.southswift.com.ng',
  'https://southswift.vercel.app',   // production Vercel domain
  process.env.CLIENT_URL,
  ...(process.env.EXTRA_CORS_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean),
].filter(Boolean);

// Vercel preview deployments of THIS project. VERCEL_TEAM_SLUG pins previews to your
// team — i.e. southswift-<hash>-<team>.vercel.app — so another Vercel account can't
// spin up a "southswift-*" project that satisfies CORS. The loose fallback used to
// be permissive enough that ANY user-created southswift-*.vercel.app project would
// pass; in production we now refuse to fall back. Auth is Bearer-token (not cookies)
// so the practical impact is limited to recon, but tightening is cheap.
const teamSlug = (process.env.VERCEL_TEAM_SLUG || '').replace(/[^a-z0-9-]/gi, '');
const previewRegex = teamSlug
  ? new RegExp(`^https:\\/\\/southswift-[a-z0-9-]+-${teamSlug}\\.vercel\\.app$`)
  : (process.env.NODE_ENV === 'production'
      ? null  // production with no team slug → disable preview match entirely (paste full URLs into EXTRA_CORS_ORIGINS if needed)
      : /^https:\/\/southswift-[a-z0-9]+(?:-[a-z0-9-]+)?\.vercel\.app$/);
if (process.env.NODE_ENV === 'production' && !teamSlug) {
  console.warn('⚠️  VERCEL_TEAM_SLUG not set — Vercel preview origins will be rejected by CORS. Set the env var to allow preview deploys.');
}

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    if (previewRegex && previewRegex.test(origin)) return callback(null, true);
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
app.use('/api/client-funnel', clientFunnelRoutes);

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
  await initRedis();
});
