import { TABLES } from '../schema.js';

/**
 * Reads the Settings tab into a key → value map, coercing by the row's
 * `type` column (string | number | boolean | json), like
 * Utils.getSettingsMap in Apps Script.
 */
export async function getSettings(store) {
  const rows = await store.all(TABLES.SETTINGS);
  const map = {};
  for (const r of rows) {
    if (!r.key) continue;
    let v = r.value;
    const type = String(r.type || 'string').toLowerCase();
    if (type === 'number') v = Number(v);
    else if (type === 'boolean') v = v === true || String(v).toLowerCase() === 'true';
    else if (type === 'json') { try { v = JSON.parse(v); } catch { /* leave raw */ } }
    map[r.key] = v;
  }
  return map;
}
