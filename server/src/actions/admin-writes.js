/**
 * Admin write actions, ported from Orders.updateOrderStatus,
 * Inventory.restock and Deliveries.assignCourier / updateStatus.
 * All require the admin token (most were open in Apps Script).
 */

import { ApiError, ok } from '../envelope.js';
import { TABLES } from '../schema.js';
import { ORDER_STATUS } from '../constants.js';
import { asNumber, asString } from '../lib/coerce.js';
import { requireAdmin } from '../auth.js';
import { getOrderOrThrow, setOrderStatus } from '../lib/orders.js';
import { generateId } from '../lib/ids.js';
import { stockStatus } from './create-order.js';
import { rowToDelivery } from './deliveries.js';

const DELIVERY_STATUSES = ['UNASSIGNED', 'ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED', 'FAILED'];

async function getDeliveryOrThrow(store, orderNumber) {
  const order = await getOrderOrThrow(store, orderNumber);
  const row = await store.find(TABLES.DELIVERIES, (r) => asString(r.order_id) === asString(order.id));
  if (!row) throw new ApiError('NOT_FOUND', 'Delivery not found');
  return row;
}

const appendNote = (existing, note) => (existing ? `${existing}\n${note}` : note);

export const adminWriteActions = {
  async updateOrderStatus(ctx) {
    requireAdmin(ctx);
    const status = asString(ctx.input.status);
    if (!status) throw new ApiError('MISSING_ID', 'Missing new status');
    const row = await ctx.lock.run(() =>
      setOrderStatus(ctx.store, ctx.input.orderNumber, status, asString(ctx.input.notes), ctx.now().toISOString()));
    return ok({ orderNumber: asString(row.id), status }, 'Status updated');
  },

  async restock(ctx) {
    requireAdmin(ctx);
    const sku = asString(ctx.input.sku).trim();
    if (!sku) throw new ApiError('MISSING_ID', 'Missing sku');
    const qty = Number(ctx.input.quantity);
    if (!Number.isInteger(qty) || qty <= 0 || qty > 100000) {
      throw new ApiError('INVALID_QTY', 'Quantity must be a positive whole number');
    }

    return ctx.lock.run(async () => {
      const inv = await ctx.store.find(TABLES.INVENTORY, (r) => asString(r.sku) === sku);
      if (!inv) throw new ApiError('NOT_FOUND', 'SKU not found: ' + sku);

      const now = ctx.now();
      const nowIso = now.toISOString();
      const before = asNumber(inv.current_qty, 0);
      const after = before + qty;
      const status = stockStatus(after, asNumber(inv.reorder_level, 0));

      await ctx.store.update(TABLES.INVENTORY, sku, { current_qty: after, status, last_restocked: nowIso, updated_at: nowIso });
      await ctx.store.insert(TABLES.INVENTORY_TRANSACTIONS, {
        id: generateId('invtx', now), sku, type: 'RESTOCK', quantity_change: qty,
        qty_before: before, qty_after: after, notes: asString(ctx.input.notes),
        created_by: 'admin', created_at: nowIso,
      });
      return ok({ sku, before, after, status }, 'Restocked');
    });
  },

  /** Reassigning an already-assigned delivery is allowed. */
  async assignCourier(ctx) {
    requireAdmin(ctx);
    const courierName = asString(ctx.input.courierName).trim();
    if (!courierName) throw new ApiError('MISSING_ID', 'Missing courier name');

    return ctx.lock.run(async () => {
      const delivery = await getDeliveryOrThrow(ctx.store, ctx.input.orderNumber);
      const nowIso = ctx.now().toISOString();
      const updated = await ctx.store.update(TABLES.DELIVERIES, delivery.id, {
        courier_name:   courierName,
        courier_phone:  asString(ctx.input.courierPhone).trim(),
        assigned_at:    nowIso,
        status:         'ASSIGNED',
        delivery_notes: asString(ctx.input.notes),
        updated_at:     nowIso,
      });
      return ok(rowToDelivery(updated), 'Courier assigned');
    });
  },

  /**
   * Also advances the order: PICKED_UP / IN_TRANSIT → OUT_FOR_DELIVERY,
   * DELIVERED → DELIVERED. FAILED leaves the order for staff to decide.
   */
  async updateDeliveryStatus(ctx) {
    requireAdmin(ctx);
    const status = asString(ctx.input.status);
    if (!DELIVERY_STATUSES.includes(status)) throw new ApiError('INVALID_STATUS', 'Invalid delivery status: ' + status);

    return ctx.lock.run(async () => {
      const delivery = await getDeliveryOrThrow(ctx.store, ctx.input.orderNumber);
      const nowIso = ctx.now().toISOString();
      const patch = { status, updated_at: nowIso };
      if (status === 'PICKED_UP') patch.picked_up_at = nowIso;
      if (status === 'DELIVERED') patch.delivered_at = nowIso;
      const notes = asString(ctx.input.notes);
      if (notes) patch.delivery_notes = appendNote(asString(delivery.delivery_notes), notes);

      const updated = await ctx.store.update(TABLES.DELIVERIES, delivery.id, patch);

      const orderStatus = status === 'PICKED_UP' || status === 'IN_TRANSIT' ? ORDER_STATUS.OUT_FOR_DELIVERY
        : status === 'DELIVERED' ? ORDER_STATUS.DELIVERED
        : null;
      if (orderStatus) await setOrderStatus(ctx.store, delivery.order_id, orderStatus, '', nowIso);

      return ok(rowToDelivery(updated), 'Delivery status updated');
    });
  },
};
