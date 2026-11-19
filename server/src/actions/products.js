/**
 * Ported from apps-script/Products.js.
 */

import { ApiError, ok } from '../envelope.js';
import { TABLES } from '../schema.js';
import { asNumber, asString, parseBool } from '../lib/coerce.js';

/** Public product shape. Must match what src/js/products.js expects. */
export function rowToProduct(row) {
  return {
    id:          asString(row.id),
    name:        asString(row.name),
    slug:        asString(row.slug),
    description: asString(row.description),
    category:    asString(row.category),
    occasion:    asString(row.occasion),
    price:       asNumber(row.price, 0),
    image:       asString(row.image),
    rating:      asNumber(row.rating, 0),
    featured:    parseBool(row.featured),
    active:      parseBool(row.active),
  };
}

export const productActions = {
  async getProducts(ctx) {
    const rows = await ctx.store.all(TABLES.PRODUCTS);
    const products = rows.map(rowToProduct).filter((p) => p.active);
    return ok(products, 'Products retrieved');
  },

  async getProduct(ctx) {
    const id = asString(ctx.input.id);
    if (!id) throw new ApiError('MISSING_ID', 'Missing product id');
    const row = await ctx.store.find(TABLES.PRODUCTS, (r) => asString(r.id) === id);
    if (!row) throw new ApiError('NOT_FOUND', 'Product not found');
    return ok(rowToProduct(row), 'Product retrieved');
  },
};
