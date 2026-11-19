/**
 * A fake of the three Sheets REST calls the store uses (values:batchGet,
 * values:append, values:batchUpdate), over in-memory grids. Behaves like
 * the real API where it matters: trailing empty cells/rows are trimmed,
 * appends go after the last non-empty row, ranges use quoted tab names.
 */

import { SCHEMA } from '../src/schema.js';

export function createFakeSheets(seed = {}, { headers = {} } = {}) {
  const grids = new Map();
  for (const name of Object.keys(SCHEMA)) {
    const cols = headers[name] || SCHEMA[name].columns;
    grids.set(name, [[...cols], ...(seed[name] || []).map((row) => cols.map((c) => (row[c] === undefined ? '' : row[c])))]);
  }

  const requests = [];
  const failures = []; // queued HTTP statuses to return before succeeding

  function grid(name) {
    const g = grids.get(name);
    if (!g) throw new Error('fake-sheets: no tab ' + name);
    return g;
  }

  function parseRange(range) {
    const m = /^'((?:[^']|'')+)'(?:!(.+))?$/.exec(range);
    if (!m) throw new Error('fake-sheets: bad range ' + range);
    return { name: m[1].replace(/''/g, "'"), ref: m[2] || null };
  }

  const colIndex = (letters) => [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;

  function trim(rows) {
    const out = rows.map((r) => {
      const copy = [...r];
      while (copy.length && (copy.at(-1) === '' || copy.at(-1) === undefined)) copy.pop();
      return copy;
    });
    while (out.length && out.at(-1).length === 0) out.pop();
    return out;
  }

  function read(range) {
    const { name, ref } = parseRange(range);
    const g = grid(name);
    if (!ref) return trim(g);
    let m;
    if ((m = /^(\d+):(\d+)$/.exec(ref))) return trim(g.slice(Number(m[1]) - 1, Number(m[2])));
    if ((m = /^([A-Z]+):([A-Z]+)$/.exec(ref))) {
      const c = colIndex(m[1]);
      return trim(g.map((r) => [r[c] === undefined ? '' : r[c]]));
    }
    throw new Error('fake-sheets: unsupported read range ' + range);
  }

  function lastUsedRow(g) {
    for (let i = g.length - 1; i >= 0; i--) if (g[i].some((v) => v !== '' && v !== undefined)) return i + 1;
    return 0;
  }

  async function fetch(url, init = {}) {
    const u = new URL(url);
    const path = decodeURIComponent(u.pathname.replace(/^\/v4\/spreadsheets\/[^/]+/, ''));
    const body = init.body ? JSON.parse(init.body) : null;
    requests.push({ method: init.method || 'GET', path, query: u.searchParams, body, headers: init.headers });

    if (failures.length) return new Response('{"error":"fake failure"}', { status: failures.shift() });

    if (path === '/values:batchGet') {
      return json({ valueRanges: u.searchParams.getAll('ranges').map((r) => ({ range: r, values: read(r) })) });
    }

    let m;
    if ((m = /^\/values\/(.+):append$/.exec(path))) {
      const { name } = parseRange(m[1].replace(/!A1$/, ''));
      const g = grid(name);
      const start = lastUsedRow(g) + 1;
      g.length = start - 1;
      g.push(...body.values.map((r) => [...r]));
      return json({ updates: { updatedRange: `'${name}'!A${start}:Z${start + body.values.length - 1}` } });
    }

    if (path === '/values:batchUpdate') {
      for (const { range, values } of body.data) {
        const { name, ref } = parseRange(range);
        const cell = /^([A-Z]+)(\d+)$/.exec(ref);
        const g = grid(name);
        const r = Number(cell[2]) - 1;
        while (g.length <= r) g.push([]);
        g[r][colIndex(cell[1])] = values[0][0];
      }
      return json({ totalUpdatedCells: body.data.length });
    }

    return new Response('not found', { status: 404 });
  }

  return {
    fetch,
    requests,
    failNext: (...statuses) => failures.push(...statuses),
    /** Raw grid access, for simulating staff edits and checking writes. */
    grid,
    /** Cell by header name, for assertions. */
    cell(name, rowNumber, col) {
      const g = grid(name);
      return g[rowNumber - 1]?.[g[0].indexOf(col)];
    },
  };
}

function json(data) {
  return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
}
