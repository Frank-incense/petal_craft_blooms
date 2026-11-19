/**
 * initiateStkPush — ported from Api.js / Mpesa.initiateStkPush.
 *
 * Changes from Apps Script:
 * - The phone charged is the order's own phone; the client's `phone` is
 *   ignored, so nobody can send payment prompts to arbitrary numbers.
 * - Every push gets a payment row that its callback can match. Apps
 *   Script only recorded the checkout ID on a PENDING row, so a retry
 *   after a failed payment could never be confirmed.
 * - Pushes are rate-limited per order.
 */

import { ApiError, ok } from '../envelope.js';
import { TABLES } from '../schema.js';
import { ORDER_STATUS, PAYMENT_STATUS } from '../constants.js';
import { asNumber, asString, normalisePhone } from '../lib/coerce.js';
import { getOrderOrThrow } from '../lib/orders.js';
import { generateId } from '../lib/ids.js';
import { missingMpesaConfig } from '../config.js';

export function callbackUrl(config) {
  return `${config.publicBaseUrl}/mpesa/callback/${config.mpesa.callbackSecret}`;
}

export const mpesaActions = {
  async initiateStkPush(ctx) {
    const missing = missingMpesaConfig(ctx.config);
    if (missing.length) {
      ctx.logger.error('[mpesa] not configured, missing: ' + missing.join(', '));
      throw new ApiError('MPESA_NOT_CONFIGURED', 'M-Pesa payments are not available right now. Please call us to complete your order.');
    }

    const order = await getOrderOrThrow(ctx.store, ctx.input.orderNumber);
    const orderNumber = asString(order.id);
    if (asString(order.payment_status) === PAYMENT_STATUS.PAID) throw new ApiError('ALREADY_PAID', 'Order already paid');
    if (asString(order.status) === ORDER_STATUS.CANCELLED) throw new ApiError('CANCELLED', 'Order is cancelled');

    const amount = Math.round(asNumber(order.total, 0));
    if (!(amount >= 1)) throw new ApiError('INVALID_AMOUNT', 'Invalid amount');
    const phone = normalisePhone(order.customer_phone);
    if (!/^254[17]\d{8}$/.test(phone)) throw new ApiError('INVALID_PHONE', 'Invalid phone number on the order');

    ctx.limiters.stkPush.check(orderNumber);
    ctx.limiters.stkPush.hit(orderNumber);

    let result;
    try {
      result = await ctx.mpesa.stkPush({
        amount,
        phone,
        // Max 12 chars, shown on the customer's M-Pesa statement.
        accountReference: 'PCB' + orderNumber.slice(-6),
        callbackUrl: callbackUrl(ctx.config),
      });
    } catch (err) {
      ctx.logger.error(`[mpesa] STK push for ${orderNumber} failed`, err);
      throw new ApiError('NETWORK', "We couldn't reach M-Pesa. Please try again.");
    }
    if (!result.accepted) throw new ApiError(result.code, result.message);

    // Record the push so its callback can find it. Under the lock so two
    // concurrent pushes can't both claim the same PENDING row.
    await ctx.lock.run(async () => {
      const nowIso = ctx.now().toISOString();
      const fields = {
        mpesa_checkout_request_id: result.checkoutRequestId,
        mpesa_merchant_request_id: result.merchantRequestId,
        mpesa_phone: phone,
        updated_at: nowIso,
      };
      // Reuse the row createOrder made, if no push has claimed it yet.
      const fresh = await ctx.store.find(TABLES.PAYMENTS, (r) =>
        asString(r.order_id) === orderNumber &&
        asString(r.status) === PAYMENT_STATUS.PENDING &&
        !asString(r.mpesa_checkout_request_id));
      if (fresh) {
        await ctx.store.update(TABLES.PAYMENTS, fresh.id, { ...fields, amount });
      } else {
        await ctx.store.insert(TABLES.PAYMENTS, {
          id: generateId('pay', ctx.now()), order_id: orderNumber, amount, method: 'MPESA',
          status: PAYMENT_STATUS.PENDING, created_at: nowIso, ...fields,
        });
      }
    });

    // The checkout ID stays server-side: it is what callbacks are matched on.
    return ok({ orderNumber, customerMessage: result.customerMessage }, 'STK Push sent');
  },
};
