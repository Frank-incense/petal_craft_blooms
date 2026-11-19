import { ApiError } from '../envelope.js';
import { TABLES } from '../schema.js';
import { ORDER_STATUS } from '../constants.js';
import { asString } from './coerce.js';

/** Loads an order by number or throws NOT_FOUND. */
export async function getOrderOrThrow(store, orderNumber) {
  const id = asString(orderNumber).trim();
  if (!id) throw new ApiError('MISSING_ID', 'Missing order number');
  const order = await store.find(TABLES.ORDERS, (r) => asString(r.id) === id);
  if (!order) throw new ApiError('NOT_FOUND', 'Order not found');
  return order;
}

/**
 * Sets an order's status and appends `notes` (Orders.updateOrderStatus
 * in Apps Script). Returns the updated row.
 */
export async function setOrderStatus(store, orderNumber, status, notes, nowIso) {
  if (!Object.values(ORDER_STATUS).includes(status)) {
    throw new ApiError('INVALID_STATUS', 'Invalid status: ' + status);
  }
  const order = await getOrderOrThrow(store, orderNumber);
  const patch = { status, updated_at: nowIso };
  if (notes) patch.notes = order.notes ? `${order.notes}\n${notes}` : notes;
  return store.update(TABLES.ORDERS, order.id, patch);
}
