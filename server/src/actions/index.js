/**
 * Action table: ?action=<name> → handler(ctx).
 *
 * A handler returns its data (or ok(data, message)) and throws ApiError
 * for expected failures. ctx = { input, store, lock, config, now, ip, limiters, logger }.
 * `input` merges the query string with the JSON body (body wins),
 * matching Apps Script's `body.x || params.x`.
 */

import { ApiError } from '../envelope.js';
import { productActions } from './products.js';
import { orderActions } from './orders.js';
import { paymentActions } from './payments.js';
import { deliveryActions } from './deliveries.js';
import { inventoryActions } from './inventory.js';
import { adminActions } from './admin.js';
import { createOrderActions } from './create-order.js';

// Apps Script actions still to port in phase 4: M-Pesa, plus the admin
// writes (order status, restock, courier). `paymentCallback` was removed
// in the v9 hotfix and is not coming back.
const NOT_YET_PORTED = [
  'updateOrderStatus', 'restock',
  'initiateStkPush', 'assignCourier', 'updateDeliveryStatus',
];

function notImplemented(name) {
  return () => { throw new ApiError('NOT_IMPLEMENTED', 'Action not available yet: ' + name); };
}

export const actions = {
  ...Object.fromEntries(NOT_YET_PORTED.map((name) => [name, notImplemented(name)])),
  ...productActions,
  ...orderActions,
  ...paymentActions,
  ...deliveryActions,
  ...inventoryActions,
  ...adminActions,
  ...createOrderActions,

  ping: (ctx) => ({ pong: true, time: ctx.now().toISOString() }),
};
