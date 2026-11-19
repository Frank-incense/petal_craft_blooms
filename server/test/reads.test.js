/**
 * Read actions, checked against the shapes the frontend consumes
 * (src/js/products.js, checkout.js, tracking.js).
 */

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { makeApp, FIXED_NOW } from './helpers.js';
import { seed, ORDER_NO, OTHER_ORDER_NO } from './fixtures.js';
import { createMemoryStore } from '../src/store/memory-store.js';
import { getSettings } from '../src/lib/settings.js';

const get = (app, query) => request(app).get('/').query(query).then((r) => r.body);
const ADMIN = { token: 'test-admin-token' };

describe('getProducts / getProduct', () => {
  it('returns active products with coerced types', async () => {
    const { app } = makeApp({ seed: seed() });
    const body = await get(app, { action: 'getProducts' });
    expect(body.success).toBe(true);
    expect(body.message).toBe('Products retrieved');
    expect(body.data.map((p) => p.id)).toEqual(['pcb001', 'pcb004']);
    expect(body.data[1]).toEqual({
      id: 'pcb004', name: 'Grand Romance', slug: 'grand-romance', description: '',
      category: 'Roses', occasion: '', price: 8500, image: '', rating: 5,
      featured: true, active: true,
    });
  });

  it('returns a single product, including inactive ones (as before)', async () => {
    const { app } = makeApp({ seed: seed() });
    expect((await get(app, { action: 'getProduct', id: 'pcb099' })).data.active).toBe(false);
  });

  it('errors on missing or unknown ids', async () => {
    const { app } = makeApp({ seed: seed() });
    expect((await get(app, { action: 'getProduct' })).code).toBe('MISSING_ID');
    expect((await get(app, { action: 'getProduct', id: 'nope' })).code).toBe('NOT_FOUND');
  });
});

describe('getOrder', () => {
  it('returns the order and its items when number and phone match', async () => {
    const { app } = makeApp({ seed: seed() });
    const body = await get(app, { action: 'getOrder', orderNumber: ORDER_NO, phone: '0712345678' });
    expect(body.success).toBe(true);
    expect(body.data).toEqual({
      orderNumber: ORDER_NO, status: 'PAID', paymentStatus: 'PAID', paymentMethod: 'MPESA',
      customerName: 'Jane Wanjiku', deliveryDate: '2026-11-20', deliveryTime: '10:00 AM – 12:00 PM',
      deliveryZone: 'cbd', address: 'Westlands, Ring Road', subtotal: 3500, deliveryFee: 300,
      total: 3800, giftMessage: 'Happy Birthday!', createdAt: '2026-11-19T06:00:00.000Z',
      items: [{ productId: 'pcb001', name: 'Crimson Rose Bouquet', subtitle: '', unitPrice: 3500, quantity: 1, lineTotal: 3500 }],
    });
  });

  it.each(['+254712345678', '254712345678', '712345678', '0712 345 678'])(
    'matches phone format %s',
    async (phone) => {
      const { app } = makeApp({ seed: seed() });
      expect((await get(app, { action: 'getOrder', orderNumber: ORDER_NO, phone })).success).toBe(true);
    },
  );

  it('matches a sheet phone stored with spaces and +254', async () => {
    const { app } = makeApp({ seed: seed() });
    expect((await get(app, { action: 'getOrder', orderNumber: OTHER_ORDER_NO, phone: '0733000111' })).success).toBe(true);
  });

  it('returns NOT_FOUND when the phone does not match', async () => {
    const { app } = makeApp({ seed: seed() });
    const body = await get(app, { action: 'getOrder', orderNumber: ORDER_NO, phone: '0799999999' });
    expect(body).toEqual({ success: false, error: 'Order not found', code: 'NOT_FOUND' });
  });

  it('requires both order number and phone', async () => {
    const { app } = makeApp({ seed: seed() });
    expect((await get(app, { action: 'getOrder', phone: '0712345678' })).code).toBe('MISSING_ID');
    expect((await get(app, { action: 'getOrder', orderNumber: ORDER_NO })).code).toBe('MISSING_ID');
  });

  it('rate-limits repeated failed lookups per IP, but not successful ones', async () => {
    const { app } = makeApp({ seed: seed() });
    for (let i = 0; i < 20; i++) {
      expect((await get(app, { action: 'getOrder', orderNumber: ORDER_NO, phone: '0712345678' })).success).toBe(true);
    }
    for (let i = 0; i < 10; i++) {
      expect((await get(app, { action: 'getOrder', orderNumber: ORDER_NO, phone: '07000000' + i })).code).toBe('NOT_FOUND');
    }
    // Now blocked — even with the correct phone.
    expect((await get(app, { action: 'getOrder', orderNumber: ORDER_NO, phone: '0712345678' })).code).toBe('RATE_LIMITED');
  });

  it('lifts the rate limit after the window', async () => {
    let now = FIXED_NOW;
    const { app } = makeApp({ seed: seed(), now: () => now });
    for (let i = 0; i < 10; i++) await get(app, { action: 'getOrder', orderNumber: 'x', phone: '0700000000' });
    expect((await get(app, { action: 'getOrder', orderNumber: ORDER_NO, phone: '0712345678' })).code).toBe('RATE_LIMITED');
    now = new Date(FIXED_NOW.getTime() + 15 * 60 * 1000);
    expect((await get(app, { action: 'getOrder', orderNumber: ORDER_NO, phone: '0712345678' })).success).toBe(true);
  });
});

describe('getPayments', () => {
  it('returns payments newest first, without checkout ID or payer phone', async () => {
    const { app } = makeApp({ seed: seed() });
    const body = await get(app, { action: 'getPayments', orderNumber: ORDER_NO });
    expect(body.data.map((p) => p.id)).toEqual(['pay_new', 'pay_old']);
    expect(body.data[0]).toEqual({
      id: 'pay_new', orderNumber: ORDER_NO, amount: 3800, method: 'MPESA', status: 'PAID',
      mpesaReceipt: 'SJL4K2M9QT', resultCode: '', resultDesc: '',
      createdAt: '2026-11-19T06:05:00.000Z', updatedAt: '',
    });
    expect(JSON.stringify(body)).not.toMatch(/ws_CO_|254712345678/);
  });

  it('returns an empty list for an order with no payments', async () => {
    const { app } = makeApp({ seed: seed() });
    expect((await get(app, { action: 'getPayments', orderNumber: 'PCB-x' })).data).toEqual([]);
  });

  it('requires an order number', async () => {
    const { app } = makeApp({ seed: seed() });
    expect((await get(app, { action: 'getPayments' })).code).toBe('MISSING_ID');
  });
});

describe('getDelivery', () => {
  it('returns the delivery when order number and phone match', async () => {
    const { app } = makeApp({ seed: seed() });
    const body = await get(app, { action: 'getDelivery', orderNumber: OTHER_ORDER_NO, phone: '0733000111' });
    expect(body.data).toMatchObject({
      orderNumber: OTHER_ORDER_NO, courierName: 'Kimani Deliveries', courierPhone: '0722111222',
      status: 'PICKED_UP', pickedUpAt: '2026-11-19T08:00:00.000Z', deliveredAt: '',
    });
  });

  it('refuses without the matching phone (changed from Apps Script)', async () => {
    const { app } = makeApp({ seed: seed() });
    expect((await get(app, { action: 'getDelivery', orderNumber: OTHER_ORDER_NO })).code).toBe('MISSING_ID');
    expect((await get(app, { action: 'getDelivery', orderNumber: OTHER_ORDER_NO, phone: '0712345678' })).code).toBe('NOT_FOUND');
  });

  it('returns NOT_FOUND when the order has no delivery row', async () => {
    const s = seed();
    s.Deliveries = [];
    const { app } = makeApp({ seed: s });
    expect((await get(app, { action: 'getDelivery', orderNumber: ORDER_NO, phone: '0712345678' })).code).toBe('NOT_FOUND');
  });
});

describe('admin-only reads', () => {
  const ADMIN_ACTIONS = ['listDeliveries', 'getInventory', 'getTransactions', 'adminDashboard', 'adminListOrders'];

  it.each(ADMIN_ACTIONS)('%s refuses requests without the admin token', async (action) => {
    const { app } = makeApp({ seed: seed() });
    expect((await get(app, { action })).code).toBe('UNAUTHORIZED');
    expect((await get(app, { action, token: 'wrong' })).code).toBe('UNAUTHORIZED');
  });

  it('listDeliveries filters by status', async () => {
    const { app } = makeApp({ seed: seed() });
    expect((await get(app, { action: 'listDeliveries', ...ADMIN })).data).toHaveLength(2);
    const picked = await get(app, { action: 'listDeliveries', status: 'PICKED_UP', ...ADMIN });
    expect(picked.data.map((d) => d.id)).toEqual(['del_2']);
  });

  it('getInventory and getTransactions return raw rows, transactions filterable by sku', async () => {
    const { app } = makeApp({ seed: seed() });
    expect((await get(app, { action: 'getInventory', ...ADMIN })).data).toHaveLength(2);
    const tx = await get(app, { action: 'getTransactions', sku: 'pcb004', ...ADMIN });
    expect(tx.data.map((t) => t.id)).toEqual(['invtx_2']);
  });

  it('adminDashboard counts "today" in Nairobi time', async () => {
    // FIXED_NOW is 2026-11-19 12:30 in Nairobi. Both orders created on the
    // 19th (Nairobi) count, including the one at 23:30 UTC on the 18th.
    const { app } = makeApp({ seed: seed() });
    const body = await get(app, { action: 'adminDashboard', ...ADMIN });
    expect(body.data).toEqual({
      today: { orders: 2, revenue: 12800, currency: 'KES' },
      pendingOrders: 2, // PAID + RECEIVED
      outForDelivery: 1,
      lowStock: 1,
      outOfStock: 1,
      deliveriesPending: 1,
      generatedAt: FIXED_NOW.toISOString(),
    });
  });

  it('adminListOrders sorts newest first, searches, filters and limits', async () => {
    const { app } = makeApp({ seed: seed() });
    const all = await get(app, { action: 'adminListOrders', ...ADMIN });
    expect(all.data.total).toBe(3);
    expect(all.data.orders.map((o) => o.orderNumber)).toEqual([ORDER_NO, OTHER_ORDER_NO, 'PCB-20261101-000001']);

    const search = await get(app, { action: 'adminListOrders', search: 'otieno', ...ADMIN });
    expect(search.data.orders.map((o) => o.orderNumber)).toEqual([OTHER_ORDER_NO]);

    const pending = await get(app, { action: 'adminListOrders', paymentStatus: 'PENDING', ...ADMIN });
    expect(pending.data.total).toBe(1);

    const limited = await get(app, { action: 'adminListOrders', limit: 1, ...ADMIN });
    expect(limited.data).toMatchObject({ total: 3, returned: 1 });
  });

  it('adminListOrders also accepts filters nested under `filters` (POST)', async () => {
    const { app } = makeApp({ seed: seed() });
    const res = await request(app).post('/').set('Content-Type', 'text/plain')
      .send(JSON.stringify({ action: 'adminListOrders', ...ADMIN, filters: { status: 'RECEIVED' } }));
    expect(res.body.data.orders.map((o) => o.orderNumber)).toEqual(['PCB-20261101-000001']);
  });
});

describe('getSettings', () => {
  it('coerces values by type', async () => {
    const settings = await getSettings(createMemoryStore(seed()));
    expect(settings).toEqual({
      free_delivery_threshold: 5000,
      delivery_zone_cbd: 300,
      maintenance: true,
      zones: ['cbd', 'suburbs'],
      business_name: 'Petal Craft Blooms',
    });
  });
});
