// Pure money helpers — the single source of truth for SouthSwift's escrow fee math.
// Kept dependency-free and side-effect-free so they can be unit-tested without a DB.

// Fixed policy: 2.5% agent-side + 2.5% SouthSwift-side = 5% total.
// rent_price on listings stays the BASE (e.g. 800,000). The tenant total
// (e.g. 820,000) is always DERIVED at read/deal time, never stored on listings.
// Agent earns nothing on-chain: the 780,000 flows via the agent account to the
// landlord off-platform.
const FEE_RATE = 0.025;
const AGENT_FEE_PERCENT = 2.5;
const SOUTHSWIFT_FEE_PERCENT = 2.5;
const TOTAL_FEE_PERCENT = 5.0;

// Inspection fee policy: agent-set per listing, capped at ₦5,000.
// Old listings backfill to the default; 0/blank skips the inspection step.
const INSPECTION_FEE_DEFAULT = 3000;
const INSPECTION_FEE_MAX = 5000;

// Validate an agent-supplied inspection fee. Returns the normalized integer,
// or an { error } object the controller turns into a 400.
function parseInspectionFee(raw) {
  if (raw === undefined || raw === null || raw === '') return INSPECTION_FEE_DEFAULT;
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(Math.round(n)) || n < 0)
    return { error: 'Inspection fee must be a non-negative whole-naira amount.' };
  const fee = Math.round(n);
  if (fee > INSPECTION_FEE_MAX)
    return { error: `Inspection fee must not exceed ₦${INSPECTION_FEE_MAX.toLocaleString()}.` };
  return fee;
}

// Given the rent (in naira), compute the fees and the total the tenant pays into escrow.
// rent_amount comes from Postgres BIGINT (a string), so coerce explicitly.
function computeDealAmounts(rentAmount) {
  const rent = Number(rentAmount);
  const serviceFeeTenant   = Math.round(rent * FEE_RATE);
  const serviceFeeLandlord = Math.round(rent * FEE_RATE);
  const totalPaid          = rent + serviceFeeTenant;
  return {
    rentAmount: rent,
    serviceFeeTenant,
    serviceFeeLandlord,
    totalPaid,
    agentFeePercent: AGENT_FEE_PERCENT,
    southswiftFeePercent: SOUTHSWIFT_FEE_PERCENT,
    totalFeePercent: TOTAL_FEE_PERCENT,
  };
}

// Inspection gate helpers — pure so the wizard gate, submit guards and tests
// share one definition. A deal holds a listing reservation iff it never needed
// inspection (fee 0) or it satisfied the gate (paid or skipped).
function requiresInspectionFee(source) {
  return Number(source?.inspection_fee) > 0;
}

function inspectionSatisfied(deal) {
  if (!deal || typeof deal !== 'object') return false;
  if (!requiresInspectionFee(deal)) return true;
  return deal.has_paid_inspection === true || deal.inspection_skipped === true;
}

function dealHoldsReservation(deal) {
  if (!deal || typeof deal !== 'object') return false;
  return inspectionSatisfied(deal);
}

// Inspection-hold expiry — pure so the sweeper and tests share one definition.
// A pre-rent deal whose inspection gate was satisfied (paid or skipped) holds
// the unit for INSPECTION_HOLD_TIMEOUT_HOURS; past that the hold lapses and the
// listing re-opens. `now` defaults to Date.now() but is injectable for tests.
// The hold timestamp is whichever resolution came first (paid_at, else skipped_at).
function isInspectionHoldExpired(deal, timeoutHours, now = Date.now()) {
  if (!deal || typeof deal !== 'object') return false;
  if (!['initiated', 'payment_pending'].includes(deal.status)) return false;
  if (!inspectionSatisfied(deal)) return false;
  // Legacy rows whose flag predates the timestamp columns fall back to
  // updated_at (a stale untouched hold is exactly what should lapse).
  const heldAt = deal.inspection_paid_at || deal.inspection_skipped_at || deal.updated_at;
  if (!heldAt) return false;
  const heldMs = new Date(heldAt).getTime();
  if (!Number.isFinite(heldMs)) return false;
  const timeout = Number(timeoutHours);
  if (!Number.isFinite(timeout) || timeout <= 0) return false;
  return Number(now) - heldMs > timeout * 3600 * 1000;
}

// Derived tenant total for a listing base price — used for read-time display
// (old 800k listings show 820k without rewriting rent_price).
function totalPayableForRent(rentPrice, tenantFeePercent = SOUTHSWIFT_FEE_PERCENT) {
  const rent = Number(rentPrice);
  if (!Number.isFinite(rent) || rent <= 0) return null;
  return rent + Math.round(rent * (Number(tenantFeePercent) / 100));
}

// Paystack works in kobo (1 naira = 100 kobo).
function nairaToKobo(naira) {
  return Number(naira) * 100;
}

// What flows via the agent account on fund release: rent minus the agent-side
// fee, in kobo. Labelled landlord funds — the agent forwards to the landlord
// off-platform and keeps nothing on-chain.
function agentPayoutKobo(rentAmount, serviceFeeLandlord) {
  return (Number(rentAmount) - Number(serviceFeeLandlord)) * 100;
}

module.exports = {
  FEE_RATE,
  AGENT_FEE_PERCENT,
  SOUTHSWIFT_FEE_PERCENT,
  TOTAL_FEE_PERCENT,
  INSPECTION_FEE_DEFAULT,
  INSPECTION_FEE_MAX,
  parseInspectionFee,
  requiresInspectionFee,
  inspectionSatisfied,
  dealHoldsReservation,
  isInspectionHoldExpired,
  computeDealAmounts,
  totalPayableForRent,
  nairaToKobo,
  agentPayoutKobo,
};
