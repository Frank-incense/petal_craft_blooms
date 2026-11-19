/**
 * Daraja STK callback — ported from Mpesa.handleCallback and
 * Payments.processCallback.
 *
 * Served at POST /mpesa/callback/<MPESA_CALLBACK_SECRET>; app.js checks
 * the secret before calling this. Always resolves (the route always ACKs,
 * so Daraja doesn't retry on our bugs); problems are logged.
 */

import { TABLES } from '../schema.js';
import { ORDER_STATUS, PAYMENT_STATUS } from '../constants.js';
import { asNumber, asString } from '../lib/coerce.js';

export const ACK = { ResultCode: 0, ResultDesc: 'Accepted' };

export async function processCallback({ body, store, lock, now, logger }) {
  const stk = body && body.Body && body.Body.stkCallback;
  if (!stk || typeof stk !== 'object') {
    logger.warn('[mpesa] callback with unexpected shape: ' + String(JSON.stringify(body)).slice(0, 300));
    return;
  }

  const checkoutRequestId = asString(stk.CheckoutRequestID);
  if (!checkoutRequestId) {
    logger.warn('[mpesa] callback without CheckoutRequestID — ignored');
    return;
  }

  const meta = {};
  for (const item of stk.CallbackMetadata?.Item || []) {
    if (item && item.Name) meta[item.Name] = item.Value;
  }

  await lock.run(async () => {
    const payment = await store.find(TABLES.PAYMENTS, (r) => asString(r.mpesa_checkout_request_id) === checkoutRequestId);
    if (!payment) {
      logger.error(`[mpesa] callback for unknown CheckoutRequestID ${checkoutRequestId} — reconcile manually`, JSON.stringify(stk));
      return;
    }
    // Daraja can deliver the same callback more than once.
    if (asString(payment.status) === PAYMENT_STATUS.PAID) return;

    let success = String(stk.ResultCode) === '0';
    let resultDesc = asString(stk.ResultDesc);

    // A success must be for the full amount on the payment row.
    if (success) {
      const expected = Math.round(asNumber(payment.amount, 0));
      const paid = Number(meta.Amount);
      if (!Number.isFinite(paid) || Math.round(paid) !== expected) {
        logger.error(`[mpesa] amount mismatch for ${payment.order_id}: paid ${meta.Amount}, expected ${expected}`);
        success = false;
        resultDesc = `Amount mismatch: paid ${meta.Amount}, expected ${expected}`;
      }
    }

    const nowIso = now().toISOString();
    const receipt = asString(meta.MpesaReceiptNumber);
    await store.update(TABLES.PAYMENTS, payment.id, {
      status:        success ? PAYMENT_STATUS.PAID : PAYMENT_STATUS.FAILED,
      mpesa_receipt: receipt || asString(payment.mpesa_receipt),
      result_code:   asString(stk.ResultCode),
      result_desc:   resultDesc,
      raw_response:  JSON.stringify(body).slice(0, 5000),
      updated_at:    nowIso,
    });

    const order = await store.find(TABLES.ORDERS, (r) => asString(r.id) === asString(payment.order_id));
    if (!order) {
      logger.error(`[mpesa] payment ${payment.id} references missing order ${payment.order_id}`);
      return;
    }

    if (success) {
      const patch = { payment_status: PAYMENT_STATUS.PAID, mpesa_receipt: receipt, updated_at: nowIso };
      if (asString(order.status) === ORDER_STATUS.RECEIVED) patch.status = ORDER_STATUS.PAID;
      await store.update(TABLES.ORDERS, order.id, patch);
    } else if (asString(order.payment_status) !== PAYMENT_STATUS.PAID) {
      // A late failure for an earlier push must not undo a later success
      // (Apps Script set FAILED unconditionally).
      await store.update(TABLES.ORDERS, order.id, { payment_status: PAYMENT_STATUS.FAILED, updated_at: nowIso });
    }
  });
}
