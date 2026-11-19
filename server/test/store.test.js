/**
 * Store contract, run against both implementations, plus Sheets-specific
 * behaviour (staff editing the sheet, RAW writes, retries, refresh).
 */

import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { createMemoryStore } from '../src/store/memory-store.js';
import { createSheetsStore, colLetter } from '../src/store/sheets-store.js';
import { TABLES, SCHEMA } from '../src/schema.js';
import { createFakeSheets } from './fake-sheets.js';
import { makeApp, withLatency } from './helpers.js';
import { seed as fixtureSeed } from './fixtures.js';

const { PRODUCTS, INVENTORY, ORDERS, CUSTOMERS } = TABLES;
const quietLogger = () => ({ warn: vi.fn(), error: vi.fn(), log() {} });

async function sheetsStore(seed = {}, opts = {}) {
  const fake = createFakeSheets(seed, opts);
  const logger = opts.logger || quietLogger();
  const store = createSheetsStore({ spreadsheetId: 'sheet123', getToken: async () => 'tok', fetch: fake.fetch, logger, sleep: async () => {} });
  await store.load();
  return { store, fake, logger };
}

const implementations = {
  memory: async (seed) => createMemoryStore(seed),
  sheets: async (seed) => (await sheetsStore(seed)).store,
};

for (const [label, make] of Object.entries(implementations)) {
  describe(`store contract: ${label}`, () => {
    it('fills missing columns with empty strings', async () => {
      const store = await make({ [PRODUCTS]: [{ id: 'p1', name: 'Rose', price: 100 }] });
      const [row] = await store.all(PRODUCTS);
      expect(row).toMatchObject({ id: 'p1', price: 100, description: '' });
      expect(Object.keys(row)).toEqual(SCHEMA[PRODUCTS].columns);
    });

    it('returns copies, so callers cannot mutate stored rows', async () => {
      const store = await make({ [PRODUCTS]: [{ id: 'p1', name: 'Rose' }] });
      (await store.all(PRODUCTS))[0].name = 'changed';
      (await store.find(PRODUCTS, (r) => r.id === 'p1')).name = 'changed again';
      expect((await store.all(PRODUCTS))[0].name).toBe('Rose');
    });

    it('finds a row or returns null', async () => {
      const store = await make({ [PRODUCTS]: [{ id: 'p1' }, { id: 'p2' }] });
      expect((await store.find(PRODUCTS, (r) => r.id === 'p2')).id).toBe('p2');
      expect(await store.find(PRODUCTS, (r) => r.id === 'p3')).toBeNull();
    });

    it('inserts one or many rows', async () => {
      const store = await make();
      expect(await store.insert(PRODUCTS, { id: 'p1', name: 'Rose' })).toMatchObject({ id: 'p1', name: 'Rose', price: '' });
      const many = await store.insertMany(PRODUCTS, [{ id: 'p2' }, { id: 'p3' }]);
      expect(many.map((r) => r.id)).toEqual(['p2', 'p3']);
      expect((await store.all(PRODUCTS)).map((r) => r.id)).toEqual(['p1', 'p2', 'p3']);
      expect(await store.insertMany(PRODUCTS, [])).toEqual([]);
    });

    it('updates only the patched fields, located by the key column', async () => {
      const store = await make({ [INVENTORY]: [{ sku: 'a', current_qty: 1 }, { sku: 'pcb001', product_name: 'Rose', current_qty: 10, supplier: 'Farm A' }] });
      expect(await store.update(INVENTORY, 'pcb001', { current_qty: 7 })).toMatchObject({ sku: 'pcb001', current_qty: 7, supplier: 'Farm A' });
      expect((await store.find(INVENTORY, (r) => r.sku === 'pcb001')).current_qty).toBe(7);
      expect((await store.find(INVENTORY, (r) => r.sku === 'a')).current_qty).toBe(1);
    });

    it('matches the key as a string (cells may read back as numbers)', async () => {
      const store = await make({ [INVENTORY]: [{ sku: 1001, current_qty: 1 }] });
      expect(await store.update(INVENTORY, '1001', { current_qty: 2 })).not.toBeNull();
    });

    it('returns null when updating a missing row', async () => {
      const store = await make();
      expect(await store.update(PRODUCTS, 'nope', { name: 'x' })).toBeNull();
    });

    it('rejects unknown tables and columns', async () => {
      const store = await make();
      await expect(store.all('Nope')).rejects.toThrow(/Unknown table/);
      await expect(store.insert(PRODUCTS, { id: 'p1', colour: 'red' })).rejects.toThrow(/Unknown column/);
      await expect(store.update(PRODUCTS, 'p1', { colour: 'red' })).rejects.toThrow(/Unknown column/);
    });
  });
}

describe('sheets store: staff editing the sheet', () => {
  it('matches columns by header name, whatever their order', async () => {
    const shuffled = [...SCHEMA[PRODUCTS].columns].reverse();
    const { store, fake } = await sheetsStore({ [PRODUCTS]: [{ id: 'p1', name: 'Rose', price: 100 }] }, { headers: { [PRODUCTS]: shuffled } });
    expect(await store.find(PRODUCTS, (r) => r.id === 'p1')).toMatchObject({ name: 'Rose', price: 100 });
    await store.update(PRODUCTS, 'p1', { price: 120 });
    expect(fake.cell(PRODUCTS, 2, 'price')).toBe(120);
    expect(fake.cell(PRODUCTS, 2, 'name')).toBe('Rose');
  });

  it('ignores extra columns staff added, and leaves them blank on new rows', async () => {
    const cols = [...SCHEMA[PRODUCTS].columns, 'staff_notes'];
    const { store, fake } = await sheetsStore({ [PRODUCTS]: [{ id: 'p1', staff_notes: 'keep me' }] }, { headers: { [PRODUCTS]: cols } });
    expect(await store.find(PRODUCTS, (r) => r.id === 'p1')).not.toHaveProperty('staff_notes');
    await store.update(PRODUCTS, 'p1', { name: 'Rose' });
    expect(fake.cell(PRODUCTS, 2, 'staff_notes')).toBe('keep me');
    await store.insert(PRODUCTS, { id: 'p2' });
    expect(fake.cell(PRODUCTS, 3, 'staff_notes')).toBe('');
  });

  it('updates the right row after staff sort or insert rows', async () => {
    const { store, fake } = await sheetsStore({ [INVENTORY]: [{ sku: 'a', current_qty: 1 }, { sku: 'b', current_qty: 2 }, { sku: 'c', current_qty: 3 }] });
    // Staff sort descending and insert a row at the top, after our last refresh.
    const g = fake.grid(INVENTORY);
    const [header, ...rows] = g;
    g.splice(0, g.length, header, ['z', '', '', 9], ...rows.reverse());

    await store.update(INVENTORY, 'b', { current_qty: 20 });
    expect(fake.grid(INVENTORY).map((r) => [r[0], r[3]])).toEqual([['sku', 'current_qty'], ['z', 9], ['c', 3], ['b', 20], ['a', 1]]);
  });

  it('follows the key column if staff move it', async () => {
    const { store, fake } = await sheetsStore({ [INVENTORY]: [{ sku: 'a', current_qty: 1 }] });
    // Staff insert a column before everything.
    for (const row of fake.grid(INVENTORY)) row.unshift(row === fake.grid(INVENTORY)[0] ? 'staff_col' : 'x');
    await store.update(INVENTORY, 'a', { current_qty: 5 });
    expect(fake.cell(INVENTORY, 2, 'current_qty')).toBe(5);
    expect(fake.cell(INVENTORY, 2, 'staff_col')).toBe('x');
  });

  it('writes only the patched cells, keeping a concurrent staff edit', async () => {
    const { store, fake } = await sheetsStore({ [ORDERS]: [{ id: 'o1', status: 'RECEIVED', notes: '' }] });
    fake.grid(ORDERS)[1][SCHEMA[ORDERS].columns.indexOf('notes')] = 'Call before delivery'; // staff edit, not yet refreshed
    await store.update(ORDERS, 'o1', { status: 'PAID' });
    expect(fake.cell(ORDERS, 2, 'status')).toBe('PAID');
    expect(fake.cell(ORDERS, 2, 'notes')).toBe('Call before delivery');
    const write = fake.requests.find((r) => r.path === '/values:batchUpdate');
    expect(write.body.data).toEqual([{ range: "'Orders'!N2", values: [['PAID']] }]);
  });

  it('picks up staff edits on refresh', async () => {
    const { store, fake } = await sheetsStore({ [PRODUCTS]: [{ id: 'p1', price: 100 }] });
    fake.grid(PRODUCTS)[1][SCHEMA[PRODUCTS].columns.indexOf('price')] = 150;
    expect((await store.all(PRODUCTS))[0].price).toBe(100);
    await store.refresh();
    expect((await store.all(PRODUCTS))[0].price).toBe(150);
  });

  it('skips blank rows', async () => {
    const { store, fake } = await sheetsStore({ [PRODUCTS]: [{ id: 'p1' }] });
    fake.grid(PRODUCTS).push(['', '', ''], ['p2']);
    await store.refresh();
    expect((await store.all(PRODUCTS)).map((r) => r.id)).toEqual(['p1', 'p2']);
  });

  it('warns about missing columns, and refuses to write a value into one', async () => {
    const logger = quietLogger();
    const cols = SCHEMA[CUSTOMERS].columns.filter((c) => c !== 'password_salt' && c !== 'email');
    const { store } = await sheetsStore({}, { headers: { [CUSTOMERS]: cols }, logger });
    expect(logger.warn).toHaveBeenCalledWith('[sheets] Customers is missing columns: email, password_salt');
    await expect(store.insert(CUSTOMERS, { id: 'c1', password_salt: '' })).resolves.toMatchObject({ id: 'c1' });
    await expect(store.insert(CUSTOMERS, { id: 'c2', email: 'a@b.c' })).rejects.toThrow(/Column "email" not found in sheet Customers/);
  });
});

describe('sheets store: API usage', () => {
  it('writes RAW, so customer text is never a formula and phones keep their zero', async () => {
    const { store, fake } = await sheetsStore();
    await store.insert(ORDERS, { id: 'o1', customer_name: '=IMPORTXML("http://evil","//a")', customer_phone: '0712345678', total: 3800 });
    const append = fake.requests.find((r) => r.path.endsWith(':append'));
    expect(append.query.get('valueInputOption')).toBe('RAW');
    expect(append.query.get('insertDataOption')).toBe('INSERT_ROWS');
    expect(fake.cell(ORDERS, 2, 'customer_name')).toBe('=IMPORTXML("http://evil","//a")');
    expect(fake.cell(ORDERS, 2, 'customer_phone')).toBe('0712345678');
    expect(fake.cell(ORDERS, 2, 'total')).toBe(3800);

    await store.update(ORDERS, 'o1', { notes: '+1 call me' });
    expect(fake.requests.find((r) => r.path === '/values:batchUpdate').body.valueInputOption).toBe('RAW');
  });

  it('reads unformatted numbers but formatted dates, with the bearer token', async () => {
    const { fake } = await sheetsStore();
    const get = fake.requests[0];
    expect(get.query.get('valueRenderOption')).toBe('UNFORMATTED_VALUE');
    expect(get.query.get('dateTimeRenderOption')).toBe('FORMATTED_STRING');
    expect(get.headers.Authorization).toBe('Bearer tok');
    expect(get.query.getAll('ranges')).toEqual(Object.keys(SCHEMA).map((n) => `'${n}'`));
  });

  it('loads every tab in one request', async () => {
    const { fake } = await sheetsStore();
    expect(fake.requests).toHaveLength(1);
  });

  it('retries rate-limit and server errors, then gives up', async () => {
    const { store, fake } = await sheetsStore();
    fake.failNext(429, 503);
    await store.insert(PRODUCTS, { id: 'p1' });
    expect((await store.all(PRODUCTS)).map((r) => r.id)).toEqual(['p1']);

    fake.failNext(429, 429, 429, 429);
    await expect(store.insert(PRODUCTS, { id: 'p2' })).rejects.toThrow(/Sheets API 429/);
  });

  it('does not retry client errors', async () => {
    const { store, fake } = await sheetsStore();
    fake.failNext(403);
    await expect(store.insert(PRODUCTS, { id: 'p1' })).rejects.toThrow(/Sheets API 403/);
    expect(fake.requests.filter((r) => r.path.endsWith(':append'))).toHaveLength(1);
  });

  it('does not let a refresh that overlaps a write roll the write back', async () => {
    const { store, fake } = await sheetsStore({ [ORDERS]: [{ id: 'o1', payment_status: 'PENDING' }] });
    // Hold the refresh's batchGet until the write has finished.
    let release;
    const gate = new Promise((r) => { release = r; });
    const realFetch = fake.fetch;
    let held = false;
    const store2 = createSheetsStore({
      spreadsheetId: 'sheet123', getToken: async () => 'tok', logger: quietLogger(), sleep: async () => {},
      fetch: async (url, init) => {
        const decoded = decodeURIComponent(url);
        const isFullRead = decoded.includes('values:batchGet') && !decoded.includes('!');
        if (isFullRead && held) {
          const snapshot = await realFetch(url, init); // data from before the write…
          await gate;                                 // …delivered after it
          return snapshot;
        }
        return realFetch(url, init);
      },
    });
    await store2.load();
    held = true;
    const refreshing = store2.refresh();
    await store2.update(ORDERS, 'o1', { payment_status: 'PAID' });
    release();
    await refreshing;
    expect((await store2.find(ORDERS, (r) => r.id === 'o1')).payment_status).toBe('PAID');
    // The next refresh brings the tab back in sync from the sheet.
    await store2.refresh();
    expect((await store2.find(ORDERS, (r) => r.id === 'o1')).payment_status).toBe('PAID');
    void store;
  });

  it('refuses reads before load()', async () => {
    const fake = createFakeSheets();
    const store = createSheetsStore({ spreadsheetId: 's', getToken: async () => 't', fetch: fake.fetch });
    await expect(store.all(PRODUCTS)).rejects.toThrow(/not loaded/);
  });

  it('converts column numbers to letters', () => {
    expect([0, 25, 26, 27, 51, 52, 701, 702].map(colLetter)).toEqual(['A', 'Z', 'AA', 'AB', 'AZ', 'BA', 'ZZ', 'AAA']);
  });
});

describe('the whole app on the sheets store', () => {
  it('places an order, takes payment status and tracks it, all through the sheet', async () => {
    const s = fixtureSeed();
    s[PRODUCTS].push({ id: 'pcb002', name: 'Midnight Rose', price: 3200, active: true });
    const { store, fake } = await sheetsStore(s);
    const { app } = makeApp({ store: withLatency(store, 1) });
    const send = (body) => request(app).post('/').set('Content-Type', 'text/plain').send(JSON.stringify(body)).then((r) => r.body);

    const created = await send({
      action: 'createOrder', customer_name: 'Jane', customer_phone: '0712345678', delivery_address: 'Westlands',
      delivery_zone: 'cbd', delivery_date: '2026-11-20', delivery_time: '10:00 AM – 12:00 PM',
      items: [{ productId: 'pcb001', quantity: 1 }, { productId: 'pcb002', quantity: 1 }],
    });
    expect(created.success).toBe(true);
    const no = created.data.orderNumber;

    // Rows really landed in the fake sheet…
    const orderRow = fake.grid(ORDERS).findIndex((r) => r[0] === no) + 1;
    expect(fake.cell(ORDERS, orderRow, 'total')).toBe(6700);
    expect(fake.cell(ORDERS, orderRow, 'customer_phone')).toBe('0712345678');
    expect(fake.cell(INVENTORY, 2, 'current_qty')).toBe(2);

    // …and a fresh store loaded from the sheet sees the same order.
    const reloaded = createSheetsStore({ spreadsheetId: 'sheet123', getToken: async () => 'tok', fetch: fake.fetch, logger: quietLogger() });
    await reloaded.load();
    const { app: app2 } = makeApp({ store: reloaded });
    const tracked = await request(app2).get('/').query({ action: 'getOrder', orderNumber: no, phone: '+254712345678' });
    expect(tracked.body.data).toMatchObject({ orderNumber: no, total: 6700, status: 'RECEIVED' });
    expect(tracked.body.data.items).toHaveLength(2);
  });
});
