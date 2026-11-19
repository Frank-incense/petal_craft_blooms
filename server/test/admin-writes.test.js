import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { makeApp, FIXED_NOW } from './helpers.js';
import { seed, ORDER_NO, OTHER_ORDER_NO } from './fixtures.js';
import { TABLES } from '../src/schema.js';

const TOKEN = 'test-admin-token';
const NOW = FIXED_NOW.toISOString();
const post = (app, body) => request(app).post('/').set('Content-Type', 'text/plain').send(JSON.stringify(body)).then((r) => r.body);
const admin = (app, body) => post(app, { token: TOKEN, ...body });

describe('admin writes require the token', () => {
  it.each(['updateOrderStatus', 'restock', 'assignCourier', 'updateDeliveryStatus'])('%s', async (action) => {
    const { app, store } = makeApp({ seed: seed() });
    const before = JSON.stringify(await store.all(TABLES.ORDERS));
    expect((await post(app, { action, orderNumber: ORDER_NO, status: 'DELIVERED', sku: 'pcb001', quantity: 5, courierName: 'X' })).code).toBe('UNAUTHORIZED');
    expect((await post(app, { action, token: 'wrong', orderNumber: ORDER_NO })).code).toBe('UNAUTHORIZED');
    expect(JSON.stringify(await store.all(TABLES.ORDERS))).toBe(before);
  });
});

describe('updateOrderStatus', () => {
  it('sets the status and appends notes', async () => {
    const { app, store } = makeApp({ seed: seed() });
    expect(await admin(app, { action: 'updateOrderStatus', orderNumber: ORDER_NO, status: 'PREPARING', notes: 'Started' })).toEqual({
      success: true, data: { orderNumber: ORDER_NO, status: 'PREPARING' }, message: 'Status updated',
    });
    await admin(app, { action: 'updateOrderStatus', orderNumber: ORDER_NO, status: 'READY', notes: 'Wrapped' });
    expect(await store.find(TABLES.ORDERS, (r) => r.id === ORDER_NO)).toMatchObject({ status: 'READY', notes: 'Started\nWrapped', updated_at: NOW });
  });

  it.each([
    [{ status: 'SHIPPED' }, 'INVALID_STATUS'],
    [{ status: '' }, 'MISSING_ID'],
    [{ orderNumber: '', status: 'READY' }, 'MISSING_ID'],
    [{ orderNumber: 'PCB-nope', status: 'READY' }, 'NOT_FOUND'],
  ])('rejects %j', async (input, code) => {
    const { app } = makeApp({ seed: seed() });
    expect((await admin(app, { action: 'updateOrderStatus', orderNumber: ORDER_NO, ...input })).code).toBe(code);
  });
});

describe('restock', () => {
  it('adds stock, updates status and logs a RESTOCK transaction', async () => {
    const { app, store } = makeApp({ seed: seed() });
    expect(await admin(app, { action: 'restock', sku: 'pcb004', quantity: 10, notes: 'From Farm A' })).toEqual({
      success: true, message: 'Restocked', data: { sku: 'pcb004', before: 0, after: 10, status: 'IN_STOCK' },
    });
    expect(await store.find(TABLES.INVENTORY, (r) => r.sku === 'pcb004')).toMatchObject({ current_qty: 10, status: 'IN_STOCK', last_restocked: NOW });
    const tx = (await store.all(TABLES.INVENTORY_TRANSACTIONS)).at(-1);
    expect(tx).toMatchObject({ sku: 'pcb004', type: 'RESTOCK', quantity_change: 10, qty_before: 0, qty_after: 10, notes: 'From Farm A', created_by: 'admin' });
  });

  it.each([
    [{ sku: '' }, 'MISSING_ID'],
    [{ quantity: 0 }, 'INVALID_QTY'],
    [{ quantity: -5 }, 'INVALID_QTY'],
    [{ quantity: 2.5 }, 'INVALID_QTY'],
    [{ quantity: 'abc' }, 'INVALID_QTY'],
    [{ sku: 'nope' }, 'NOT_FOUND'],
  ])('rejects %j', async (input, code) => {
    const { app } = makeApp({ seed: seed() });
    expect((await admin(app, { action: 'restock', sku: 'pcb001', quantity: 5, ...input })).code).toBe(code);
  });
});

describe('assignCourier', () => {
  it('assigns (and reassigns) a courier', async () => {
    const { app } = makeApp({ seed: seed() });
    const body = await admin(app, { action: 'assignCourier', orderNumber: ORDER_NO, courierName: 'Kimani Deliveries', courierPhone: '0722111222', notes: 'Fragile' });
    expect(body.data).toMatchObject({ orderNumber: ORDER_NO, courierName: 'Kimani Deliveries', courierPhone: '0722111222', status: 'ASSIGNED', assignedAt: NOW, notes: 'Fragile' });
    const again = await admin(app, { action: 'assignCourier', orderNumber: ORDER_NO, courierName: 'Boda Express' });
    expect(again.data).toMatchObject({ courierName: 'Boda Express', courierPhone: '' });
  });

  it('requires a courier name and an existing delivery', async () => {
    const { app } = makeApp({ seed: seed() });
    expect((await admin(app, { action: 'assignCourier', orderNumber: ORDER_NO })).code).toBe('MISSING_ID');
    expect((await admin(app, { action: 'assignCourier', orderNumber: 'PCB-20261101-000001', courierName: 'X' })).code).toBe('NOT_FOUND');
  });
});

describe('updateDeliveryStatus', () => {
  it.each([
    ['PICKED_UP', 'OUT_FOR_DELIVERY', { picked_up_at: NOW }],
    ['IN_TRANSIT', 'OUT_FOR_DELIVERY', {}],
    ['DELIVERED', 'DELIVERED', { delivered_at: NOW }],
    ['FAILED', 'PAID', {}], // order left alone
  ])('%s sets the order to %s', async (status, orderStatus, deliveryFields) => {
    const { app, store } = makeApp({ seed: seed() });
    expect((await admin(app, { action: 'updateDeliveryStatus', orderNumber: ORDER_NO, status })).success).toBe(true);
    expect(await store.find(TABLES.DELIVERIES, (r) => r.order_id === ORDER_NO)).toMatchObject({ status, ...deliveryFields });
    expect((await store.find(TABLES.ORDERS, (r) => r.id === ORDER_NO)).status).toBe(orderStatus);
  });

  it('appends notes', async () => {
    const { app, store } = makeApp({ seed: seed() });
    await admin(app, { action: 'updateDeliveryStatus', orderNumber: OTHER_ORDER_NO, status: 'IN_TRANSIT', notes: 'On Waiyaki Way' });
    await admin(app, { action: 'updateDeliveryStatus', orderNumber: OTHER_ORDER_NO, status: 'DELIVERED', notes: 'Left with reception' });
    expect((await store.find(TABLES.DELIVERIES, (r) => r.order_id === OTHER_ORDER_NO)).delivery_notes).toBe('On Waiyaki Way\nLeft with reception');
  });

  it('rejects an invalid status', async () => {
    const { app } = makeApp({ seed: seed() });
    expect((await admin(app, { action: 'updateDeliveryStatus', orderNumber: ORDER_NO, status: 'LOST' })).code).toBe('INVALID_STATUS');
  });
});
