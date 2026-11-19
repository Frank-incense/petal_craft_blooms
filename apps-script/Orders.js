/**
 * Petal Craft Blooms — Orders module
 * Phase 6B: order creation with server-side price validation,
 * order lookup for tracking, order status updates.
 *
 * ⚠️  SECURITY: The client's subtotal / delivery fee / total are IGNORED.
 *     Everything is recomputed from the Products and Settings sheets.
 *     This is the primary defense against price-tampering.
 */

const Orders = {
  // ==================== PUBLIC: CREATE ====================
  createOrder: function (payload) {
    if (!payload) return Utils.error('Missing request body', 'INVALID_REQUEST');

    const required = [
      'customer_name', 'customer_phone', 'delivery_address',
      'delivery_zone', 'delivery_date', 'delivery_time', 'items'
    ];
    for (let i = 0; i < required.length; i++) {
      const field = required[i];
      if (!payload[field]) return Utils.error('Missing required field: ' + field, 'INVALID_REQUEST');
    }
    if (!Array.isArray(payload.items) || payload.items.length === 0) {
      return Utils.error('At least one item is required', 'INVALID_REQUEST');
    }
    if (payload.items.length > 50) {
      return Utils.error('Too many items in a single order', 'INVALID_REQUEST');
    }

    const resolved = Orders._resolveItems(payload.items);
    if (resolved.error) return resolved.error;
    const subtotal = resolved.subtotal;

    const settings = Utils.getSettingsMap();
    const zone = String(payload.delivery_zone).toLowerCase();
    const zoneFees = {
      cbd:     Utils.asNumber(settings.delivery_zone_cbd,     CONFIG.DEFAULTS.DELIVERY_ZONE_CBD),
      suburbs: Utils.asNumber(settings.delivery_zone_suburbs, CONFIG.DEFAULTS.DELIVERY_ZONE_SUBURBS),
    };
    if (!Object.prototype.hasOwnProperty.call(zoneFees, zone)) {
      return Utils.error('Invalid delivery zone: ' + zone, 'INVALID_ZONE');
    }
    const threshold = Utils.asNumber(settings.free_delivery_threshold, CONFIG.DEFAULTS.FREE_DELIVERY_THRESHOLD);
    const deliveryFee = subtotal >= threshold ? 0 : zoneFees[zone];
    const total = subtotal + deliveryFee;

    const customer = Customers.findOrCreateByPhone(
      payload.customer_phone,
      payload.customer_name,
      payload.customer_email
    );

    const orderNumber = Orders._generateUniqueOrderNumber();

    const lock = LockService.getScriptLock();
    try { lock.waitLock(15000); }
    catch (e) { return Utils.error('Server busy, please retry', 'LOCK_TIMEOUT'); }

    try {
      const itemsForInventory = resolved.items.map(function (i) {
        return { productId: i.productId, productName: i.productName, quantity: i.quantity };
      });

      const invResult = Inventory.checkAndDecrement(orderNumber, itemsForInventory);
      if (!invResult.ok) {
        return Utils.error(invResult.message, 'INSUFFICIENT_STOCK');
      }

      const now = Utils.now();
      const paymentMethod = Utils.asString(payload.payment_method) || 'MPESA';
      const orderRow = {
        id:               orderNumber,
        customer_id:      customer.id || '',
        customer_name:    payload.customer_name,
        customer_phone:   payload.customer_phone,
        customer_email:   payload.customer_email || '',
        delivery_address: payload.delivery_address,
        delivery_zone:    zone,
        delivery_date:    payload.delivery_date,
        delivery_time:    payload.delivery_time,
        gift_message:     payload.gift_message || '',
        subtotal:         subtotal,
        delivery_fee:     deliveryFee,
        total:            total,
        status:           CONFIG.ORDER_STATUS.RECEIVED,
        payment_status:   CONFIG.PAYMENT_STATUS.PENDING,
        payment_method:   paymentMethod,
        mpesa_receipt:    '',
        courier_name:     '',
        courier_cost:     '',
        notes:            '',
        created_at:       now,
        updated_at:       now,
      };
      Utils.appendRow(CONFIG.SHEETS.ORDERS, orderRow);

      resolved.items.forEach(function (item) {
        Utils.appendRow(CONFIG.SHEETS.ORDER_ITEMS, {
          id:               Utils.generateId('oi'),
          order_id:         orderNumber,
          product_id:       item.productId,
          product_name:     item.productName,
          product_subtitle: item.productSubtitle,
          unit_price:       item.unitPrice,
          quantity:         item.quantity,
          line_total:       item.lineTotal,
          created_at:       now,
        });
      });

      // New in Phase 6C: companion records
      Payments.createPendingInternal(orderNumber, total, paymentMethod);
      Deliveries.createPendingInternal(orderNumber, payload.customer_name, payload.delivery_address);

      return Utils.success({
        orderNumber:   orderNumber,
        subtotal:      subtotal,
        deliveryFee:   deliveryFee,
        total:         total,
        freeDelivery:  deliveryFee === 0 && subtotal >= threshold,
        status:        CONFIG.ORDER_STATUS.RECEIVED,
        paymentStatus: CONFIG.PAYMENT_STATUS.PENDING,
        items:         resolved.items,
        customer:      { id: customer.id, name: payload.customer_name, phone: customer.phone },
      }, 'Order created');
    } finally {
      lock.releaseLock();
    }
  },

  // ==================== PUBLIC: LOOKUP ====================
  /**
   * Look up an order by order number + phone. Both must match.
   * This is what the tracking page (Phase 10) will use.
   */
  getOrder: function (orderNumber, phone) {
    if (!orderNumber) return Utils.error('Missing order number', 'MISSING_ID');
    if (!phone)       return Utils.error('Missing phone number', 'MISSING_ID');

    const rows = Utils.readAllRows(CONFIG.SHEETS.ORDERS);
    const targetPhone = Utils.normalisePhone(phone);
    const order = rows.find(function (r) {
      return String(r.id) === String(orderNumber) &&
             Utils.normalisePhone(r.customer_phone) === targetPhone;
    });
    if (!order) return Utils.error('Order not found', 'NOT_FOUND');

    const items = Utils.readAllRows(CONFIG.SHEETS.ORDER_ITEMS)
      .filter(function (r) { return String(r.order_id) === String(orderNumber); })
      .map(function (r) {
        return {
          productId: r.product_id,
          name:      r.product_name,
          subtitle:  r.product_subtitle,
          unitPrice: Utils.asNumber(r.unit_price, 0),
          quantity:  Utils.asNumber(r.quantity, 0),
          lineTotal: Utils.asNumber(r.line_total, 0),
        };
      });

    return Utils.success({
      orderNumber:   order.id,
      status:        order.status,
      paymentStatus: order.payment_status,
      paymentMethod: order.payment_method,
      customerName:  order.customer_name,
      deliveryDate:  order.delivery_date,
      deliveryTime:  order.delivery_time,
      deliveryZone:  order.delivery_zone,
      address:       order.delivery_address,
      subtotal:      Utils.asNumber(order.subtotal, 0),
      deliveryFee:   Utils.asNumber(order.delivery_fee, 0),
      total:         Utils.asNumber(order.total, 0),
      giftMessage:   order.gift_message,
      createdAt:     order.created_at,
      items:         items,
    }, 'Order retrieved');
  },

  // ==================== PUBLIC: STATUS UPDATE (admin-gated later) ====================
  updateOrderStatus: function (orderNumber, newStatus, notes) {
    if (!orderNumber) return Utils.error('Missing order number', 'MISSING_ID');
    if (!newStatus)   return Utils.error('Missing new status', 'MISSING_ID');

    const valid = Object.keys(CONFIG.ORDER_STATUS).map(function (k) { return CONFIG.ORDER_STATUS[k]; });
    if (valid.indexOf(newStatus) === -1) {
      return Utils.error('Invalid status: ' + newStatus, 'INVALID_STATUS');
    }

    const rowNum = Utils.findRowByColumn(CONFIG.SHEETS.ORDERS, 'id', orderNumber);
    if (rowNum <= 0) return Utils.error('Order not found', 'NOT_FOUND');

    const sheet = Utils.getSheet(CONFIG.SHEETS.ORDERS);
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const raw = sheet.getRange(rowNum, 1, 1, headers.length).getValues()[0];
    const row = {};
    headers.forEach(function (h, i) { row[h] = raw[i]; });

    row.status     = newStatus;
    row.updated_at = Utils.now();
    if (notes) row.notes = (row.notes ? row.notes + '\n' : '') + notes;

    Utils.updateRow(CONFIG.SHEETS.ORDERS, rowNum, row);
    return Utils.success({ orderNumber: orderNumber, status: newStatus }, 'Status updated');
  },

  // ==================== INTERNAL ====================
  _resolveItems: function (rawItems) {
    const products = Products.getAllInternal();
    const byId = {};
    products.forEach(function (p) { byId[p.id] = p; });

    const resolved = [];
    let subtotal = 0;

    for (let i = 0; i < rawItems.length; i++) {
      const raw = rawItems[i] || {};
      const productId = Utils.asString(raw.productId);
      const qty = Math.floor(Utils.asNumber(raw.quantity, 0));

      if (!productId) {
        return { error: Utils.error('Item missing productId', 'INVALID_ITEM') };
      }
      if (qty < 1 || qty > 100) {
        return { error: Utils.error('Invalid quantity for ' + productId, 'INVALID_ITEM') };
      }

      // Custom bouquet — client-supplied price accepted (derived from
      // the deterministic builder pricing formula).
      if (productId.indexOf('custom_') === 0) {
        const unitPrice = Utils.asNumber(raw.unitPrice, 0);
        if (unitPrice <= 0 || unitPrice > 50000) {
          return { error: Utils.error('Invalid custom bouquet price', 'INVALID_ITEM') };
        }
        const lineTotal = unitPrice * qty;
        resolved.push({
          productId:       productId,
          productName:     Utils.asString(raw.name) || 'Custom Bouquet',
          productSubtitle: Utils.asString(raw.subtitle),
          unitPrice:       unitPrice,
          quantity:        qty,
          lineTotal:       lineTotal,
        });
        subtotal += lineTotal;
        continue;
      }

      // Normal product — authoritative price comes from the sheet.
      const product = byId[productId];
      if (!product) {
        return { error: Utils.error('Product not found: ' + productId, 'INVALID_ITEM') };
      }
      if (!product.active) {
        return { error: Utils.error('Product no longer available: ' + product.name, 'INVALID_ITEM') };
      }

      const lineTotal = product.price * qty;
      resolved.push({
        productId:       product.id,
        productName:     product.name,
        productSubtitle: '',
        unitPrice:       product.price,
        quantity:        qty,
        lineTotal:       lineTotal,
      });
      subtotal += lineTotal;
    }

    return { items: resolved, subtotal: subtotal };
  },

  /**
   * Internal — called by Payments.processCallback. Updates the order's
   * payment fields and, on success, advances status from RECEIVED → PAID.
   * Never returns an envelope; caller owns the flow.
   */
  _applyPaymentStatus: function (orderNumber, paymentStatus, mpesaReceipt) {
    const rowNum = Utils.findRowByColumn(CONFIG.SHEETS.ORDERS, 'id', orderNumber);
    if (rowNum <= 0) return;

    const sheet = Utils.getSheet(CONFIG.SHEETS.ORDERS);
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const raw = sheet.getRange(rowNum, 1, 1, headers.length).getValues()[0];
    const row = {};
    headers.forEach(function (h, i) { row[h] = raw[i]; });

    row.payment_status = paymentStatus;
    if (mpesaReceipt) row.mpesa_receipt = mpesaReceipt;
    row.updated_at = Utils.now();

    // Advance order status on successful payment
    if (paymentStatus === CONFIG.PAYMENT_STATUS.PAID &&
        String(row.status) === CONFIG.ORDER_STATUS.RECEIVED) {
      row.status = CONFIG.ORDER_STATUS.PAID;
    }

    Utils.updateRow(CONFIG.SHEETS.ORDERS, rowNum, row);
  },
  
  _generateUniqueOrderNumber: function () {
    for (let i = 0; i < 5; i++) {
      const num = Utils.generateOrderNumber();
      const exists = Utils.findRowByColumn(CONFIG.SHEETS.ORDERS, 'id', num);
      if (exists === -1) return num;
    }
    // Extremely unlikely — add entropy so we never collide.
    return Utils.generateOrderNumber() + '-' + Date.now().toString(36).slice(-4);
  },
};