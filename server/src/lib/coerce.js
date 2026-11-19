/**
 * Sheet cells come back as strings, numbers, booleans or ''. These
 * helpers match the coercions in apps-script/Utils.js.
 */

export function asNumber(v, fallback = 0) {
  const n = Number(v);
  return Number.isNaN(n) ? fallback : n;
}

export function asString(v) {
  return v === null || v === undefined ? '' : String(v);
}

export function parseBool(v) {
  if (v === true) return true;
  const s = String(v).toLowerCase();
  return s === 'true' || s === '1' || s === 'yes';
}

/**
 * Normalises a Kenyan phone number to 254XXXXXXXXX for comparison.
 * Accepts 0712…, +254712…, 254712…, 712….
 */
export function normalisePhone(phone) {
  const s = String(phone ?? '').replace(/\D/g, '');
  if (s.startsWith('254')) return s;
  if (s.startsWith('0')) return '254' + s.slice(1);
  if (s.length === 9) return '254' + s;
  return s;
}
