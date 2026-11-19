/**
 * createOrder — ported from Orders.createOrder in apps-script/Orders.js.
 *
 * Every price is computed here: catalogue prices come from the Products
 * tab, custom bouquets are priced by lib/bouquet.js, and delivery fees
 * come from Settings. Client-supplied prices and totals are ignored.
 *
 * Write order (Sheets has no transactions, so a failure part-way leaves
 * partial data; the order is chosen to keep that harmless):
 *   1. customer          — reusable, harmless if the rest fails
 *   2. order items       — orphaned rows if step 3 fails, never shown
 *   3. order row         — the commit point; from here we report success
 *   4. payment, delivery, inventory — best effort, failures are logged
 *      for staff to fix rather than failing an order that now exists
 */

import { ApiError, ok } from '../envelope.js';
import { TABLES } from '../schema.js';
import { ORDER_STATUS, PAYMENT_STATUS, INVENTORY_STATUS } from '../constants.js';
import { asNumber, asString, normalisePhone } from '../lib/coerce.js';
import { nairobiDate } from '../lib/time.js';
import { getSettings } from '../lib/settings.js';
import { priceBouquet } from '../lib/bouquet.js';
import { generateId, generateOrderNumber } from '../lib/ids.js';

const DEFAULT_FEES = { cbd: 300, suburbs: 500 };
const DEFAULT_FREE_DELIVERY_THRESHOLD = 5000;
const MAX_LINES = 50;
const MAX_QTY = 100;
const MAX_DAYS_AHEAD = 90;

const LIMITS = {
  customer_name: 100,
  customer_email: 254,
  delivery_address: 500,
  delivery_time: 50,
  gift_message: 200,
};

export const createOrderActions = {
  async createOrder(ctx) {
    ctx.limiters.orderCreate.check(ctx.ip);
    const input = validate(ctx.input, ctx.now());
    ctx.limiters.orderCreate.hit(ctx.ip);

    return ctx.lock.run(async () => {
      const { store, now: clock } = ctx;
      const now = clock();
      const nowIso = now.toISOString();

      const [products, settings] = await Promise.all([store.all(TABLES.PRODUCTS), getSettings(store)]);
      const { items, subtotal } = resolveItems(input.items, products);

      const fees = {
        cbd:     asNumber(settings.delivery_zone_cbd, DEFAULT_FEES.cbd),
        suburbs: asNumber(settings.delivery_zone_suburbs, DEFAULT_FEES.suburbs),
      };
      if (!Object.hasOwn(fees, input.zone)) throw new ApiError('INVALID_ZONE', 'Invalid delivery zone: ' + input.zone);
      const threshold = asNumber(settings.free_delivery_threshold, DEFAULT_FREE_DELIVERY_THRESHOLD);
      const deliveryFee = subtotal >= threshold ? 0 : fees[input.zone];
      const total = subtotal + deliveryFee;

      // Stock is checked under the lock, before anything is written.
      const inventoryPlan = await planInventory(store, items);

      const customer = await findOrCreateCustomer(store, input, nowIso, now);
      const orderNumber = await uniqueOrderNumber(store, now);

      await store.insertMany(TABLES.ORDER_ITEMS, items.map((item) => ({
        id:               generateId('oi', now),
        order_id:         orderNumber,
        product_id:       item.productId,
        product_name:     item.productName,
        product_subtitle: item.productSubtitle,
        unit_price:       item.unitPrice,
        quantity:         item.quantity,
        line_total:       item.lineTotal,
        created_at:       nowIso,
      })));

      await store.insert(TABLES.ORDERS, {
        id:               orderNumber,
        customer_id:      customer.id,
        customer_name:    input.name,
        customer_phone:   input.phone,
        customer_email:   input.email,
        delivery_address: input.address,
        delivery_zone:    input.zone,
        delivery_date:    input.date,
        delivery_time:    input.time,
        gift_message:     input.giftMessage,
        subtotal,
        delivery_fee:     deliveryFee,
        total,
        status:           ORDER_STATUS.RECEIVED,
        payment_status:   PAYMENT_STATUS.PENDING,
        payment_method:   'MPESA',
        created_at:       nowIso,
        updated_at:       nowIso,
      });

      // ---- The order exists. Companion records are best effort. ----
      const bestEffort = async (what, fn) => {
        try { await fn(); } catch (err) {
          ctx.logger.error(`[createOrder] ${orderNumber}: failed to write ${what} — fix in the sheet`, err);
        }
      };

      await bestEffort('payment row', () => store.insert(TABLES.PAYMENTS, {
        id: generateId('pay', now), order_id: orderNumber, amount: total, method: 'MPESA',
        status: PAYMENT_STATUS.PENDING, created_at: nowIso, updated_at: nowIso,
      }));
      await bestEffort('delivery row', () => store.insert(TABLES.DELIVERIES, {
        id: generateId('del', now), order_id: orderNumber, status: 'UNASSIGNED',
        recipient_name: input.name, created_at: nowIso, updated_at: nowIso,
      }));
      await bestEffort('inventory', () => applyInventory(store, inventoryPlan, orderNumber, nowIso, now));

      return ok({
        orderNumber,
        subtotal,
        deliveryFee,
        total,
        freeDelivery:  deliveryFee === 0,
        status:        ORDER_STATUS.RECEIVED,
        paymentStatus: PAYMENT_STATUS.PENDING,
        items,
        customer:      { id: customer.id, name: input.name, phone: customer.phone },
      }, 'Order created');
    });
  },
};

// ==================== VALIDATION ====================

function validate(raw, now) {
  const bad = (msg) => new ApiError('INVALID_REQUEST', msg);
  const str = (key) => asString(raw[key]).trim();

  for (const field of ['customer_name', 'customer_phone', 'delivery_address', 'delivery_zone', 'delivery_date', 'delivery_time']) {
    if (!str(field)) throw bad('Missing required field: ' + field);
  }
  for (const [field, max] of Object.entries(LIMITS)) {
    if (str(field).length > max) throw bad(`${field} is too long (max ${max} characters)`);
  }

  const phone = str('customer_phone');
  if (!/^254[17]\d{8}$/.test(normalisePhone(phone))) throw bad('Invalid phone number');

  const email = str('customer_email');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw bad('Invalid email address');

  const date = str('delivery_date');
  if (!isCalendarDate(date)) throw bad('Invalid delivery date');
  // One day of slack: the date picker's minimum uses the customer's local
  // date, which can be a day behind Nairobi for customers abroad.
  const day = 24 * 60 * 60 * 1000;
  if (date < nairobiDate(new Date(now.getTime() - day)) || date > nairobiDate(new Date(now.getTime() + MAX_DAYS_AHEAD * day))) {
    throw bad('Delivery date is out of range');
  }

  const method = str('payment_method');
  if (method && method !== 'MPESA') throw bad('Unsupported payment method');

  if (!Array.isArray(raw.items) || raw.items.length === 0) throw bad('At least one item is required');
  if (raw.items.length > MAX_LINES) throw bad('Too many items in a single order');

  return {
    name: str('customer_name'),
    phone,
    email,
    address: str('delivery_address'),
    zone: str('delivery_zone').toLowerCase(),
    date,
    time: str('delivery_time'),
    giftMessage: str('gift_message'),
    items: raw.items,
  };
}

// Date.parse accepts 2026-02-30 (it rolls over to March), so round-trip.
function isCalendarDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

// ==================== PRICING ====================

function resolveItems(rawItems, productRows) {
  const byId = new Map(productRows.map((p) => [asString(p.id), p]));
  const items = [];
  let subtotal = 0;

  for (const raw of rawItems) {
    const item = raw && typeof raw === 'object' ? raw : {};
    const productId = asString(item.productId);
    const qty = Number(item.quantity);

    if (!productId) throw new ApiError('INVALID_ITEM', 'Item missing productId');
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) {
      throw new ApiError('INVALID_ITEM', 'Invalid quantity for ' + productId);
    }

    let resolved;
    if (productId.startsWith('custom_')) {
      const { unitPrice, subtitle } = priceBouquet(item.custom);
      resolved = { productId, productName: 'Custom Bouquet', productSubtitle: subtitle, unitPrice };
    } else {
      const p = byId.get(productId);
      if (!p) throw new ApiError('INVALID_ITEM', 'Product not found: ' + productId);
      if (!isActive(p)) throw new ApiError('INVALID_ITEM', 'Product no longer available: ' + asString(p.name));
      const unitPrice = asNumber(p.price, NaN);
      if (!(unitPrice > 0)) throw new ApiError('INVALID_ITEM', 'Product has no price: ' + asString(p.name));
      resolved = { productId, productName: asString(p.name), productSubtitle: '', unitPrice };
    }

    const lineTotal = resolved.unitPrice * qty;
    items.push({ ...resolved, quantity: qty, lineTotal });
    subtotal += lineTotal;
  }
  return { items, subtotal };
}

function isActive(p) {
  const s = String(p.active).toLowerCase();
  return p.active === true || s === 'true' || s === '1' || s === 'yes';
}

// ==================== INVENTORY ====================

/**
 * Products without an Inventory row are untracked and always allowed.
 * Quantities are summed per product first — Apps Script checked each
 * line separately, so two lines of one product could oversell.
 */
async function planInventory(store, items) {
  const needed = new Map();
  for (const item of items) needed.set(item.productId, (needed.get(item.productId) || 0) + item.quantity);

  const rows = await store.all(TABLES.INVENTORY);
  const bySku = new Map(rows.map((r) => [asString(r.sku), r]));
  const plan = [];

  for (const [productId, qty] of needed) {
    const inv = bySku.get(productId);
    if (!inv) continue;
    const before = asNumber(inv.current_qty, 0);
    if (before < qty) {
      throw new ApiError('INSUFFICIENT_STOCK',
        `Insufficient stock for ${asString(inv.product_name) || productId} (need ${qty}, have ${before})`);
    }
    plan.push({ sku: asString(inv.sku), before, after: before - qty, qty, reorderLevel: asNumber(inv.reorder_level, 0) });
  }
  return plan;
}

async function applyInventory(store, plan, orderNumber, nowIso, now) {
  for (const p of plan) {
    await store.update(TABLES.INVENTORY, p.sku, {
      current_qty: p.after,
      status: stockStatus(p.after, p.reorderLevel),
      updated_at: nowIso,
    });
  }
  if (plan.length) {
    await store.insertMany(TABLES.INVENTORY_TRANSACTIONS, plan.map((p) => ({
      id: generateId('invtx', now), sku: p.sku, type: 'SALE', quantity_change: -p.qty,
      qty_before: p.before, qty_after: p.after, order_id: orderNumber,
      created_by: 'system', created_at: nowIso,
    })));
  }
}

export function stockStatus(qty, reorderLevel) {
  if (qty <= 0) return INVENTORY_STATUS.OUT_OF_STOCK;
  if (qty <= reorderLevel) return INVENTORY_STATUS.LOW_STOCK;
  return INVENTORY_STATUS.IN_STOCK;
}

// ==================== CUSTOMERS / ORDER NUMBERS ====================

/** Phone is the identity; name and email are kept current. */
async function findOrCreateCustomer(store, input, nowIso, now) {
  const target = normalisePhone(input.phone);
  const existing = await store.find(TABLES.CUSTOMERS, (r) => normalisePhone(r.phone) === target);

  if (existing) {
    const patch = {};
    if (input.name && input.name !== asString(existing.full_name)) patch.full_name = input.name;
    if (input.email && input.email !== asString(existing.email)) patch.email = input.email;
    if (Object.keys(patch).length) {
      patch.updated_at = nowIso;
      return (await store.update(TABLES.CUSTOMERS, existing.id, patch)) || existing;
    }
    return existing;
  }

  return store.insert(TABLES.CUSTOMERS, {
    id: generateId('cust', now), full_name: input.name, phone: input.phone,
    email: input.email, created_at: nowIso, updated_at: nowIso,
  });
}

async function uniqueOrderNumber(store, now) {
  const taken = new Set((await store.all(TABLES.ORDERS)).map((o) => asString(o.id)));
  for (let i = 0; i < 20; i++) {
    const n = generateOrderNumber(now);
    if (!taken.has(n)) return n;
  }
  throw new Error('Could not generate a unique order number');
}
