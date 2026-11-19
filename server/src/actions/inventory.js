/**
 * Ported from apps-script/Inventory.js (read side). Both actions were
 * unauthenticated in Apps Script; they now require the admin token.
 */

import { ok } from '../envelope.js';
import { TABLES } from '../schema.js';
import { asString } from '../lib/coerce.js';
import { requireAdmin } from '../auth.js';

export const inventoryActions = {
  async getInventory(ctx) {
    requireAdmin(ctx);
    return ok(await ctx.store.all(TABLES.INVENTORY), 'Inventory retrieved');
  },

  async getTransactions(ctx) {
    requireAdmin(ctx);
    const sku = asString(ctx.input.sku);
    let rows = await ctx.store.all(TABLES.INVENTORY_TRANSACTIONS);
    if (sku) rows = rows.filter((r) => asString(r.sku) === sku);
    return ok(rows, 'Transactions retrieved');
  },
};
