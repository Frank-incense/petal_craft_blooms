/**
 * Petal Craft Blooms — Payments module
 * Phase 6C: payment record lifecycle.
 *
 * Phase 11 will fill in the real M-Pesa Daraja integration (STK Push +
 * callback processing). This module provides the data layer those flows
 * write to, plus read endpoints the admin and tracking pages need.
 *
 * Status vocabulary (from Config):
 *   PENDING / PAID / FAILED / REFUNDED
 */

const Payments = {
  // ==================== PUBLIC READ ====================
  getByOrder: function (orderNumber) {
    if (!orderNumber) return Utils.error('Missing order number', 'MISSING_ID');

    const rows = Utils.readAllRows(CONFIG.SHEETS.PAYMENTS);
    const payments = rows
      .filter(function (r) { return String(r.order_id) === String(orderNumber); })
      .map(Payments._rowToPayment)
      .sort(function (a, b) { return new Date(b.createdAt) - new Date(a.createdAt); });

    return Utils.success(payments, 'Payments retrieved');
  },

  // ==================== INTERNAL: CREATE ====================
  /**
   * Creates a PENDING payment row for an order. Called from Orders
   * on order creation. Never returns an envelope — the caller owns
   * the transaction and will surface any errors.
   */
  createPendingInternal: function (orderNumber, amount, method) {
    const now = Utils.now();
    const row = {
      id:                          Utils.generateId('pay'),
      order_id:                    orderNumber,
      amount:                      amount,
      method:                      method || 'MPESA',
      status:                      CONFIG.PAYMENT_STATUS.PENDING,
      mpesa_checkout_request_id:   '',
      mpesa_merchant_request_id:   '',
      mpesa_receipt:               '',
      mpesa_phone:                 '',
      result_code:                 '',
      result_desc:                 '',
      raw_response:                '',
      created_at:                  now,
      updated_at:                  now,
    };
    Utils.appendRow(CONFIG.SHEETS.PAYMENTS, row);
    return row;
  },

  // ==================== INTERNAL: STK PUSH REQUEST (Phase 11 will use) ====================
  /**
   * Records that an STK Push has been initiated. The real HTTP request
   * to Daraja is added in Phase 11 — this is the data bookkeeping half.
   */
  recordStkPushRequested: function (orderNumber, checkoutRequestId, merchantRequestId, phone) {
    const rowNum = Payments._findLatestPendingByOrder(orderNumber);
    if (rowNum <= 0) return Utils.error('No pending payment for order', 'NOT_FOUND');

    const sheet = Utils.getSheet(CONFIG.SHEETS.PAYMENTS);
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const raw = sheet.getRange(rowNum, 1, 1, headers.length).getValues()[0];
    const row = {};
    headers.forEach(function (h, i) { row[h] = raw[i]; });

    row.mpesa_checkout_request_id = checkoutRequestId || '';
    row.mpesa_merchant_request_id = merchantRequestId || '';
    row.mpesa_phone               = phone || '';
    row.updated_at                = Utils.now();

    Utils.updateRow(CONFIG.SHEETS.PAYMENTS, rowNum, row);
    return Utils.success({ orderNumber: orderNumber, checkoutRequestId: checkoutRequestId }, 'STK push recorded');
  },

  // ==================== PUBLIC: CALLBACK (Phase 11 will drive this) ====================
  /**
   * Called from the Daraja callback handler in Phase 11.
   * Updates the payment record and — on success — flips the order to PAID.
   * Idempotent: re-playing the same successful callback is a no-op.
   *
   * payload: {
   *   orderNumber,      // we include this via the callback URL
   *   checkoutRequestId,
   *   resultCode,       // '0' = success (Daraja convention)
   *   resultDesc,
   *   mpesaReceipt,     // receipt number on success
   *   rawResponse,      // full callback body
   * }
   */
  processCallback: function (payload) {
    if (!payload) return Utils.error('Missing callback payload', 'INVALID_REQUEST');

    const orderNumber = payload.orderNumber;
    const checkoutRequestId = payload.checkoutRequestId;
    if (!orderNumber && !checkoutRequestId) {
      return Utils.error('Missing orderNumber or checkoutRequestId', 'INVALID_REQUEST');
    }

    const rows = Utils.readAllRows(CONFIG.SHEETS.PAYMENTS);
    let match = null;

    if (checkoutRequestId) {
      match = rows.find(function (r) {
        return String(r.mpesa_checkout_request_id) === String(checkoutRequestId);
      });
    }
    if (!match && orderNumber) {
      // Fall back to most recent PENDING payment for the order
      const pending = rows
        .filter(function (r) {
          return String(r.order_id) === String(orderNumber) &&
                 String(r.status) === CONFIG.PAYMENT_STATUS.PENDING;
        })
        .sort(function (a, b) { return new Date(b.created_at) - new Date(a.created_at); });
      match = pending[0] || null;
    }
    if (!match) return Utils.error('Payment record not found', 'NOT_FOUND');

    // Idempotency: already in a terminal state → nothing to do.
    if (String(match.status) === CONFIG.PAYMENT_STATUS.PAID) {
      return Utils.success({ orderNumber: match.order_id, status: match.status, idempotent: true }, 'Already processed');
    }

    let successCode = String(payload.resultCode) === '0';
    let resultDesc  = Utils.asString(payload.resultDesc);

    // A successful callback must be for the full amount on the payment row.
    // Anything else is treated as a failed payment and left for an admin to
    // reconcile (the receipt and raw callback are still stored).
    if (successCode) {
      const expected = Math.round(Utils.asNumber(match.amount, 0));
      const paid     = Number(payload.amount);
      if (!isFinite(paid) || Math.round(paid) !== expected) {
        Logger.log('Payment amount mismatch for ' + match.order_id +
                   ': paid ' + payload.amount + ', expected ' + expected);
        successCode = false;
        resultDesc  = 'Amount mismatch: paid ' + payload.amount + ', expected ' + expected;
      }
    }

    const newStatus = successCode ? CONFIG.PAYMENT_STATUS.PAID : CONFIG.PAYMENT_STATUS.FAILED;

    const rowNum = Utils.findRowByColumn(CONFIG.SHEETS.PAYMENTS, 'id', match.id);
    if (rowNum <= 0) return Utils.error('Payment row disappeared', 'NOT_FOUND');

    const updated = Object.assign({}, match, {
      status:          newStatus,
      mpesa_receipt:   payload.mpesaReceipt || match.mpesa_receipt || '',
      result_code:     Utils.asString(payload.resultCode),
      result_desc:     resultDesc,
      raw_response:    typeof payload.rawResponse === 'string'
                         ? payload.rawResponse
                         : JSON.stringify(payload.rawResponse || {}),
      updated_at:      Utils.now(),
    });
    Utils.updateRow(CONFIG.SHEETS.PAYMENTS, rowNum, updated);

    // On success, advance the order
    if (successCode) {
      Orders._applyPaymentStatus(match.order_id, CONFIG.PAYMENT_STATUS.PAID, updated.mpesa_receipt);
    } else {
      Orders._applyPaymentStatus(match.order_id, CONFIG.PAYMENT_STATUS.FAILED, '');
    }

    return Utils.success({
      orderNumber: match.order_id,
      status:      newStatus,
      receipt:     updated.mpesa_receipt,
    }, successCode ? 'Payment confirmed' : 'Payment failed');
  },

  // ==================== HELPERS ====================
  _findLatestPendingByOrder: function (orderNumber) {
    const rows = Utils.readAllRows(CONFIG.SHEETS.PAYMENTS);
    const pending = rows
      .filter(function (r) {
        return String(r.order_id) === String(orderNumber) &&
               String(r.status) === CONFIG.PAYMENT_STATUS.PENDING;
      })
      .sort(function (a, b) { return new Date(b.created_at) - new Date(a.created_at); });
    if (!pending.length) return -1;
    return Utils.findRowByColumn(CONFIG.SHEETS.PAYMENTS, 'id', pending[0].id);
  },

  // Public shape (getPayments is unauthenticated). The M-Pesa checkout ID
  // and payer phone are deliberately omitted.
  _rowToPayment: function (row) {
    return {
      id:                 Utils.asString(row.id),
      orderNumber:        Utils.asString(row.order_id),
      amount:             Utils.asNumber(row.amount, 0),
      method:             Utils.asString(row.method),
      status:             Utils.asString(row.status),
      mpesaReceipt:       Utils.asString(row.mpesa_receipt),
      resultCode:         Utils.asString(row.result_code),
      resultDesc:         Utils.asString(row.result_desc),
      createdAt:          Utils.asString(row.created_at),
      updatedAt:          Utils.asString(row.updated_at),
    };
  },
};