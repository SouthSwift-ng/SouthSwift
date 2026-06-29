// ── Small formatting helpers — central so a future revisit can swap the locale,
// currency symbol, or NaN sentinel in one place. ───────────────────────────────

// Money: shows ₦12,345 — but returns "—" when value is null/undefined/NaN
// instead of the literal string "NaN" the bare Number(x).toLocaleString() emitted
// across the UI when an old or partial deal row was missing a number column.
export const formatNaira = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString() : '—';
};

// Today's date in the LOCAL timezone as yyyy-mm-dd. Date inputs use this for `min`;
// the previous `new Date().toISOString().split('T')[0]` was UTC, so a user in WAT
// (UTC+1) at 23:30 saw tomorrow's date as "today" and couldn't pick today.
export const todayLocalISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};
