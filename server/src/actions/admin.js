/**
 * Ported from apps-script/Admin.js. Apps Script's requireAdmin() was a
 * stub that let everyone in; here every action checks the admin token.
 */

import { ok } from '../envelope.js';
import { TABLES } from '../schema.js';
import { asNumber, asString } from '../lib/coerce.js';
import { nairobiDate } from '../lib/time.js';
import { requireAdmin } from '../auth.js';
import { ORDER_STATUS, PAYMENT_STATUS, INVENTORY_STATUS } from '../constants.js';

const OPEN_STATUSES = [ORDER_STATUS.RECEIVED, ORDER_STATUS.PAID, ORDER_STATUS.PREPARING, ORDER_STATUS.READY];

export const adminActions = {
  async adminDashboard(ctx) {
    requireAdmin(ctx);
    const [orders, inventory, deliveries] = await Promise.all([
      ctx.store.all(TABLES.ORDERS),
      ctx.store.all(TABLES.INVENTORY),
      ctx.store.all(TABLES.DELIVERIES),
    ]);

    // Apps Script compared the UTC date of created_at with the local
    // date, so orders placed 00:00–03:00 EAT counted as "yesterday".
    const today = nairobiDate(ctx.now());
    let todayOrders = 0, todayRevenue = 0, pendingOrders = 0, outForDelivery = 0;

    for (const o of orders) {
      const status = asString(o.status);
      if (nairobiDate(o.created_at) === today) {
        todayOrders++;
        if (asString(o.payment_status) === PAYMENT_STATUS.PAID) todayRevenue += asNumber(o.total, 0);
      }
      if (OPEN_STATUSES.includes(status)) pendingOrders++;
      if (status === ORDER_STATUS.OUT_FOR_DELIVERY) outForDelivery++;
    }

    const countStatus = (rows, s) => rows.filter((r) => asString(r.status) === s).length;

    return ok({
      today: { orders: todayOrders, revenue: todayRevenue, currency: 'KES' },
      pendingOrders,
      outForDelivery,
      lowStock:          countStatus(inventory, INVENTORY_STATUS.LOW_STOCK),
      outOfStock:        countStatus(inventory, INVENTORY_STATUS.OUT_OF_STOCK),
      deliveriesPending: countStatus(deliveries, 'UNASSIGNED'),
      generatedAt:       ctx.now().toISOString(),
    }, 'Metrics retrieved');
  },

  /**
   * Filters: status, paymentStatus, search (order number / phone / name),
   * limit (default 100, max 500). Accepted at the top level or under
   * `filters`, as in Apps Script.
   */
  async adminListOrders(ctx) {
    requireAdmin(ctx);
    const f = (ctx.input.filters && typeof ctx.input.filters === 'object') ? ctx.input.filters : ctx.input;
    const search = asString(f.search).trim().toLowerCase();
    const status = asString(f.status);
    const paymentStatus = asString(f.paymentStatus);
    const limit = Math.min(500, Math.max(1, asNumber(f.limit, 100) || 100));

    const filtered = (await ctx.store.all(TABLES.ORDERS))
      .filter((o) => {
        if (status && asString(o.status) !== status) return false;
        if (paymentStatus && asString(o.payment_status) !== paymentStatus) return false;
        if (search) {
          const haystack = `${asString(o.id)} ${asString(o.customer_phone)} ${asString(o.customer_name)}`.toLowerCase();
          if (!haystack.includes(search)) return false;
        }
        return true;
      })
      .sort((a, b) => timeOf(b.created_at) - timeOf(a.created_at));

    const orders = filtered.slice(0, limit).map((o) => ({
      orderNumber:   asString(o.id),
      customerName:  asString(o.customer_name),
      customerPhone: asString(o.customer_phone),
      zone:          asString(o.delivery_zone),
      deliveryDate:  asString(o.delivery_date),
      total:         asNumber(o.total, 0),
      status:        asString(o.status),
      paymentStatus: asString(o.payment_status),
      createdAt:     asString(o.created_at),
    }));

    return ok({ total: filtered.length, returned: orders.length, orders }, 'Orders retrieved');
  },
};

function timeOf(s) {
  const t = new Date(s).getTime();
  return Number.isNaN(t) ? 0 : t;
}
