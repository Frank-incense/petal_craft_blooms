/**
 * Action table: ?action=<name> → handler(ctx).
 *
 * A handler returns its data (or ok(data, message)) and throws ApiError
 * for expected failures. ctx = { input, store, lock, config, now, ip, limiters }.
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

// Apps Script actions still to port (phases 3–4). `paymentCallback` was
// removed in the v9 hotfix and is not coming back.
const NOT_YET_PORTED = [
  'createOrder', 'updateOrderStatus', 'restock',
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

  ping: (ctx) => ({ pong: true, time: ctx.now().toISOString() }),
};
