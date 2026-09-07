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
  computeDealAmounts,
  totalPayableForRent,
  nairaToKobo,
  agentPayoutKobo,
};
