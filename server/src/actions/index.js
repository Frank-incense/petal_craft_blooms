/**
 * Action table: ?action=<name> → handler(ctx).
 *
 * A handler returns its data (or ok(data, message)) and throws ApiError
 * for expected failures.
 * ctx = { input, store, lock, config, now, ip, limiters, logger, mpesa }.
 * `input` merges the query string with the JSON body (body wins),
 * matching Apps Script's `body.x || params.x`.
 *
 * Every Apps Script action is ported except `paymentCallback`, which was
 * removed in the v9 hotfix. Daraja callbacks arrive on their own route
 * (POST /mpesa/callback/<secret>, see app.js), not as an action.
 */

import { productActions } from './products.js';
import { orderActions } from './orders.js';
import { createOrderActions } from './create-order.js';
import { paymentActions } from './payments.js';
import { mpesaActions } from './mpesa.js';
import { deliveryActions } from './deliveries.js';
import { inventoryActions } from './inventory.js';
import { adminActions } from './admin.js';
import { adminWriteActions } from './admin-writes.js';

export const actions = {
  ...productActions,
  ...orderActions,
  ...createOrderActions,
  ...paymentActions,
  ...mpesaActions,
  ...deliveryActions,
  ...inventoryActions,
  ...adminActions,
  ...adminWriteActions,

  ping: (ctx) => ({ pong: true, time: ctx.now().toISOString() }),
};
