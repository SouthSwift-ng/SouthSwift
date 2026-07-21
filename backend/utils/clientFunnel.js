const validateClientLeadInput = (data = {}) => {
  const errors = [];

  if (!data.fullName || String(data.fullName).trim().length < 2) {
    errors.push('fullName');
  }
  if (!data.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(data.email))) {
    errors.push('email');
  }
  if (!data.phone || String(data.phone).trim().length < 7) {
    errors.push('phone');
  }
  if (!['tenant', 'agent', 'landlord'].includes(data.role)) {
    errors.push('role');
  }
  if (!data.city || String(data.city).trim().length < 2) {
    errors.push('city');
  }
  if (!['rent', 'buy'].includes(data.propertyType)) {
    errors.push('propertyType');
  }
  if (!data.budget || Number(data.budget) <= 0) {
    errors.push('budget');
  }
  if (!data.moveInTiming || String(data.moveInTiming).trim().length < 2) {
    errors.push('moveInTiming');
  }
  if (!Array.isArray(data.needs) || data.needs.length === 0) {
    errors.push('needs');
  }

  return errors.length ? { ok: false, errors } : { ok: true };
};

module.exports = { validateClientLeadInput };
