/**
 * Ported from apps-script/Orders.js (read side).
 */

import { ApiError, ok } from '../envelope.js';
import { TABLES } from '../schema.js';
import { asNumber, asString, normalisePhone } from '../lib/coerce.js';

/**
 * Finds an order by number + customer phone; both must match. Failed
 * matches count against the caller's lookup rate limit, since order
 * numbers (date + 6 digits) are guessable.
 */
export async function findCustomerOrder(ctx) {
  const orderNumber = asString(ctx.input.orderNumber).trim();
  const phone = asString(ctx.input.phone).trim();
  if (!orderNumber) throw new ApiError('MISSING_ID', 'Missing order number');
  if (!phone)       throw new ApiError('MISSING_ID', 'Missing phone number');

  const limiter = ctx.limiters.orderLookup;
  limiter.check(ctx.ip);

  const target = normalisePhone(phone);
  const order = await ctx.store.find(TABLES.ORDERS, (r) =>
    asString(r.id) === orderNumber && normalisePhone(r.customer_phone) === target);

  if (!order) {
    limiter.hit(ctx.ip);
    throw new ApiError('NOT_FOUND', 'Order not found');
  }
  return order;
}

export const orderActions = {
  async getOrder(ctx) {
    const order = await findCustomerOrder(ctx);
    const items = (await ctx.store.all(TABLES.ORDER_ITEMS))
      .filter((r) => asString(r.order_id) === asString(order.id))
      .map((r) => ({
        productId: asString(r.product_id),
        name:      asString(r.product_name),
        subtitle:  asString(r.product_subtitle),
        unitPrice: asNumber(r.unit_price, 0),
        quantity:  asNumber(r.quantity, 0),
        lineTotal: asNumber(r.line_total, 0),
      }));

    return ok({
      orderNumber:   asString(order.id),
      status:        asString(order.status),
      paymentStatus: asString(order.payment_status),
      paymentMethod: asString(order.payment_method),
      customerName:  asString(order.customer_name),
      deliveryDate:  asString(order.delivery_date),
      deliveryTime:  asString(order.delivery_time),
      deliveryZone:  asString(order.delivery_zone),
      address:       asString(order.delivery_address),
      subtotal:      asNumber(order.subtotal, 0),
      deliveryFee:   asNumber(order.delivery_fee, 0),
      total:         asNumber(order.total, 0),
      giftMessage:   asString(order.gift_message),
      createdAt:     asString(order.created_at),
      items,
    }, 'Order retrieved');
  },
};
