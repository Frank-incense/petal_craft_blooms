/**
 * Google Sheets store. Same interface as memory-store.js.
 *
 * Reads come from an in-memory copy of every tab, loaded at startup and
 * refreshed every `refreshMs` so staff edits show up. Writes go straight
 * to the sheet and update the copy.
 *
 * Rules that keep this safe while staff edit the sheet by hand:
 * - Columns are matched by header name, not position.
 * - update() re-reads the header row and key column right before writing,
 *   so sorted/inserted rows and moved columns can't redirect a write.
 * - update() writes only the patched cells.
 * - Values are written RAW: nothing a customer types is ever evaluated
 *   as a formula, and phone numbers keep their leading zero.
 * - A refresh that overlaps a write to a tab skips that tab, so it can't
 *   replace the copy with data from before the write.
 */

import { SCHEMA } from '../schema.js';

const API = 'https://sheets.googleapis.com/v4/spreadsheets';
const RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);

export function createSheetsStore({
  spreadsheetId,
  getToken,
  fetch = globalThis.fetch,
  refreshMs = 30_000,
  logger = console,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
}) {
  const tables = new Map();    // name → { headers: string[], entries: [{ rowNumber, row }] }
  const writeSeq = new Map();  // name → count of writes, for refresh/write overlap
  let timer = null;

  // ==================== HTTP ====================

  async function api(path, init = {}) {
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(`${API}/${spreadsheetId}${path}`, {
        ...init,
        headers: { Authorization: 'Bearer ' + (await getToken()), 'Content-Type': 'application/json', ...init.headers },
        signal: AbortSignal.timeout(20_000),
      });
      if (res.ok) return res.json();
      const text = await res.text();
      if (RETRY_STATUSES.has(res.status) && attempt < 3) {
        await sleep(500 * 2 ** attempt);
        continue;
      }
      throw new Error(`Sheets API ${res.status}: ${text.slice(0, 300)}`);
    }
  }

  async function batchGet(ranges) {
    const qs = new URLSearchParams({ valueRenderOption: 'UNFORMATTED_VALUE', dateTimeRenderOption: 'FORMATTED_STRING' });
    for (const r of ranges) qs.append('ranges', r);
    const data = await api('/values:batchGet?' + qs);
    return (data.valueRanges || []).map((vr) => vr.values || []);
  }

  // ==================== LOADING ====================

  function parseTab(name, grid) {
    const headers = (grid[0] || []).map((h) => String(h).trim());
    const missing = SCHEMA[name].columns.filter((c) => !headers.includes(c));
    if (missing.length) logger.warn(`[sheets] ${name} is missing columns: ${missing.join(', ')}`);

    const entries = [];
    for (let i = 1; i < grid.length; i++) {
      const cells = grid[i];
      if (!cells || cells.every((v) => v === '' || v === null || v === undefined)) continue; // blank row
      entries.push({ rowNumber: i + 1, row: rowFromCells(name, headers, cells) });
    }
    return { headers, entries };
  }

  async function refresh() {
    const names = Object.keys(SCHEMA);
    const seqAtStart = new Map(names.map((n) => [n, writeSeq.get(n) || 0]));
    const grids = await batchGet(names.map((n) => quote(n)));
    names.forEach((name, i) => {
      if ((writeSeq.get(name) || 0) !== seqAtStart.get(name)) return; // written meanwhile; next refresh
      tables.set(name, parseTab(name, grids[i]));
    });
  }

  function tab(name) {
    const t = tables.get(name);
    if (!t) {
      if (!SCHEMA[name]) throw new Error('Unknown table: ' + name);
      throw new Error('Sheets store not loaded yet');
    }
    return t;
  }

  function bumpSeq(name) {
    writeSeq.set(name, (writeSeq.get(name) || 0) + 1);
  }

  // ==================== WRITES ====================

  function cellsFor(name, headers, row) {
    checkColumns(name, row);
    for (const [col, value] of Object.entries(row)) {
      if (!headers.includes(col) && value !== '' && value !== null && value !== undefined) {
        throw new Error(`Column "${col}" not found in sheet ${name}; add it to the header row`);
      }
    }
    return headers.map((h) => toCell(row[h]));
  }

  async function appendRows(name, rows) {
    bumpSeq(name);
    const t = tab(name);
    const values = rows.map((row) => cellsFor(name, t.headers, row));
    const data = await api(`/values/${encodeURIComponent(quote(name) + '!A1')}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
      method: 'POST',
      body: JSON.stringify({ values }),
    });
    const first = firstRowOf(data.updates?.updatedRange);
    const shaped = rows.map((row, i) => {
      const r = rowFromCells(name, t.headers, values[i]);
      t.entries.push({ rowNumber: first ? first + i : null, row: r });
      return { ...r };
    });
    bumpSeq(name);
    return shaped;
  }

  /** Re-reads the header and key column to find where a row is now. */
  async function locate(name, keyValue) {
    const key = SCHEMA[name].key;
    const t = tab(name);
    let keyIdx = t.headers.indexOf(key);
    if (keyIdx < 0) keyIdx = 0;

    let [headerGrid, keyGrid] = await batchGet([`${quote(name)}!1:1`, colRange(name, keyIdx)]);
    const headers = (headerGrid[0] || []).map((h) => String(h).trim());
    const actualIdx = headers.indexOf(key);
    if (actualIdx < 0) throw new Error(`Key column "${key}" not found in sheet ${name}`);
    if (actualIdx !== keyIdx) [keyGrid] = await batchGet([colRange(name, actualIdx)]); // columns moved

    for (let i = 1; i < keyGrid.length; i++) {
      if (String(keyGrid[i]?.[0] ?? '') === String(keyValue)) return { headers, rowNumber: i + 1 };
    }
    return { headers, rowNumber: null };
  }

  // ==================== INTERFACE ====================

  return {
    /** Initial load. Call (and await) before serving requests. */
    async load() {
      await refresh();
    },

    startAutoRefresh() {
      if (timer) return;
      timer = setInterval(() => {
        refresh().catch((err) => logger.error('[sheets] refresh failed (serving the last copy)', err));
      }, refreshMs);
      timer.unref?.();
    },

    stop() {
      clearInterval(timer);
      timer = null;
    },

    refresh,

    async all(name) {
      return tab(name).entries.map((e) => ({ ...e.row }));
    },

    async find(name, predicate) {
      const e = tab(name).entries.find((x) => predicate({ ...x.row }));
      return e ? { ...e.row } : null;
    },

    async insert(name, row) {
      return (await appendRows(name, [row]))[0];
    },

    async insertMany(name, rows) {
      if (!rows.length) return [];
      return appendRows(name, rows);
    },

    async update(name, keyValue, patch) {
      checkColumns(name, patch);
      const t = tab(name);
      bumpSeq(name);
      try {
        const { headers, rowNumber } = await locate(name, keyValue);
        if (!rowNumber) return null;

        const data = Object.entries(patch).map(([col, value]) => {
          const idx = headers.indexOf(col);
          if (idx < 0) throw new Error(`Column "${col}" not found in sheet ${name}; add it to the header row`);
          return { range: `${quote(name)}!${colLetter(idx)}${rowNumber}`, values: [[toCell(value)]] };
        });
        await api('/values:batchUpdate', { method: 'POST', body: JSON.stringify({ valueInputOption: 'RAW', data }) });

        const key = SCHEMA[name].key;
        let entry = t.entries.find((e) => String(e.row[key]) === String(keyValue));
        if (!entry) {
          // Added by staff since the last refresh; take it from the sheet next time.
          return { [key]: keyValue, ...patch };
        }
        Object.assign(entry.row, patch);
        entry.rowNumber = rowNumber;
        return { ...entry.row };
      } finally {
        bumpSeq(name);
      }
    },
  };
}

// ==================== HELPERS ====================

function rowFromCells(name, headers, cells) {
  const row = {};
  for (const col of SCHEMA[name].columns) {
    const idx = headers.indexOf(col);
    const v = idx >= 0 ? cells[idx] : undefined;
    row[col] = v === undefined || v === null ? '' : v;
  }
  return row;
}

function checkColumns(name, obj) {
  const schema = SCHEMA[name];
  if (!schema) throw new Error('Unknown table: ' + name);
  for (const col of Object.keys(obj)) {
    if (!schema.columns.includes(col)) throw new Error(`Unknown column "${col}" for table ${name}`);
  }
}

function toCell(v) {
  if (v === undefined || v === null) return '';
  if (typeof v === 'number' || typeof v === 'boolean') return v;
  return String(v);
}

/** 'Order_Items' → "'Order_Items'" (sheet names are quoted in A1 ranges). */
function quote(name) {
  return `'${name.replace(/'/g, "''")}'`;
}

function colRange(name, idx) {
  const c = colLetter(idx);
  return `${quote(name)}!${c}:${c}`;
}

export function colLetter(idx) {
  let s = '';
  for (let n = idx + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/** "'Orders'!A5:V7" → 5 */
function firstRowOf(range) {
  const m = /![A-Z]+(\d+)/.exec(range || '');
  return m ? Number(m[1]) : null;
}
