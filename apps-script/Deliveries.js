/**
 * Petal Craft Blooms — Deliveries module
 * Phase 6C: one row per order, tracks courier + fulfilment stages.
 *
 * Status vocabulary:
 *   UNASSIGNED → ASSIGNED → PICKED_UP → IN_TRANSIT → DELIVERED
 *                                                 ↘ FAILED
 *
 * The tracking page (Phase 10) reads this alongside Orders.status.
 */

const Deliveries = {
  // ==================== PUBLIC READ ====================
  getByOrder: function (orderNumber) {
    if (!orderNumber) return Utils.error('Missing order number', 'MISSING_ID');
    const rows = Utils.readAllRows(CONFIG.SHEETS.DELIVERIES);
    const match = rows.find(function (r) { return String(r.order_id) === String(orderNumber); });
    if (!match) return Utils.error('Delivery not found', 'NOT_FOUND');
    return Utils.success(Deliveries._rowToDelivery(match), 'Delivery retrieved');
  },

  list: function (status) {
    let rows = Utils.readAllRows(CONFIG.SHEETS.DELIVERIES);
    if (status) {
      rows = rows.filter(function (r) { return String(r.status) === String(status); });
    }
    return Utils.success(rows.map(Deliveries._rowToDelivery), 'Deliveries retrieved');
  },

  // ==================== INTERNAL: CREATE ====================
  /**
   * Creates an UNASSIGNED delivery for an order. Called from Orders on
   * order creation. Never returns an envelope.
   */
  createPendingInternal: function (orderNumber, recipientName, deliveryAddress) {
    const now = Utils.now();
    const row = {
      id:              Utils.generateId('del'),
      order_id:        orderNumber,
      courier_name:    '',
      courier_phone:   '',
      assigned_at:     '',
      picked_up_at:    '',
      delivered_at:    '',
      status:          'UNASSIGNED',
      delivery_notes:  '',
      recipient_name:  recipientName || '',
      created_at:      now,
      updated_at:      now,
    };
    Utils.appendRow(CONFIG.SHEETS.DELIVERIES, row);
    return row;
  },

  // ==================== PUBLIC: ADMIN OPERATIONS ====================
  /**
   * Assign a courier. Idempotent — updating the courier on an already
   * assigned delivery is allowed (reassignment).
   */
  assignCourier: function (orderNumber, courierName, courierPhone, notes) {
    if (!orderNumber)  return Utils.error('Missing order number', 'MISSING_ID');
    if (!courierName)  return Utils.error('Missing courier name', 'MISSING_ID');

    const rowNum = Utils.findRowByColumn(CONFIG.SHEETS.DELIVERIES, 'order_id', orderNumber);
    if (rowNum <= 0) return Utils.error('Delivery not found', 'NOT_FOUND');

    const updated = Deliveries._mergeRow(rowNum, {
      courier_name:   courierName,
      courier_phone:  courierPhone || '',
      assigned_at:    Utils.now(),
      status:         'ASSIGNED',
      delivery_notes: notes || '',
      updated_at:     Utils.now(),
    });

    return Utils.success(Deliveries._rowToDelivery(updated), 'Courier assigned');
  },

  /**
   * Advance a delivery's status. Also advances the parent order:
   *   PICKED_UP / IN_TRANSIT → order OUT_FOR_DELIVERY
   *   DELIVERED              → order DELIVERED
   *   FAILED                 → order untouched (admin decides)
   */
  updateStatus: function (orderNumber, status, notes) {
    if (!orderNumber) return Utils.error('Missing order number', 'MISSING_ID');
    const valid = ['UNASSIGNED', 'ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED', 'FAILED'];
    if (valid.indexOf(status) === -1) {
      return Utils.error('Invalid delivery status: ' + status, 'INVALID_STATUS');
    }

    const rowNum = Utils.findRowByColumn(CONFIG.SHEETS.DELIVERIES, 'order_id', orderNumber);
    if (rowNum <= 0) return Utils.error('Delivery not found', 'NOT_FOUND');

    const patch = {
      status:     status,
      updated_at: Utils.now(),
    };
    if (status === 'PICKED_UP')  patch.picked_up_at = Utils.now();
    if (status === 'DELIVERED')  patch.delivered_at = Utils.now();
    if (notes) {
      const current = Deliveries._readRowByNumber(rowNum);
      patch.delivery_notes = (current.delivery_notes ? current.delivery_notes + '\n' : '') + notes;
    }

    const updated = Deliveries._mergeRow(rowNum, patch);

    // Parent order status synchronisation
    if (status === 'PICKED_UP' || status === 'IN_TRANSIT') {
      Orders.updateOrderStatus(orderNumber, CONFIG.ORDER_STATUS.OUT_FOR_DELIVERY, '');
    } else if (status === 'DELIVERED') {
      Orders.updateOrderStatus(orderNumber, CONFIG.ORDER_STATUS.DELIVERED, '');
    }

    return Utils.success(Deliveries._rowToDelivery(updated), 'Delivery status updated');
  },

  // ==================== HELPERS ====================
  _readRowByNumber: function (rowNum) {
    const sheet = Utils.getSheet(CONFIG.SHEETS.DELIVERIES);
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const raw = sheet.getRange(rowNum, 1, 1, headers.length).getValues()[0];
    const row = {};
    headers.forEach(function (h, i) { row[h] = raw[i]; });
    return row;
  },

  _mergeRow: function (rowNum, patch) {
    const current = Deliveries._readRowByNumber(rowNum);
    const updated = Object.assign({}, current, patch);
    Utils.updateRow(CONFIG.SHEETS.DELIVERIES, rowNum, updated);
    return updated;
  },

  _rowToDelivery: function (row) {
    return {
      id:             Utils.asString(row.id),
      orderNumber:    Utils.asString(row.order_id),
      courierName:    Utils.asString(row.courier_name),
      courierPhone:   Utils.asString(row.courier_phone),
      assignedAt:     Utils.asString(row.assigned_at),
      pickedUpAt:     Utils.asString(row.picked_up_at),
      deliveredAt:    Utils.asString(row.delivered_at),
      status:         Utils.asString(row.status),
      notes:          Utils.asString(row.delivery_notes),
      recipientName:  Utils.asString(row.recipient_name),
      createdAt:      Utils.asString(row.created_at),
      updatedAt:      Utils.asString(row.updated_at),
    };
  },
};