/**
 * Petal Craft Blooms — Admin module
 * Phase 6C: dashboard metrics + admin auth stub.
 *
 * ⚠️  The auth stub in this phase accepts ANY request. Phase 14
 *     replaces `requireAdmin()` with a real password check against
 *     the Admins sheet and rejects unauthorised callers.
 *     Until then, admin endpoints are open to anyone with the URL.
 *     Do not share the deployment URL publicly before Phase 14.
 */

const Admin = {
  // ==================== AUTH STUB (Phase 14 replaces) ====================
  requireAdmin: function (token) {
    // Phase 14: validate `token` against the Admins sheet.
    // For now, accept everything and log a warning so it's obvious
    // in the Apps Script execution logs that this is not yet secure.
    Logger.log('⚠️ Admin.requireAdmin called without enforcement — Phase 14 will gate this.');
    return { ok: true, role: 'OWNER' };
  },

  // ==================== DASHBOARD ====================
  getDashboardMetrics: function () {
    const orders = Utils.readAllRows(CONFIG.SHEETS.ORDERS);
    const inventory = Utils.readAllRows(CONFIG.SHEETS.INVENTORY);
    const deliveries = Utils.readAllRows(CONFIG.SHEETS.DELIVERIES);

    const todayStr = Admin._todayString();

    let todayOrders = 0;
    let todayRevenue = 0;
    let pendingOrders = 0;
    let outForDelivery = 0;

    orders.forEach(function (o) {
      const created = Admin._dateOnly(o.created_at);
      const status = String(o.status || '');
      const paymentStatus = String(o.payment_status || '');

      if (created === todayStr) {
        todayOrders++;
        // Revenue counts paid orders only.
        if (paymentStatus === CONFIG.PAYMENT_STATUS.PAID) {
          todayRevenue += Utils.asNumber(o.total, 0);
        }
      }
      if (status === CONFIG.ORDER_STATUS.RECEIVED || status === CONFIG.ORDER_STATUS.PAID ||
          status === CONFIG.ORDER_STATUS.PREPARING || status === CONFIG.ORDER_STATUS.READY) {
        pendingOrders++;
      }
      if (status === CONFIG.ORDER_STATUS.OUT_FOR_DELIVERY) {
        outForDelivery++;
      }
    });

    const lowStock = inventory.filter(function (i) {
      return String(i.status) === CONFIG.INVENTORY_STATUS.LOW_STOCK;
    }).length;

    const outOfStock = inventory.filter(function (i) {
      return String(i.status) === CONFIG.INVENTORY_STATUS.OUT_OF_STOCK;
    }).length;

    return Utils.success({
      today: {
        orders:  todayOrders,
        revenue: todayRevenue,
        currency: CONFIG.DEFAULTS.CURRENCY,
      },
      pendingOrders:    pendingOrders,
      outForDelivery:   outForDelivery,
      lowStock:         lowStock,
      outOfStock:       outOfStock,
      deliveriesPending: deliveries.filter(function (d) {
        return String(d.status) === 'UNASSIGNED';
      }).length,
      generatedAt: Utils.now(),
    }, 'Metrics retrieved');
  },

  // ==================== LIST ORDERS (for admin dashboard) ====================
  /**
   * Returns a compact list of orders. Supports filtering by status,
   * payment status, and a search term (order number or phone).
   *
   * NOTE: Default limit is 100 to keep the payload small. Add `limit`
   * to override (max 500).
   */
  listOrders: function (filters) {
    filters = filters || {};
    const orders = Utils.readAllRows(CONFIG.SHEETS.ORDERS);

    const search = Utils.asString(filters.search).trim().toLowerCase();
    const statusFilter = Utils.asString(filters.status);
    const paymentFilter = Utils.asString(filters.paymentStatus);

    let filtered = orders.filter(function (o) {
      if (statusFilter && String(o.status) !== statusFilter) return false;
      if (paymentFilter && String(o.payment_status) !== paymentFilter) return false;
      if (search) {
        const haystack = (
          Utils.asString(o.id) + ' ' +
          Utils.asString(o.customer_phone) + ' ' +
          Utils.asString(o.customer_name)
        ).toLowerCase();
        if (haystack.indexOf(search) === -1) return false;
      }
      return true;
    });

    // Newest first
    filtered.sort(function (a, b) {
      return new Date(b.created_at) - new Date(a.created_at);
    });

    const limit = Math.min(500, Math.max(1, Utils.asNumber(filters.limit, 100)));
    const total = filtered.length;
    filtered = filtered.slice(0, limit);

    const compact = filtered.map(function (o) {
      return {
        orderNumber:   Utils.asString(o.id),
        customerName:  Utils.asString(o.customer_name),
        customerPhone: Utils.asString(o.customer_phone),
        zone:          Utils.asString(o.delivery_zone),
        deliveryDate:  Utils.asString(o.delivery_date),
        total:         Utils.asNumber(o.total, 0),
        status:        Utils.asString(o.status),
        paymentStatus: Utils.asString(o.payment_status),
        createdAt:     Utils.asString(o.created_at),
      };
    });

    return Utils.success({ total: total, returned: compact.length, orders: compact }, 'Orders retrieved');
  },

  // ==================== HELPERS ====================
  _todayString: function () {
    const d = new Date();
    return d.getFullYear() + '-' +
           String(d.getMonth() + 1).padStart(2, '0') + '-' +
           String(d.getDate()).padStart(2, '0');
  },

  _dateOnly: function (value) {
    if (!value) return '';
    // Sheets may store ISO strings or Date objects
    if (value instanceof Date) {
      return value.getFullYear() + '-' +
             String(value.getMonth() + 1).padStart(2, '0') + '-' +
             String(value.getDate()).padStart(2, '0');
    }
    const s = String(value);
    // ISO 8601 → first 10 chars
    if (s.indexOf('T') > 0) return s.slice(0, 10);
    return s.slice(0, 10);
  },
};