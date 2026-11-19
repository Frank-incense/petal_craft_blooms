/**
 * Petal Craft Blooms — Action router
 * Maps ?action=<name> to a handler. Consistent JSON envelopes.
 *
 * GET  — read-only actions. Parameters come from query string.
 * POST — write actions. Body is JSON (see README for content-type note).
 */

const Api = {
  handleGet: function (e) {
    try {
      const params = (e && e.parameter) ? e.parameter : {};
      return Api.route(params.action, params, null);
    } catch (err) {
      return Utils.error(err.message, 'UNHANDLED');
    }
  },

  handlePost: function (e) {
    try {
      const params = (e && e.parameter) ? e.parameter : {};
      let body = {};
      if (e && e.postData && e.postData.contents) {
        try { body = JSON.parse(e.postData.contents); } catch (pe) { body = {}; }
      }
      const action = body.action || params.action;
      return Api.route(action, params, body);
    } catch (err) {
      return Utils.error(err.message, 'UNHANDLED');
    }
  },

  route: function (action, params, body) {
    if (!action) return Utils.error('Missing action parameter', 'MISSING_ACTION');
    body = body || {};
    params = params || {};

    const routes = {
      // ---- Health ----
      ping: function () { return Utils.success({ pong: true, time: Utils.now() }); },

      // ---- Products ----
      getProducts: function () { return Products.getProducts(); },
      getProduct:  function () { return Products.getProduct(body.id || params.id); },

      // ---- Orders ----
      createOrder:       function () { return Orders.createOrder(body); },
      getOrder:          function () { return Orders.getOrder(body.orderNumber || params.orderNumber,
                                                              body.phone || params.phone); },
      updateOrderStatus: function () { return Orders.updateOrderStatus(body.orderNumber || params.orderNumber,
                                                                       body.status || params.status,
                                                                       body.notes); },

      // ---- Inventory ----
      getInventory:    function () { return Inventory.getInventory(); },
      getTransactions: function () { return Inventory.getTransactions(body.sku || params.sku); },
      restock:         function () { return Inventory.restock(body.sku || params.sku,
                                                              body.quantity || params.quantity,
                                                              body.notes); },

      // ---- Payments ----
      getPayments:     function () { return Payments.getByOrder(body.orderNumber || params.orderNumber); },
      // NOTE: there is deliberately no public `paymentCallback` action.
      // Payments are only marked PAID by the Daraja callback (Mpesa.handleCallback).

      // M-Pesa STK Push initiation (Phase 11A).
      // Frontend calls this right after createOrder.
      // Any client-supplied `amount` is ignored — the order's own total is charged.
      initiateStkPush: function () {
        const orderNumber = body.orderNumber || params.orderNumber;
        const phone       = body.phone       || params.phone;

        const result = Mpesa.initiateStkPush(orderNumber, phone);
        if (!result.ok) return Utils.error(result.message, result.code || 'STK_ERROR');

        // CheckoutRequestID is not returned to the client: it is the only
        // key the callback handler matches on, so keep it server-side.
        return Utils.success({
          orderNumber:       orderNumber,
          customerMessage:   result.message,
        }, 'STK Push sent');
      },

      // ---- Deliveries ----
      getDelivery:      function () { return Deliveries.getByOrder(body.orderNumber || params.orderNumber); },
      listDeliveries:   function () { return Deliveries.list(body.status || params.status); },
      assignCourier:    function () {
        var auth = Admin.requireAdmin(body.token || params.token);
        if (!auth.ok) return Utils.error(auth.message, 'UNAUTHORIZED');
        return Deliveries.assignCourier(
          body.orderNumber || params.orderNumber,
          body.courierName || params.courierName,
          body.courierPhone || params.courierPhone,
          body.notes
        );
      },
      updateDeliveryStatus: function () {
        var auth = Admin.requireAdmin(body.token || params.token);
        if (!auth.ok) return Utils.error(auth.message, 'UNAUTHORIZED');
        return Deliveries.updateStatus(
          body.orderNumber || params.orderNumber,
          body.status || params.status,
          body.notes
        );
      },

      // ---- Admin ----
      adminDashboard: function () {
        var auth = Admin.requireAdmin(body.token || params.token);
        if (!auth.ok) return Utils.error(auth.message, 'UNAUTHORIZED');
        return Admin.getDashboardMetrics();
      },
      adminListOrders: function () {
        var auth = Admin.requireAdmin(body.token || params.token);
        if (!auth.ok) return Utils.error(auth.message, 'UNAUTHORIZED');
        return Admin.listOrders(body.filters || body);
      },
    };

    const handler = routes[action];
    if (!handler) return Utils.error('Unknown action: ' + action, 'UNKNOWN_ACTION');

    return handler();
  },
};