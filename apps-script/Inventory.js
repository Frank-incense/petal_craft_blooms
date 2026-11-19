/**
 * Petal Craft Blooms — Inventory module
 * Phase 6B: stock checks, decrement-with-lock, transaction log.
 *
 * Design notes:
 * - One row per tracked SKU. Products without an Inventory row are
 *   simply not tracked — orders for them are allowed.
 * - `current_qty` is a cached materialisation of the immutable
 *   Inventory_Transactions log.
 * - All writes happen inside a ScriptLock so concurrent orders
 *   can't oversell.
 */

const Inventory = {
  // ==================== PUBLIC READ ====================
  getInventory: function () {
    const rows = Utils.readAllRows(CONFIG.SHEETS.INVENTORY);
    return Utils.success(rows, 'Inventory retrieved');
  },

  getTransactions: function (sku) {
    let rows = Utils.readAllRows(CONFIG.SHEETS.INVENTORY_TRANSACTIONS);
    if (sku) {
      rows = rows.filter(function (r) { return String(r.sku) === String(sku); });
    }
    return Utils.success(rows, 'Transactions retrieved');
  },

  // ==================== INTERNAL (called under lock) ====================
  /**
   * Checks whether the given items are in stock.
   * items: [{ productId, productName, quantity }, …]
   * Returns { ok: true } or { ok: false, message, sku }.
   */
  checkAvailability: function (items) {
    const invRows = Utils.readAllRows(CONFIG.SHEETS.INVENTORY);
    const invBySku = {};
    invRows.forEach(function (r) { invBySku[String(r.sku)] = r; });

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const inv = invBySku[String(item.productId)];
      if (!inv) continue; // untracked → allow
      const available = Utils.asNumber(inv.current_qty, 0);
      if (available < item.quantity) {
        return {
          ok: false,
          sku: inv.sku,
          message: 'Insufficient stock for ' + inv.product_name +
                   ' (need ' + item.quantity + ', have ' + available + ')',
        };
      }
    }
    return { ok: true };
  },

  /**
   * Checks + decrements in one pass and writes Inventory_Transactions
   * rows. MUST be called from inside a ScriptLock.
   * items: [{ productId, productName, quantity }, …]
   */
  checkAndDecrement: function (orderNumber, items) {
    const check = Inventory.checkAvailability(items);
    if (!check.ok) return check;

    const invRows = Utils.readAllRows(CONFIG.SHEETS.INVENTORY);
    const invBySku = {};
    invRows.forEach(function (r) { invBySku[String(r.sku)] = r; });

    const now = Utils.now();

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const inv = invBySku[String(item.productId)];
      if (!inv) continue;

      const before = Utils.asNumber(inv.current_qty, 0);
      const after  = before - item.quantity;
      const status = Inventory._statusFor(after, Utils.asNumber(inv.reorder_level, 0));

      const rowNum = Utils.findRowByColumn(CONFIG.SHEETS.INVENTORY, 'sku', inv.sku);
      if (rowNum > 0) {
        Utils.updateRow(CONFIG.SHEETS.INVENTORY, rowNum, {
          sku:            inv.sku,
          product_id:     inv.product_id,
          product_name:   inv.product_name,
          current_qty:    after,
          reorder_level:  inv.reorder_level,
          supplier:       inv.supplier,
          unit_cost:      inv.unit_cost,
          last_restocked: inv.last_restocked,
          status:         status,
          updated_at:     now,
        });
      }

      Utils.appendRow(CONFIG.SHEETS.INVENTORY_TRANSACTIONS, {
        id:              Utils.generateId('invtx'),
        sku:             inv.sku,
        type:            'SALE',
        quantity_change: -item.quantity,
        qty_before:      before,
        qty_after:       after,
        order_id:        orderNumber,
        notes:           '',
        created_by:      'system',
        created_at:      now,
      });
    }

    return { ok: true };
  },

  /**
   * Admin-facing. Adds stock and logs a RESTOCK transaction.
   * Exposed in Phase 6B for testing; gated behind admin auth in Phase 14.
   */
  restock: function (sku, quantity, notes) {
    if (!sku) return Utils.error('Missing sku', 'MISSING_ID');
    const qty = Math.floor(Utils.asNumber(quantity, 0));
    if (qty <= 0) return Utils.error('Quantity must be a positive number', 'INVALID_QTY');

    const rowNum = Utils.findRowByColumn(CONFIG.SHEETS.INVENTORY, 'sku', sku);
    if (rowNum <= 0) return Utils.error('SKU not found: ' + sku, 'NOT_FOUND');

    const lock = LockService.getScriptLock();
    try { lock.waitLock(10000); }
    catch (e) { return Utils.error('Server busy, please retry', 'LOCK_TIMEOUT'); }

    try {
      const sheet = Utils.getSheet(CONFIG.SHEETS.INVENTORY);
      const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      const raw = sheet.getRange(rowNum, 1, 1, headers.length).getValues()[0];
      const row = {};
      headers.forEach(function (h, i) { row[h] = raw[i]; });

      const before = Utils.asNumber(row.current_qty, 0);
      const after  = before + qty;
      const status = Inventory._statusFor(after, Utils.asNumber(row.reorder_level, 0));
      const now    = Utils.now();

      row.current_qty    = after;
      row.status         = status;
      row.last_restocked = now;
      row.updated_at     = now;
      Utils.updateRow(CONFIG.SHEETS.INVENTORY, rowNum, row);

      Utils.appendRow(CONFIG.SHEETS.INVENTORY_TRANSACTIONS, {
        id:              Utils.generateId('invtx'),
        sku:             sku,
        type:            'RESTOCK',
        quantity_change: qty,
        qty_before:      before,
        qty_after:       after,
        order_id:        '',
        notes:           notes || '',
        created_by:      'admin',
        created_at:      now,
      });

      return Utils.success(
        { sku: sku, before: before, after: after, status: status },
        'Restocked'
      );
    } finally {
      lock.releaseLock();
    }
  },

  // ==================== HELPERS ====================
  _statusFor: function (current, reorderLevel) {
    if (current <= 0) return CONFIG.INVENTORY_STATUS.OUT_OF_STOCK;
    if (current <= reorderLevel) return CONFIG.INVENTORY_STATUS.LOW_STOCK;
    return CONFIG.INVENTORY_STATUS.IN_STOCK;
  },
};