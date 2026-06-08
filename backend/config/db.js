const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// ── CREATE ALL TABLES ─────────────────────────────────────────────────────────
const initDB = async () => {
  if (!process.env.DATABASE_URL) {
    console.warn('⚠️  DATABASE_URL not configured. Skipping database initialization.');
    return;
  }
  const client = await pool.connect();
  try {
    await client.query(`

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
        id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id            UUID REFERENCES users(id) ON DELETE CASCADE,
        agency_name        VARCHAR(255),
        nin                VARCHAR(20) NOT NULL,
        id_document_url    TEXT,
        selfie_url         TEXT,
        verification_status VARCHAR(20) DEFAULT 'pending'
                            CHECK (verification_status IN ('pending','verified','rejected')),
        verified_at        TIMESTAMP,
        verified_by        UUID REFERENCES users(id),
        total_deals        INTEGER DEFAULT 0,
        rating             DECIMAL(3,2) DEFAULT 0.00,
        bio                TEXT,
        created_at         TIMESTAMP DEFAULT NOW()
      );

      -- PROPERTY LISTINGS TABLE
      CREATE TABLE IF NOT EXISTS listings (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        agent_id        UUID REFERENCES users(id) ON DELETE CASCADE,
        title           VARCHAR(255) NOT NULL,
        description     TEXT,
        property_type   VARCHAR(50) CHECK (property_type IN ('apartment','house','room','duplex','bungalow','studio')),
        bedrooms        INTEGER DEFAULT 1,
        bathrooms       INTEGER DEFAULT 1,
        rent_price      BIGINT NOT NULL,
        rent_period     VARCHAR(20) DEFAULT 'yearly' CHECK (rent_period IN ('monthly','yearly')),
        address         TEXT NOT NULL,
        city            VARCHAR(100) NOT NULL,
        state           VARCHAR(100) NOT NULL,
        latitude        DECIMAL(10,8),
        longitude       DECIMAL(11,8),
        is_swiftshield  BOOLEAN DEFAULT true,
        is_available    BOOLEAN DEFAULT true,
        images          TEXT[],
        amenities       TEXT[],
        created_at      TIMESTAMP DEFAULT NOW(),
        updated_at      TIMESTAMP DEFAULT NOW()
      );

      -- DEALS TABLE (SwiftShield Escrow Transactions)
      CREATE TABLE IF NOT EXISTS deals (
        id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        listing_id        UUID REFERENCES listings(id),
        tenant_id         UUID REFERENCES users(id),
        agent_id          UUID REFERENCES users(id),
        landlord_id       UUID REFERENCES users(id),
        rent_amount       BIGINT NOT NULL,
        service_fee_tenant    BIGINT NOT NULL,
        service_fee_landlord  BIGINT NOT NULL,
        total_paid        BIGINT NOT NULL,
        status            VARCHAR(30) DEFAULT 'initiated'
                          CHECK (status IN (
                            'initiated','payment_pending','escrow_held',
                            'docs_generated','movein_pending','completed','disputed','cancelled'
                          )),
        paystack_reference    VARCHAR(255),
        paystack_access_code  VARCHAR(255),
        swiftdoc_url          TEXT,
        swiftdoc_generated    BOOLEAN DEFAULT false,
        tenant_confirmed_at   TIMESTAMP,
        funds_released_at     TIMESTAMP,
        dispute_reason        TEXT,
        notes                 TEXT,
        move_in_date          DATE,
        lease_duration_months INTEGER DEFAULT 12,
        created_at            TIMESTAMP DEFAULT NOW(),
        updated_at            TIMESTAMP DEFAULT NOW()
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
        created_at TIMESTAMP DEFAULT NOW()
      );

    `);

    // Create admin user if not exists — password MUST come from env var
    const bcrypt = require('bcryptjs');
    const adminExists = await client.query(
      "SELECT id FROM users WHERE email = 'ceo@southswift.com.ng'"
    );
    if (adminExists.rows.length === 0) {
      const adminPassword = process.env.ADMIN_SEED_PASSWORD;
      if (!adminPassword || adminPassword.length < 12) {
        console.warn('⚠️  ADMIN_SEED_PASSWORD not set or too short (min 12 chars). Skipping admin seed.');
      } else {
        const hash = await bcrypt.hash(adminPassword, 12);
        await client.query(`
          INSERT INTO users (full_name, email, phone, password_hash, role, is_verified)
          VALUES ('Oladeji Ayeni Joshua', 'ceo@southswift.com.ng', '+2348168185692', $1, 'admin', true)
        `, [hash]);
        console.log('✅ Admin user created: ceo@southswift.com.ng');
      }
    }

    // Add bank detail columns to agent_profiles if not exists
    await client.query(`
      ALTER TABLE agent_profiles
      ADD COLUMN IF NOT EXISTS account_number VARCHAR(20),
      ADD COLUMN IF NOT EXISTS bank_code      VARCHAR(10),
      ADD COLUMN IF NOT EXISTS account_name   VARCHAR(255),
      ADD COLUMN IF NOT EXISTS paystack_recipient_code VARCHAR(100),
      ADD COLUMN IF NOT EXISTS dojah_nin_match  BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS dojah_face_score INTEGER DEFAULT 0;
    `);

    // Add room share columns to listings if not exists
    await client.query(`
      ALTER TABLE listings
        ADD COLUMN IF NOT EXISTS is_room_share               BOOLEAN DEFAULT false,
        ADD COLUMN IF NOT EXISTS room_share_price_per_person BIGINT,
        ADD COLUMN IF NOT EXISTS room_share_slots            INTEGER DEFAULT 1,
        ADD COLUMN IF NOT EXISTS room_share_slots_filled     INTEGER DEFAULT 0;
    `);

    // Add room share columns to deals if not exists
    await client.query(`
      ALTER TABLE deals
        ADD COLUMN IF NOT EXISTS is_room_share_deal    BOOLEAN DEFAULT false,
        ADD COLUMN IF NOT EXISTS room_share_slot_number INTEGER;
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
    `);

    console.log('✅ All SouthSwift tables initialised');
  } catch (err) {
    console.error('❌ DB init error:', err.message);
  } finally {
    client.release();
  }
};

module.exports = { pool, initDB };
