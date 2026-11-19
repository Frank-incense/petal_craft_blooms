/**
 * Action table: ?action=<name> → handler(ctx).
 *
 * A handler returns its data (or ok(data, message)) and throws ApiError
 * for expected failures. ctx = { input, store, lock, config, now }.
 * `input` merges the query string with the JSON body (body wins),
 * matching Apps Script's `body.x || params.x`.
 */

import { ApiError } from '../envelope.js';

// Every action the Apps Script backend exposes, except `paymentCallback`
// which was removed in the v9 hotfix. Each is replaced by a real handler
// as it is ported (phases 2–4).
const NOT_YET_PORTED = [
  'getProduct', 'getProducts',
  'createOrder', 'getOrder', 'updateOrderStatus',
  'getInventory', 'getTransactions', 'restock',
  'getPayments', 'initiateStkPush',
  'getDelivery', 'listDeliveries', 'assignCourier', 'updateDeliveryStatus',
  'adminDashboard', 'adminListOrders',
];

function notImplemented(name) {
  return () => { throw new ApiError('NOT_IMPLEMENTED', 'Action not available yet: ' + name); };
}

export const actions = {
  ...Object.fromEntries(NOT_YET_PORTED.map((name) => [name, notImplemented(name)])),

  ping: (ctx) => ({ pong: true, time: ctx.now().toISOString() }),
};
