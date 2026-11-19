/**
 * Ported from apps-script/Payments.js (read side).
 */

import { ApiError, ok } from '../envelope.js';
import { TABLES } from '../schema.js';
import { asNumber, asString } from '../lib/coerce.js';

// Public shape (getPayments is unauthenticated and polled during
// checkout). The M-Pesa checkout ID and payer phone are never exposed.
function rowToPayment(row) {
  return {
    id:           asString(row.id),
    orderNumber:  asString(row.order_id),
    amount:       asNumber(row.amount, 0),
    method:       asString(row.method),
    status:       asString(row.status),
    mpesaReceipt: asString(row.mpesa_receipt),
    resultCode:   asString(row.result_code),
    resultDesc:   asString(row.result_desc),
    createdAt:    asString(row.created_at),
    updatedAt:    asString(row.updated_at),
  };
}

export const paymentActions = {
  /**
   * checkout.js polls this and reads only payments[0], so a PAID payment
   * sorts first, then newest first. Otherwise a retry's PENDING row would
   * hide an earlier push that the customer did complete.
   */
  async getPayments(ctx) {
    const orderNumber = asString(ctx.input.orderNumber).trim();
    if (!orderNumber) throw new ApiError('MISSING_ID', 'Missing order number');

    const paidFirst = (p) => (p.status === 'PAID' ? 1 : 0);
    const payments = (await ctx.store.all(TABLES.PAYMENTS))
      .filter((r) => asString(r.order_id) === orderNumber)
      .map(rowToPayment)
      .sort((a, b) => paidFirst(b) - paidFirst(a) || timeOf(b.createdAt) - timeOf(a.createdAt));

    return ok(payments, 'Payments retrieved');
  },
};

function timeOf(s) {
  const t = new Date(s).getTime();
  return Number.isNaN(t) ? 0 : t;
}
