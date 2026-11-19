import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { makeApp, withLatency } from './helpers.js';
import { seed } from './fixtures.js';
import { createMemoryStore } from '../src/store/memory-store.js';
import { TABLES } from '../src/schema.js';

const BOUQUET = { flowers: { rose: 3, tulip: 2 }, wrapping: 'premium', ribbon: 'gold' }; // 2000 KES

function orderSeed() {
  const s = seed();
  // pcb002 has no Inventory row → untracked.
  s[TABLES.PRODUCTS].push({ id: 'pcb002', name: 'Midnight Rose', price: 3200, active: true });
  s[TABLES.CUSTOMERS] = [{ id: 'cust_1', full_name: 'Jane W', phone: '0712345678', email: 'old@example.com' }];
  return s;
}

function payload(overrides = {}) {
  return {
    action: 'createOrder',
    customer_name: 'Jane Wanjiku',
    customer_phone: '0712345678',
    customer_email: 'jane@example.com',
    delivery_address: 'Westlands, Ring Road, Apt 4B',
    delivery_zone: 'cbd',
    delivery_date: '2026-11-20',
    delivery_time: '10:00 AM – 12:00 PM',
    gift_message: 'Happy Birthday!',
    payment_method: 'MPESA',
    items: [{ productId: 'pcb002', quantity: 1, unitPrice: 3200, name: 'Midnight Rose' }],
    ...overrides,
  };
}

// The frontend posts JSON as text/plain.
const post = (app, body) => request(app).post('/').set('Content-Type', 'text/plain').send(JSON.stringify(body)).then((r) => r.body);

describe('createOrder: success', () => {
  it('creates the order with server-computed prices and companion rows', async () => {
    const { app, store } = makeApp({ seed: orderSeed() });
    const body = await post(app, payload({
      items: [
        { productId: 'pcb002', quantity: 1, unitPrice: 1 },                 // tampered price → ignored
        { productId: 'custom_1731', quantity: 1, unitPrice: 1, custom: BOUQUET },
      ],
    }));

    expect(body.success).toBe(true);
    expect(body.message).toBe('Order created');
    const d = body.data;
    expect(d.orderNumber).toMatch(/^PCB-20261119-\d{6}$/);
    expect(d).toMatchObject({
      subtotal: 5200, deliveryFee: 0, total: 5200, freeDelivery: true, // ≥ 5000 threshold
      status: 'RECEIVED', paymentStatus: 'PENDING',
      customer: { id: 'cust_1', name: 'Jane Wanjiku', phone: '0712345678' },
    });
    expect(d.items).toEqual([
      { productId: 'pcb002', productName: 'Midnight Rose', productSubtitle: '', unitPrice: 3200, quantity: 1, lineTotal: 3200 },
      { productId: 'custom_1731', productName: 'Custom Bouquet', productSubtitle: '3 Roses · 2 Tulips · Premium wrap · Gold ribbon', unitPrice: 2000, quantity: 1, lineTotal: 2000 },
    ]);

    const order = await store.find(TABLES.ORDERS, (r) => r.id === d.orderNumber);
    expect(order).toMatchObject({
      customer_id: 'cust_1', customer_name: 'Jane Wanjiku', delivery_zone: 'cbd', delivery_date: '2026-11-20',
      subtotal: 5200, delivery_fee: 0, total: 5200, status: 'RECEIVED', payment_status: 'PENDING',
      payment_method: 'MPESA', created_at: '2026-11-19T09:30:00.000Z',
    });

    const items = (await store.all(TABLES.ORDER_ITEMS)).filter((r) => r.order_id === d.orderNumber);
    expect(items.map((i) => [i.product_id, i.unit_price, i.line_total])).toEqual([['pcb002', 3200, 3200], ['custom_1731', 2000, 2000]]);

    const payment = await store.find(TABLES.PAYMENTS, (r) => r.order_id === d.orderNumber);
    expect(payment).toMatchObject({ amount: 5200, method: 'MPESA', status: 'PENDING' });

    const delivery = await store.find(TABLES.DELIVERIES, (r) => r.order_id === d.orderNumber);
    expect(delivery).toMatchObject({ status: 'UNASSIGNED', recipient_name: 'Jane Wanjiku' });
  });

  it('charges the zone fee from Settings below the free-delivery threshold', async () => {
    const { app } = makeApp({ seed: orderSeed() });
    const body = await post(app, payload());
    expect(body.data).toMatchObject({ subtotal: 3200, deliveryFee: 300, total: 3500, freeDelivery: false });
  });

  it('falls back to the default fee when Settings has no value for the zone', async () => {
    const { app } = makeApp({ seed: orderSeed() }); // fixture has no delivery_zone_suburbs
    const body = await post(app, payload({ delivery_zone: 'Suburbs' }));
    expect(body.data).toMatchObject({ deliveryFee: 500, total: 3700 });
  });

  it('decrements tracked stock and logs a SALE transaction', async () => {
    const { app, store } = makeApp({ seed: orderSeed() });
    const body = await post(app, payload({ items: [{ productId: 'pcb001', quantity: 2 }] }));
    expect(body.success).toBe(true);

    const inv = await store.find(TABLES.INVENTORY, (r) => r.sku === 'pcb001');
    expect(inv).toMatchObject({ current_qty: 1, status: 'LOW_STOCK', updated_at: '2026-11-19T09:30:00.000Z' });
    const tx = (await store.all(TABLES.INVENTORY_TRANSACTIONS)).find((t) => t.order_id === body.data.orderNumber);
    expect(tx).toMatchObject({ sku: 'pcb001', type: 'SALE', quantity_change: -2, qty_before: 3, qty_after: 1, created_by: 'system' });
  });

  it('updates an existing customer (matched by phone in any format)', async () => {
    const { app, store } = makeApp({ seed: orderSeed() });
    await post(app, payload({ customer_phone: '+254 712 345 678' }));
    const customers = await store.all(TABLES.CUSTOMERS);
    expect(customers).toHaveLength(1);
    expect(customers[0]).toMatchObject({ id: 'cust_1', full_name: 'Jane Wanjiku', email: 'jane@example.com' });
  });

  it('creates a new customer for a new phone', async () => {
    const { app, store } = makeApp({ seed: orderSeed() });
    const body = await post(app, payload({ customer_phone: '0110000000', customer_email: '' }));
    expect(body.data.customer.id).toMatch(/^cust_/);
    expect(await store.all(TABLES.CUSTOMERS)).toHaveLength(2);
  });

  it('accepts yesterday (Nairobi) for customers whose local date lags', async () => {
    const { app } = makeApp({ seed: orderSeed() });
    expect((await post(app, payload({ delivery_date: '2026-11-18' }))).success).toBe(true);
  });

  it('defaults a missing payment method to MPESA', async () => {
    const { app } = makeApp({ seed: orderSeed() });
    const p = payload();
    delete p.payment_method;
    expect((await post(app, p)).success).toBe(true);
  });
});

describe('createOrder: validation', () => {
  it.each(['customer_name', 'customer_phone', 'delivery_address', 'delivery_zone', 'delivery_date', 'delivery_time'])(
    'requires %s',
    async (field) => {
      const { app } = makeApp({ seed: orderSeed() });
      expect(await post(app, payload({ [field]: '  ' }))).toEqual({
        success: false, error: 'Missing required field: ' + field, code: 'INVALID_REQUEST',
      });
    },
  );

  it.each([
    ['a non-Kenyan phone', { customer_phone: '+1 555 123 4567' }, 'Invalid phone number'],
    ['a short phone', { customer_phone: '07123' }, 'Invalid phone number'],
    ['a bad email', { customer_email: 'not-an-email' }, 'Invalid email address'],
    ['a malformed date', { delivery_date: '20/11/2026' }, 'Invalid delivery date'],
    ['an impossible date', { delivery_date: '2026-02-30' }, 'Invalid delivery date'],
    ['a past date', { delivery_date: '2026-11-17' }, 'Delivery date is out of range'],
    ['a date too far ahead', { delivery_date: '2027-03-01' }, 'Delivery date is out of range'],
    ['another payment method', { payment_method: 'CASH' }, 'Unsupported payment method'],
    ['no items', { items: [] }, 'At least one item is required'],
    ['items not an array', { items: 'pcb002' }, 'At least one item is required'],
    ['too many lines', { items: Array.from({ length: 51 }, () => ({ productId: 'pcb002', quantity: 1 })) }, 'Too many items in a single order'],
    ['an overlong name', { customer_name: 'x'.repeat(101) }, 'customer_name is too long (max 100 characters)'],
    ['an overlong gift message', { gift_message: 'x'.repeat(201) }, 'gift_message is too long (max 200 characters)'],
  ])('rejects %s', async (_, overrides, error) => {
    const { app } = makeApp({ seed: orderSeed() });
    expect(await post(app, payload(overrides))).toEqual({ success: false, error, code: 'INVALID_REQUEST' });
  });

  it('rejects an unknown zone', async () => {
    const { app } = makeApp({ seed: orderSeed() });
    expect(await post(app, payload({ delivery_zone: 'mombasa' }))).toEqual({
      success: false, error: 'Invalid delivery zone: mombasa', code: 'INVALID_ZONE',
    });
  });

  it.each([
    ['an unknown product', [{ productId: 'nope', quantity: 1 }], 'Product not found: nope'],
    ['an inactive product', [{ productId: 'pcb099', quantity: 1 }], 'Product no longer available: Retired Bouquet'],
    ['a missing productId', [{ quantity: 1 }], 'Item missing productId'],
    ['quantity 0', [{ productId: 'pcb002', quantity: 0 }], 'Invalid quantity for pcb002'],
    ['quantity 101', [{ productId: 'pcb002', quantity: 101 }], 'Invalid quantity for pcb002'],
    ['a fractional quantity', [{ productId: 'pcb002', quantity: 1.5 }], 'Invalid quantity for pcb002'],
    ['a custom bouquet from an old cart', [{ productId: 'custom_1', quantity: 1, unitPrice: 1 }], 'Please rebuild your custom bouquet — it was saved in an older format.'],
    ['a custom bouquet with too few stems', [{ productId: 'custom_1', quantity: 1, custom: { flowers: { rose: 2 }, wrapping: 'kraft', ribbon: 'white' } }], 'A custom bouquet needs at least 5 stems'],
  ])('rejects %s with INVALID_ITEM', async (_, items, error) => {
    const { app } = makeApp({ seed: orderSeed() });
    expect(await post(app, payload({ items }))).toEqual({ success: false, error, code: 'INVALID_ITEM' });
  });

  it('writes nothing when validation fails', async () => {
    const { app, store } = makeApp({ seed: orderSeed() });
    await post(app, payload({ items: [{ productId: 'nope', quantity: 1 }] }));
    expect(await store.all(TABLES.ORDERS)).toHaveLength(3);
    expect(await store.all(TABLES.CUSTOMERS)).toHaveLength(1);
  });
});

describe('createOrder: stock', () => {
  it('rejects when stock is short and writes nothing', async () => {
    const { app, store } = makeApp({ seed: orderSeed() });
    const body = await post(app, payload({ items: [{ productId: 'pcb001', quantity: 4 }] }));
    expect(body).toEqual({
      success: false, code: 'INSUFFICIENT_STOCK',
      error: 'Insufficient stock for Crimson Rose Bouquet (need 4, have 3)',
    });
    expect(await store.all(TABLES.ORDERS)).toHaveLength(3);
    expect((await store.find(TABLES.INVENTORY, (r) => r.sku === 'pcb001')).current_qty).toBe(3);
  });

  it('sums quantities across lines of the same product', async () => {
    const { app } = makeApp({ seed: orderSeed() });
    const body = await post(app, payload({ items: [{ productId: 'pcb001', quantity: 2 }, { productId: 'pcb001', quantity: 2 }] }));
    expect(body.code).toBe('INSUFFICIENT_STOCK');
  });

  it('never oversells under concurrent orders', async () => {
    const { app, store } = makeApp({ store: withLatency(createMemoryStore(orderSeed())) });
    const results = await Promise.all([1, 2, 3].map(() => post(app, payload({ items: [{ productId: 'pcb001', quantity: 2 }] }))));
    expect(results.filter((r) => r.success)).toHaveLength(1);
    expect(results.filter((r) => r.code === 'INSUFFICIENT_STOCK')).toHaveLength(2);
    expect((await store.find(TABLES.INVENTORY, (r) => r.sku === 'pcb001')).current_qty).toBe(1);
  });
});

describe('createOrder: resilience and limits', () => {
  it('still succeeds (and logs) when a companion row fails to write', async () => {
    const store = createMemoryStore(orderSeed());
    const realInsert = store.insert;
    store.insert = (table, row) => (table === TABLES.PAYMENTS ? Promise.reject(new Error('Sheets down')) : realInsert(table, row));
    const logger = { error: vi.fn(), log() {}, warn() {} };
    const { app } = makeApp({ store, logger });

    const body = await post(app, payload());
    expect(body.success).toBe(true);
    expect(await store.find(TABLES.ORDERS, (r) => r.id === body.data.orderNumber)).not.toBeNull();
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('failed to write payment row'), expect.any(Error));
  });

  it('fails cleanly, without an order row, when the item write fails', async () => {
    const store = createMemoryStore(orderSeed());
    store.insertMany = () => Promise.reject(new Error('Sheets down'));
    const { app } = makeApp({ store });
    expect((await post(app, payload())).code).toBe('UNHANDLED');
    expect(await store.all(TABLES.ORDERS)).toHaveLength(3);
  });

  it('rate-limits order creation per IP', async () => {
    const { app } = makeApp({ seed: orderSeed() });
    for (let i = 0; i < 20; i++) expect((await post(app, payload())).success).toBe(true);
    expect((await post(app, payload())).code).toBe('RATE_LIMITED');
  });

  it('gives every order a unique number', async () => {
    const { app } = makeApp({ seed: orderSeed() });
    const numbers = new Set();
    for (let i = 0; i < 15; i++) numbers.add((await post(app, payload())).data.orderNumber);
    expect(numbers.size).toBe(15);
  });
});
