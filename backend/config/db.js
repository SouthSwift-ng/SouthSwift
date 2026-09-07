
require('dotenv').config();

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max:                     10,
  connectionTimeoutMillis: 10000, // fail fast instead of hanging the worker if the DB is unreachable
  idleTimeoutMillis:       30000,
});

(async () => {
  const res = await pool.query('SELECT NOW()');
  console.log(res.rows);
})();


// An idle client dropped by the DB (routine on Render/Supabase) emits 'error' on the pool;
// unhandled, that event crashes the whole process. Log and recover instead.
pool.on('error', (err) => {
  console.error('❌ Idle Postgres client error (recovered):', err.message);
});

// ── CREATE ALL TABLES ─────────────────────────────────────────────────────────
const buildInitSqlStatements = () => `

  -- USERS TABLE
  CREATE TABLE IF NOT EXISTS users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name     VARCHAR(255) NOT NULL,
    email         VARCHAR(255) UNIQUE NOT NULL,
    phone         VARCHAR(20) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role          VARCHAR(20) NOT NULL DEFAULT 'tenant'
                  CHECK (role IN ('tenant','landlord','agent','admin')),
    is_verified   BOOLEAN DEFAULT false,
    nin           VARCHAR(20),
    avatar_url    TEXT,
    state         VARCHAR(100),
    city          VARCHAR(100),
    created_at    TIMESTAMP DEFAULT NOW(),
    updated_at    TIMESTAMP DEFAULT NOW()
  );

  -- AGENT PROFILES TABLE
  CREATE TABLE IF NOT EXISTS agent_profiles (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id              UUID REFERENCES users(id) ON DELETE CASCADE,
    agency_name          VARCHAR(255),
    nin                  VARCHAR(20) NOT NULL,
    id_document_url      TEXT,
    selfie_url           TEXT,
    verification_status  VARCHAR(20) DEFAULT 'pending'
                         CHECK (verification_status IN ('pending','verified','rejected')),
    verified_at          TIMESTAMP,
    verified_by          UUID REFERENCES users(id),
    total_deals          INTEGER DEFAULT 0,
    rating               DECIMAL(3,2) DEFAULT 0.00,
    bio                  TEXT,
    created_at           TIMESTAMP DEFAULT NOW(),
    account_number       VARCHAR(20),
    bank_code            VARCHAR(10),
    account_name         VARCHAR(255),
    paystack_recipient_code VARCHAR(100),
    dojah_nin_match      BOOLEAN DEFAULT false,
    dojah_face_score     INTEGER DEFAULT 0,
    updated_at           TIMESTAMP DEFAULT NOW(),
    intro_video_url      TEXT
  );

  -- PROPERTY LISTINGS TABLE
  CREATE TABLE IF NOT EXISTS listings (
    id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id                   UUID REFERENCES users(id) ON DELETE CASCADE,
    title                      VARCHAR(255) NOT NULL,
    description                TEXT,
    property_type              VARCHAR(50) CHECK (property_type IN ('apartment','house','room','duplex','bungalow','studio')),
    bedrooms                   INTEGER DEFAULT 1,
    bathrooms                  INTEGER DEFAULT 1,
    rent_price                 BIGINT NOT NULL,
    rent_period                VARCHAR(20) DEFAULT 'yearly' CHECK (rent_period IN ('monthly','yearly')),
    address                    TEXT NOT NULL,
    city                       VARCHAR(100) NOT NULL,
    state                      VARCHAR(100) NOT NULL,
    latitude                   DECIMAL(10,8),
    longitude                  DECIMAL(11,8),
    is_swiftshield             BOOLEAN DEFAULT true,
    is_available               BOOLEAN DEFAULT true,
    images                     TEXT[],
    amenities                  TEXT[],
    created_at                 TIMESTAMP DEFAULT NOW(),
    updated_at                 TIMESTAMP DEFAULT NOW(),
    is_room_share              BOOLEAN DEFAULT false,
    room_share_price_per_person BIGINT,
    room_share_slots           INTEGER DEFAULT 1,
    room_share_slots_filled    INTEGER DEFAULT 0,
    videos                     TEXT[],
    agent_fee_percent          DECIMAL(5,2) NOT NULL DEFAULT 2.50,
    southswift_fee_percent     DECIMAL(5,2) NOT NULL DEFAULT 2.50,
    total_fee_percent          DECIMAL(5,2) NOT NULL DEFAULT 5.00
  );

  -- DEALS TABLE (SwiftShield Escrow Transactions)
  CREATE TABLE IF NOT EXISTS deals (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id              UUID REFERENCES listings(id),
    tenant_id               UUID REFERENCES users(id),
    agent_id                UUID REFERENCES users(id),
    landlord_id             UUID REFERENCES users(id),
    rent_amount             BIGINT NOT NULL,
    service_fee_tenant      BIGINT NOT NULL,
    service_fee_landlord    BIGINT NOT NULL,
    total_paid              BIGINT NOT NULL,
    agent_fee_percent       DECIMAL(5,2) NOT NULL DEFAULT 2.50,
    southswift_fee_percent  DECIMAL(5,2) NOT NULL DEFAULT 2.50,
    total_fee_percent       DECIMAL(5,2) NOT NULL DEFAULT 5.00,
    status                  VARCHAR(30) DEFAULT 'initiated'
                            CHECK (status IN (
                              'initiated','payment_pending','escrow_held',
                              'docs_generated','movein_pending','completed','disputed','cancelled','archived'
                            )),
    paystack_reference      VARCHAR(255),
    paystack_access_code    VARCHAR(255),
    swiftdoc_url            TEXT,
    swiftdoc_generated      BOOLEAN DEFAULT false,
    tenant_confirmed_at     TIMESTAMP,
    funds_released_at       TIMESTAMP,
    dispute_reason          TEXT,
    notes                   TEXT,
    move_in_date            DATE,
    lease_duration_months  INTEGER DEFAULT 12,
    created_at              TIMESTAMP DEFAULT NOW(),
    updated_at              TIMESTAMP DEFAULT NOW(),
    is_room_share_deal      BOOLEAN DEFAULT false,
    room_share_slot_number  INTEGER,
    cancellation_reason     TEXT,
    cancelled_by            UUID REFERENCES users(id),
    swiftdoc_error          TEXT,
    refunded_at             TIMESTAMP,
    swiftdoc_data           JSONB,
    payment_anomaly         TEXT
  );

  -- MESSAGES TABLE (SwiftConnect)
  CREATE TABLE IF NOT EXISTS messages (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deal_id     UUID REFERENCES deals(id),
    sender_id   UUID REFERENCES users(id),
    receiver_id UUID REFERENCES users(id),
    content     TEXT NOT NULL,
    is_read     BOOLEAN DEFAULT false,
    created_at  TIMESTAMP DEFAULT NOW()
  );

  -- NOTIFICATIONS TABLE
  CREATE TABLE IF NOT EXISTS notifications (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID REFERENCES users(id),
    title      VARCHAR(255) NOT NULL,
    body       TEXT NOT NULL,
    is_read    BOOLEAN DEFAULT false,
    type       VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW()
  );

  -- REVIEWS TABLE
  CREATE TABLE IF NOT EXISTS reviews (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deal_id     UUID REFERENCES deals(id),
    reviewer_id UUID REFERENCES users(id),
    agent_id    UUID REFERENCES users(id),
    rating      INTEGER CHECK (rating BETWEEN 1 AND 5),
    comment     TEXT,
    created_at  TIMESTAMP DEFAULT NOW()
  );

  -- WAITLIST TABLE
  CREATE TABLE IF NOT EXISTS waitlist (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email      VARCHAR(255) UNIQUE NOT NULL,
    phone      VARCHAR(20),
    role       VARCHAR(20) CHECK (role IN ('tenant','agent','landlord')),
    city       VARCHAR(100),
    state      VARCHAR(100),
    created_at TIMESTAMP DEFAULT NOW(),
    email_error TEXT
  );

  -- PAYMENT TRANSACTIONS (manual bank-transfer proof + admin approval/audit)
  CREATE TABLE IF NOT EXISTS payment_transactions (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deal_id                UUID REFERENCES deals(id) ON DELETE CASCADE,
    reference              VARCHAR(64) UNIQUE NOT NULL,
    tenant_id              UUID REFERENCES users(id),
    amount_expected_naira  BIGINT NOT NULL,
    amount_naira           BIGINT,
    payer_bank             VARCHAR(100),
    transfer_reference     VARCHAR(255),
    transfer_date          TIMESTAMP,
    receipt_url            TEXT,
    status                 VARCHAR(20) DEFAULT 'pending_review'
                           CHECK (status IN ('pending_review','approved','rejected','cancelled')),
    reviewed_by            UUID REFERENCES users(id),
    reviewed_at            TIMESTAMP,
    review_note            TEXT,
    receipt_sent_at        TIMESTAMP,
    created_at             TIMESTAMP DEFAULT NOW(),
    updated_at             TIMESTAMP DEFAULT NOW()
  );

  -- TRANSACTION AUDIT LOG (who did what, when — for every payment action)
  CREATE TABLE IF NOT EXISTS transaction_audit (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID REFERENCES payment_transactions(id) ON DELETE CASCADE,
    actor_id       UUID REFERENCES users(id),
    actor_role     VARCHAR(20),
    action         VARCHAR(30) NOT NULL
                     CHECK (action IN ('created','approved','rejected','receipt_sent','note','cancelled')),
    note           TEXT,
    created_at     TIMESTAMP DEFAULT NOW()
  );
`;

const initDB = async () => {
  if (!process.env.DATABASE_URL) {
    console.warn('⚠️  DATABASE_URL not configured. Skipping database initialization.');
    return;
  }
  const client = await pool.connect();
  try {
    await client.query(buildInitSqlStatements());

    // Create admin user if not exists — password MUST come from env var
    const bcrypt = require('bcryptjs');
    // const adminExists = await client.query(
    //   "SELECT id FROM users WHERE email = 'ceo@southswift.com.ng'"
    // );
    // if (adminExists.rows.length === 0) {
    //   const adminPassword = process.env.ADMIN_SEED_PASSWORD;
    //   if (!adminPassword || adminPassword.length < 12) {
    //     console.warn('⚠️  ADMIN_SEED_PASSWORD not set or too short (min 12 chars). Skipping admin seed.');
    //   } else {
    //     const hash = await bcrypt.hash(adminPassword, 12);
    //     await client.query(`
    //       INSERT INTO users (full_name, email, phone, password_hash, role, is_verified)
    //       VALUES ('Oladeji Ayeni Joshua', 'ceo@southswift.com.ng', '+2348168185692', $1, 'admin', true)
    //     `, [hash]);
    //     console.log('✅ Admin user created: ceo@southswift.com.ng');
    //   }
    // }

    // Add bank detail columns to agent_profiles if not exists
    await client.query(`
      ALTER TABLE agent_profiles
      ADD COLUMN IF NOT EXISTS account_number VARCHAR(20),
      ADD COLUMN IF NOT EXISTS bank_code      VARCHAR(10),
      ADD COLUMN IF NOT EXISTS account_name   VARCHAR(255),
      ADD COLUMN IF NOT EXISTS paystack_recipient_code VARCHAR(100),
      ADD COLUMN IF NOT EXISTS dojah_nin_match  BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS dojah_face_score INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS updated_at       TIMESTAMP DEFAULT NOW();
    `);

    // Add room share columns to listings if not exists
    await client.query(`
      ALTER TABLE listings
        ADD COLUMN IF NOT EXISTS is_room_share               BOOLEAN DEFAULT false,
        ADD COLUMN IF NOT EXISTS room_share_price_per_person BIGINT,
        ADD COLUMN IF NOT EXISTS room_share_slots            INTEGER DEFAULT 1,
        ADD COLUMN IF NOT EXISTS room_share_slots_filled     INTEGER DEFAULT 0;
    `);

    // Add video columns (listing tour videos + agent intro video)
    await client.query(`
      ALTER TABLE listings
        ADD COLUMN IF NOT EXISTS videos TEXT[];
    `);
    await client.query(`
      ALTER TABLE agent_profiles
        ADD COLUMN IF NOT EXISTS intro_video_url TEXT;
    `);

    // Add room share columns to deals if not exists
    await client.query(`
      ALTER TABLE deals
        ADD COLUMN IF NOT EXISTS is_room_share_deal    BOOLEAN DEFAULT false,
        ADD COLUMN IF NOT EXISTS room_share_slot_number INTEGER;
    `);

    // Add cancellation columns to deals if not exists
    await client.query(`
      ALTER TABLE deals
        ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
        ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES users(id);
    `);

    // Record SwiftDoc / email failure reasons instead of swallowing them silently,
    // and track refunds so the admin refund path stays idempotent.
    await client.query(`
      ALTER TABLE deals
        ADD COLUMN IF NOT EXISTS swiftdoc_error TEXT,
        ADD COLUMN IF NOT EXISTS refunded_at    TIMESTAMP;
    `);

    // Tenant info collected by the SwiftDoc wizard before payment (NIN, occupation,
    // employer, next of kin). Persisted so SwiftDoc generation can put real data on
    // the legally binding tenancy agreement instead of fabricating it.
    await client.query(`
      ALTER TABLE deals
        ADD COLUMN IF NOT EXISTS swiftdoc_data JSONB,
        ADD COLUMN IF NOT EXISTS payment_anomaly TEXT,
        ADD COLUMN IF NOT EXISTS payment_reference VARCHAR(255),
        ADD COLUMN IF NOT EXISTS payment_mode VARCHAR(20) DEFAULT 'manual'
          CHECK (payment_mode IN ('manual','paystack'));
    `);

    // Waitlist confirmation/admin-alert emails send in the background after the
    // signup response — mirrors the swiftdoc_error pattern so a systemic email
    // outage (bad API key, lapsed domain verification) is visible via a DB query
    // instead of only an ephemeral Render log line nobody's tailing.
    await client.query(`
      ALTER TABLE waitlist
        ADD COLUMN IF NOT EXISTS email_error TEXT;
    `);

    // ── FEE AUDIT COLUMNS (fixed 2.5% agent + 2.5% SouthSwift = 5% total) ──
    // Backend is the source of truth: percentages are written server-side on
    // upload and snapshotted onto deals. rent_price stays the base (e.g. 800k);
    // tenant total (e.g. 820k) is derived at read time, never stored on listings.
    await client.query(`
      ALTER TABLE listings
        ADD COLUMN IF NOT EXISTS agent_fee_percent      DECIMAL(5,2) DEFAULT 2.50,
        ADD COLUMN IF NOT EXISTS southswift_fee_percent DECIMAL(5,2) DEFAULT 2.50,
        ADD COLUMN IF NOT EXISTS total_fee_percent      DECIMAL(5,2) DEFAULT 5.00;
    `);
    await client.query(`
      ALTER TABLE deals
        ADD COLUMN IF NOT EXISTS agent_fee_percent      DECIMAL(5,2) DEFAULT 2.50,
        ADD COLUMN IF NOT EXISTS southswift_fee_percent DECIMAL(5,2) DEFAULT 2.50,
        ADD COLUMN IF NOT EXISTS total_fee_percent      DECIMAL(5,2) DEFAULT 5.00;
    `);

    // Backfill old rows that predate the columns (or were inserted as NULL).
    // Percents are audit labels only — safe on paid + unpaid rows alike.
    // Naira amounts are NEVER touched here (see repair block below).
    await client.query(`
      UPDATE listings SET
        agent_fee_percent      = COALESCE(agent_fee_percent, 2.50),
        southswift_fee_percent = COALESCE(southswift_fee_percent, 2.50),
        total_fee_percent      = COALESCE(total_fee_percent, 5.00)
      WHERE agent_fee_percent IS NULL
         OR southswift_fee_percent IS NULL
         OR total_fee_percent IS NULL;
    `);
    await client.query(`
      UPDATE deals SET
        agent_fee_percent      = COALESCE(agent_fee_percent, 2.50),
        southswift_fee_percent = COALESCE(southswift_fee_percent, 2.50),
        total_fee_percent      = COALESCE(total_fee_percent, 5.00)
      WHERE agent_fee_percent IS NULL
         OR southswift_fee_percent IS NULL
         OR total_fee_percent IS NULL;
    `);

    // Enforce the fixed policy going forward. Sum-check only (not per-side values)
    // so a future policy change is a single migration, not a rewrite.
    await client.query(`
      ALTER TABLE listings DROP CONSTRAINT IF EXISTS listings_fee_check;
      ALTER TABLE listings ADD CONSTRAINT listings_fee_check CHECK (
        agent_fee_percent + southswift_fee_percent = total_fee_percent
        AND total_fee_percent = 5.00
      );
    `);
    await client.query(`
      ALTER TABLE deals DROP CONSTRAINT IF EXISTS deals_fee_check;
      ALTER TABLE deals ADD CONSTRAINT deals_fee_check CHECK (
        agent_fee_percent + southswift_fee_percent = total_fee_percent
        AND total_fee_percent = 5.00
      );
    `);

    // Allow 'archived' status on existing databases (CHECK constraint predates it)
    await client.query(`
      ALTER TABLE deals DROP CONSTRAINT IF EXISTS deals_status_check;
      ALTER TABLE deals ADD CONSTRAINT deals_status_check CHECK (status IN (
        'initiated','payment_pending','escrow_held',
        'docs_generated','movein_pending','completed','disputed','cancelled','archived'
      ));
    `);

    // ── DATA REPAIR (idempotent, unpaid deals only — paid money is never touched) ──

    // Room share listings saved without a per-person price caused ₦0 deals —
    // backfill from an even split of the full rent
    await client.query(`
      UPDATE listings
      SET room_share_price_per_person = ROUND(rent_price::numeric / GREATEST(room_share_slots, 1))
      WHERE is_room_share = true
        AND (room_share_price_per_person IS NULL OR room_share_price_per_person <= 0)
        AND rent_price > 0;
    `);

    // Archive duplicate unpaid deals (keep the newest per listing + tenant),
    // releasing any room share slots the duplicates were holding
    await client.query(`
      WITH ranked AS (
        SELECT id, listing_id, is_room_share_deal,
               ROW_NUMBER() OVER (PARTITION BY listing_id, tenant_id ORDER BY created_at DESC) AS rn
        FROM deals
        WHERE status IN ('initiated','payment_pending')
      ), archived AS (
        UPDATE deals SET status='archived', updated_at=NOW()
        WHERE id IN (SELECT id FROM ranked WHERE rn > 1)
        RETURNING listing_id, is_room_share_deal
      )
      UPDATE listings l
      SET room_share_slots_filled = GREATEST(l.room_share_slots_filled - d.cnt, 0)
      FROM (
        SELECT listing_id, COUNT(*) AS cnt FROM archived
        WHERE is_room_share_deal = true GROUP BY listing_id
      ) d
      WHERE l.id = d.listing_id;
    `);

    // Archive unpaid ₦0 deals created before per-person pricing was enforced
    await client.query(`
      WITH archived AS (
        UPDATE deals SET status='archived', updated_at=NOW()
        WHERE status IN ('initiated','payment_pending') AND rent_amount <= 0
        RETURNING listing_id, is_room_share_deal
      )
      UPDATE listings l
      SET room_share_slots_filled = GREATEST(l.room_share_slots_filled - d.cnt, 0)
      FROM (
        SELECT listing_id, COUNT(*) AS cnt FROM archived
        WHERE is_room_share_deal = true GROUP BY listing_id
      ) d
      WHERE l.id = d.listing_id;
    `);

    // Repair totals saved by the old multiply-instead-of-add bug
    await client.query(`
      UPDATE deals
      SET total_paid = rent_amount + service_fee_tenant, updated_at=NOW()
      WHERE status IN ('initiated','payment_pending')
        AND total_paid <> rent_amount + service_fee_tenant;
    `);

    // Repair fee naira amounts drifted from the fixed 2.5% policy — unpaid only.
    // Paid escrow deals are report-only (never rewritten here).
    await client.query(`
      UPDATE deals
      SET service_fee_tenant   = ROUND(rent_amount::numeric * 0.025),
          service_fee_landlord = ROUND(rent_amount::numeric * 0.025),
          total_paid           = rent_amount + ROUND(rent_amount::numeric * 0.025),
          updated_at = NOW()
      WHERE status IN ('initiated','payment_pending')
        AND rent_amount > 0
        AND (service_fee_tenant <> ROUND(rent_amount::numeric * 0.025)
          OR service_fee_landlord <> ROUND(rent_amount::numeric * 0.025));
    `);

    // Enable RLS on all public tables — blocks direct PostgREST access;
    // the Express backend connects as postgres superuser and is unaffected.
    await client.query(`
      ALTER TABLE public.users              ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.listings           ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.deals              ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.messages           ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.notifications      ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.reviews            ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.agent_profiles     ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.waitlist           ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.otp_verifications  ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.transaction_audit    ENABLE ROW LEVEL SECURITY;
    `);

    // Create performance indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_users_email           ON users(email);
      CREATE INDEX IF NOT EXISTS idx_listings_agent_id     ON listings(agent_id);
      CREATE INDEX IF NOT EXISTS idx_listings_city_state   ON listings(city, state);
      CREATE INDEX IF NOT EXISTS idx_listings_available    ON listings(is_available);
      CREATE INDEX IF NOT EXISTS idx_deals_tenant_id       ON deals(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_deals_agent_id        ON deals(agent_id);
      CREATE INDEX IF NOT EXISTS idx_deals_status          ON deals(status);
      CREATE INDEX IF NOT EXISTS idx_messages_deal_id      ON messages(deal_id);
      CREATE INDEX IF NOT EXISTS idx_reviews_agent_id      ON reviews(agent_id);
      CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);

      -- Manual transfer / audit indexes
      CREATE INDEX IF NOT EXISTS idx_txn_deal      ON payment_transactions(deal_id);
      CREATE INDEX IF NOT EXISTS idx_txn_status    ON payment_transactions(status);
      CREATE INDEX IF NOT EXISTS idx_txn_reference ON payment_transactions(reference);
      CREATE INDEX IF NOT EXISTS idx_audit_txn     ON transaction_audit(transaction_id);

      -- Enforce at most ONE pending-review transaction per deal (duplicate-proof).
      CREATE UNIQUE INDEX IF NOT EXISTS uniq_pending_txn_per_deal
        ON payment_transactions(deal_id) WHERE status='pending_review';
    `);

    console.log('✅ All SouthSwift tables initialised');
  } catch (err) {
    console.error('❌ DB init error:', err.message);
  } finally {
    client.release();
  }
};

// Release listings reserved by a manual-transfer deal whose tenant never submitted
// proof within RESERVATION_TIMEOUT_HOURS. A reserved (is_available=false) listing that
// has NO deal in a "booked" state and only stale, proof-less payment_pending deals gets
// released back to available; stale deals are archived (and room-share slots freed).
// Idempotent and safe to run on an interval.
const releaseStaleReservations = async () => {
  if (!process.env.DATABASE_URL) return;
  const timeoutHours = parseInt(process.env.RESERVATION_TIMEOUT_HOURS, 10) || 24;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const archived = await client.query(`
      WITH stale AS (
        SELECT d.id, d.listing_id, d.is_room_share_deal
        FROM deals d
        WHERE d.status IN ('initiated','payment_pending')
          AND d.created_at < NOW() - ($1 || ' hours')::interval
          AND NOT EXISTS (
            SELECT 1 FROM payment_transactions t
            WHERE t.deal_id = d.id AND t.status IN ('pending_review','approved')
          )
          AND NOT EXISTS (
            SELECT 1 FROM deals d2
            WHERE d2.listing_id = d.listing_id
              AND d2.status IN ('escrow_held','docs_generated','movein_pending','completed','disputed')
          )
      ),
      archived_deals AS (
        UPDATE deals SET status='archived', updated_at=NOW()
        WHERE id IN (SELECT id FROM stale)
        RETURNING listing_id, is_room_share_deal
      )
      SELECT listing_id, is_room_share_deal, COUNT(*) AS cnt
      FROM archived_deals GROUP BY listing_id, is_room_share_deal
    `, [String(timeoutHours)]);

    for (const row of archived.rows) {
      if (row.is_room_share_deal) {
        await client.query(
          `UPDATE listings l
           SET room_share_slots_filled = GREATEST(l.room_share_slots_filled - $2, 0),
               is_available = (l.room_share_slots_filled - $2 < l.room_share_slots)
           WHERE id=$1`,
          [row.listing_id, Number(row.cnt)]
        );
      } else {
        await client.query(
          `UPDATE listings SET is_available=true WHERE id=$1
           AND NOT EXISTS (
             SELECT 1 FROM deals d
             WHERE d.listing_id=$1 AND d.status IN ('escrow_held','docs_generated','movein_pending','completed','disputed')
           )`,
          [row.listing_id]
        );
      }
    }
    await client.query('COMMIT');
    if (archived.rows.length) console.log(`♻️  Released ${archived.rows.length} stale reservation(s).`);
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    console.error('❌ releaseStaleReservations error:', err.message);
  } finally {
    client.release();
  }
};

module.exports = { pool, initDB, buildInitSqlStatements, releaseStaleReservations };
