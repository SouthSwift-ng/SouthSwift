const assert = require('node:assert/strict');
const test = require('node:test');
const { buildInitSqlStatements } = require('../config/db');

test('initialization SQL includes the expanded SouthSwift schema fields', () => {
  const sql = buildInitSqlStatements();

  assert.match(sql, /CREATE TABLE IF NOT EXISTS agent_profiles/i);
  assert.match(sql, /updated_at\s+TIMESTAMP DEFAULT NOW\(\)/i);
  assert.match(sql, /intro_video_url\s+TEXT/i);
  assert.match(sql, /videos\s+TEXT\[\]/i);
  assert.match(sql, /room_share_slots_filled\s+INTEGER DEFAULT 0/i);
  assert.match(sql, /swiftdoc_data\s+JSONB/i);
  assert.match(sql, /payment_anomaly\s+TEXT/i);
  assert.match(sql, /agent_fee_percent\s+DECIMAL/i);
  assert.match(sql, /southswift_fee_percent\s+DECIMAL/i);
  assert.match(sql, /total_fee_percent\s+DECIMAL/i);
  assert.match(sql, /inspection_fee\s+BIGINT/i);
  assert.match(sql, /has_paid_inspection\s+BOOLEAN/i);
  assert.match(sql, /payment_type.*CHECK.*rent.*inspection|CHECK\s*\(payment_type IN \('rent','inspection'\)/i);
});
