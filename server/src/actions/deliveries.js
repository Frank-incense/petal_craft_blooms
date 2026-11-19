/**
 * Ported from apps-script/Deliveries.js (read side).
 */

import { ApiError, ok } from '../envelope.js';
import { TABLES } from '../schema.js';
import { asString } from '../lib/coerce.js';
import { requireAdmin } from '../auth.js';
import { findCustomerOrder } from './orders.js';

export function rowToDelivery(row) {
  return {
    id:            asString(row.id),
    orderNumber:   asString(row.order_id),
    courierName:   asString(row.courier_name),
    courierPhone:  asString(row.courier_phone),
    assignedAt:    asString(row.assigned_at),
    pickedUpAt:    asString(row.picked_up_at),
    deliveredAt:   asString(row.delivered_at),
    status:        asString(row.status),
    notes:         asString(row.delivery_notes),
    recipientName: asString(row.recipient_name),
    createdAt:     asString(row.created_at),
    updatedAt:     asString(row.updated_at),
  };
}

export const deliveryActions = {
  /**
   * Changed from Apps Script: now needs the customer's phone, like
   * getOrder, so courier details and recipient names can't be read by
   * guessing order numbers. (tracking.js sends it.)
   */
  async getDelivery(ctx) {
    const order = await findCustomerOrder(ctx);
    const row = await ctx.store.find(TABLES.DELIVERIES, (r) => asString(r.order_id) === asString(order.id));
    if (!row) throw new ApiError('NOT_FOUND', 'Delivery not found');
    return ok(rowToDelivery(row), 'Delivery retrieved');
  },

  /** Admin. Was unauthenticated in Apps Script. */
  async listDeliveries(ctx) {
    requireAdmin(ctx);
    const status = asString(ctx.input.status);
    let rows = await ctx.store.all(TABLES.DELIVERIES);
    if (status) rows = rows.filter((r) => asString(r.status) === status);
    return ok(rows.map(rowToDelivery), 'Deliveries retrieved');
  },
};
