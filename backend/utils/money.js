// Pure money helpers — the single source of truth for SouthSwift's escrow fee math.
// Kept dependency-free and side-effect-free so they can be unit-tested without a DB.

// SouthSwift takes 2.5% from the tenant and 2.5% from the landlord/agent (5% total, split).
const FEE_RATE = 0.025;

// Given the rent (in naira), compute the fees and the total the tenant pays into escrow.
// rent_amount comes from Postgres BIGINT (a string), so coerce explicitly.
function computeDealAmounts(rentAmount) {
  const rent = Number(rentAmount);
  const serviceFeeTenant   = Math.round(rent * FEE_RATE);
  const serviceFeeLandlord = Math.round(rent * FEE_RATE);
  const totalPaid          = rent + serviceFeeTenant;
  return { rentAmount: rent, serviceFeeTenant, serviceFeeLandlord, totalPaid };
}

// Paystack works in kobo (1 naira = 100 kobo).
function nairaToKobo(naira) {
  return Number(naira) * 100;
}

// What the agent receives on fund release: rent minus the landlord-side fee, in kobo.
function agentPayoutKobo(rentAmount, serviceFeeLandlord) {
  return (Number(rentAmount) - Number(serviceFeeLandlord)) * 100;
}

module.exports = { FEE_RATE, computeDealAmounts, nairaToKobo, agentPayoutKobo };
