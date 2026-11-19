/**
 * In-memory store. Used by the tests and for local development without
 * Google credentials. The Sheets-backed store (phase 5) implements the
 * same interface:
 *
 *   all(table)                        → Promise<row[]>        (copies)
 *   find(table, predicate)            → Promise<row | null>
 *   insert(table, row)                → Promise<row>
 *   insertMany(table, rows)           → Promise<row[]>
 *   update(table, keyValue, patch)    → Promise<row | null>   (patch only)
 *
 * Rows are plain objects keyed by the table's header names. `update`
 * locates the row by the table's key column and changes only the fields
 * in `patch`, so a concurrent edit to another cell is never overwritten.
 */

import { SCHEMA } from '../schema.js';

export function createMemoryStore(seed = {}) {
  const tables = new Map();
  for (const name of Object.keys(SCHEMA)) {
    tables.set(name, (seed[name] || []).map((row) => shape(name, row)));
  }

  function rowsOf(table) {
    const rows = tables.get(table);
    if (!rows) throw new Error('Unknown table: ' + table);
    return rows;
  }

  return {
    async all(table) {
      return rowsOf(table).map((row) => ({ ...row }));
    },

    async find(table, predicate) {
      const row = rowsOf(table).find((r) => predicate({ ...r }));
      return row ? { ...row } : null;
    },

    async insert(table, row) {
      const shaped = shape(table, row);
      rowsOf(table).push(shaped);
      return { ...shaped };
    },

    /** One write for several rows (a single append call on Sheets). */
    async insertMany(table, rows) {
      const shaped = rows.map((row) => shape(table, row));
      rowsOf(table).push(...shaped);
      return shaped.map((row) => ({ ...row }));
    },

    async update(table, keyValue, patch) {
      checkColumns(table, patch);
      const key = SCHEMA[table].key;
      const row = rowsOf(table).find((r) => String(r[key]) === String(keyValue));
      if (!row) return null;
      Object.assign(row, patch);
      return { ...row };
    },
  };
}

// Keeps only the table's columns; missing ones become '' (as an empty
// spreadsheet cell would read back).
function shape(table, row) {
  checkColumns(table, row);
  const out = {};
  for (const col of SCHEMA[table].columns) {
    out[col] = row[col] === undefined || row[col] === null ? '' : row[col];
  }
  return out;
}

function checkColumns(table, obj) {
  const schema = SCHEMA[table];
  if (!schema) throw new Error('Unknown table: ' + table);
  for (const col of Object.keys(obj)) {
    if (!schema.columns.includes(col)) {
      throw new Error(`Unknown column "${col}" for table ${table}`);
    }
  }
}
