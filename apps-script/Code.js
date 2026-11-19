/**
 * Petal Craft Blooms — Apps Script entry points
 * doGet / doPost route everything through Api.gs.
 *
 * Also contains one-off setup helpers you run from the editor.
 */


// ==================== ENTRY POINTS ====================
function doGet(e) {
  return Api.handleGet(e);
}

function doPost(e) {
  // Detect M-Pesa callbacks by their body shape — no query param needed
  // (Daraja rejects query strings on the callback URL).
  //
  // A Daraja STK callback looks like:
  //   { "Body": { "stkCallback": { "ResultCode": …, "CheckoutRequestID": …, … } } }
  //
  // We only look at the first ~200 chars to avoid parsing the whole
  // body when this is really an API call, and vice versa.
  const bodyText = (e && e.postData && e.postData.contents) || '';

  if (bodyText.indexOf('"stkCallback"') !== -1 && bodyText.indexOf('"Body"') !== -1) {
    return Mpesa.handleCallback(e);
  }

  return Api.handlePost(e);
}

// ==================== ONE-OFF SETUP HELPERS ====================
// Run setupSheets() ONCE from the Apps Script editor after you paste
// CONFIG.SPREADSHEET_ID. It creates any missing sheet tabs and writes
// the header row for each.

function setupSheets() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);

  const schemas = {
    Products: [
      'id', 'name', 'slug', 'description', 'category', 'occasion',
      'price', 'image', 'rating', 'featured', 'active',
      'created_at', 'updated_at'
    ],
    Orders: [
      'id', 'customer_id', 'customer_name', 'customer_phone', 'customer_email',
      'delivery_address', 'delivery_zone', 'delivery_date', 'delivery_time',
      'gift_message', 'subtotal', 'delivery_fee', 'total',
      'status', 'payment_status', 'payment_method', 'mpesa_receipt',
      'courier_name', 'courier_cost', 'notes', 'created_at', 'updated_at'
    ],
    Order_Items: [
      'id', 'order_id', 'product_id', 'product_name', 'product_subtitle',
      'unit_price', 'quantity', 'line_total', 'created_at'
    ],
    Customers: [
      'id', 'full_name', 'phone', 'email', 'password_hash', 'password_salt',
      'default_address', 'default_zone', 'created_at', 'updated_at', 'last_login'
    ],
    Inventory: [
      'sku', 'product_id', 'product_name', 'current_qty', 'reorder_level',
      'supplier', 'unit_cost', 'last_restocked', 'status', 'updated_at'
    ],
    Inventory_Transactions: [
      'id', 'sku', 'type', 'quantity_change', 'qty_before', 'qty_after',
      'order_id', 'notes', 'created_by', 'created_at'
    ],
    Payments: [
      'id', 'order_id', 'amount', 'method', 'status',
      'mpesa_checkout_request_id', 'mpesa_merchant_request_id', 'mpesa_receipt',
      'mpesa_phone', 'result_code', 'result_desc', 'raw_response',
      'created_at', 'updated_at'
    ],
    Deliveries: [
      'id', 'order_id', 'courier_name', 'courier_phone', 'assigned_at',
      'picked_up_at', 'delivered_at', 'status', 'delivery_notes',
      'recipient_name', 'created_at', 'updated_at'
    ],
    Settings: [
      'key', 'value', 'type', 'description', 'updated_at'
    ],
    Admins: [
      'email', 'full_name', 'password_hash', 'password_salt',
      'role', 'active', 'created_at', 'last_login'
    ],
  };

  Object.keys(schemas).forEach(function (name) {
    let sheet = ss.getSheetByName(name);
    if (!sheet) sheet = ss.insertSheet(name);
    const headers = schemas[name];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  });

  seedSettings();
  Logger.log('Sheets ready. Settings seeded.');
}

function seedSettings() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheet = ss.getSheetByName('Settings');
  const existing = sheet.getDataRange().getValues();
  if (existing.length > 1) {
    Logger.log('Settings already has rows — skipping seed.');
    return;
  }

  const now = new Date().toISOString();
  const rows = [
    ['free_delivery_threshold', '5000', 'number', 'Cart subtotal at/above this gets free delivery', now],
    ['delivery_zone_cbd',       '400',  'number', 'Delivery fee — Nairobi CBD (KES)', now],
    ['delivery_zone_suburbs',   '700',  'number', 'Delivery fee — Nairobi Suburbs (KES)', now],
    ['currency',                'KES',  'string', 'Store currency code', now],
    ['business_name',           'Petal Craft Blooms', 'string', 'Display name', now],
    ['support_phone',           '+254700000000', 'string', 'Customer support phone', now],
    ['support_email',           'hello@petalcraftblooms.co.ke', 'string', 'Customer support email', now],
  ];

  sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  Logger.log('Seeded ' + rows.length + ' settings rows.');
}

// ==================== SANITY TESTS FROM THE EDITOR ====================
function test_ping() {
  Logger.log(doGet({ parameter: { action: 'ping' } }).getContent());
}

function test_getProducts() {
  Logger.log(doGet({ parameter: { action: 'getProducts' } }).getContent());
}

function test_getProduct() {
  Logger.log(doGet({ parameter: { action: 'getProduct', id: 'pcb001' } }).getContent());
}

function test_createOrder() {
  const payload = {
    customer_name:    'Jane Test',
    customer_phone:   '0712345678',
    customer_email:   'jane@example.com',
    delivery_address: 'Westlands, Ring Road, Apt 4B, near Sarit Centre',
    delivery_zone:    'cbd',
    delivery_date:    '2025-09-20',
    delivery_time:    '10:00 AM – 12:00 PM',
    gift_message:     'Happy Birthday, Sarah!',
    payment_method:   'MPESA',
    items: [
      { productId: 'pcb001', quantity: 1 },
    ],
  };
  Logger.log(Orders.createOrder(payload).getContent());
}

function test_getOrder() {
  // Replace with an order number you just created
  Logger.log(Orders.getOrder('PCB-20250920-000001', '0712345678').getContent());
}

function test_restock() {
  Logger.log(Inventory.restock('pcb001', 50, 'Initial stock from supplier').getContent());
}

function test_priceTamper() {
  const payload = {
    customer_name: 'Attacker',
    customer_phone: '0700000000',
    delivery_address: 'X',
    delivery_zone: 'cbd',
    delivery_date: '2025-09-20',
    delivery_time: '10:00 AM',
    items: [{ productId: 'pcb001', quantity: 1, unitPrice: 1 }],  // ← pretend it costs 1 KES
  };
  Logger.log(Orders.createOrder(payload).getContent());
}

function test_paymentLifecycle() {
  // Simulates a successful M-Pesa callback for the most recent order.
  // Run test_createOrder first to produce an order to pay for.
  const orders = Utils.readAllRows(CONFIG.SHEETS.ORDERS);
  if (!orders.length) { Logger.log('No orders — run test_createOrder first.'); return; }
  const latest = orders[orders.length - 1];

  const callback = {
    orderNumber: latest.id,
    resultCode:  '0',
    resultDesc:  'The service request is processed successfully.',
    mpesaReceipt: 'SJL4K2M9QT',
    amount:      latest.total,
    rawResponse: { Body: { stkCallback: { ResultCode: 0 } } },
  };

  Logger.log(Payments.processCallback(callback).getContent());

  // Replaying the same callback must be a no-op (idempotency).
  Logger.log(Payments.processCallback(callback).getContent());
}

function test_assignCourier() {
  const orders = Utils.readAllRows(CONFIG.SHEETS.ORDERS);
  if (!orders.length) { Logger.log('No orders — run test_createOrder first.'); return; }
  const latest = orders[orders.length - 1];

  Logger.log(Deliveries.assignCourier(latest.id, 'Kimani Deliveries', '0722111222', 'Fragile — handle with care').getContent());
  Logger.log(Deliveries.updateStatus(latest.id, 'PICKED_UP', '').getContent());
  Logger.log(Deliveries.updateStatus(latest.id, 'DELIVERED', 'Left with receptionist').getContent());
}

function test_adminDashboard() {
  Logger.log(Admin.getDashboardMetrics().getContent());
}

function test_adminListOrders() {
  Logger.log(Admin.listOrders({ limit: 20 }).getContent());
}

// ==================== M-PESA SANITY TESTS ====================

function test_getAccessToken() {
  try {
    const t = Mpesa.getAccessToken();
    Logger.log('OK — token length ' + t.length);
    Logger.log('Cached? ' + Mpesa.getAccessToken().slice(0, 20) + '…');
  } catch (err) {
    Logger.log('FAILED — ' + err.message);
  }
}

function test_initiateStkPush() {
  // Adjust orderNumber + phone for your test data.
  // Sandbox expects a test phone number registered with your app.
  const orderNumber = 'PCB-20261009-787302';
  const phone = '254745411366'; // Safaricom's sandbox test MSISDN
  const result = Mpesa.initiateStkPush(orderNumber, phone);
  Logger.log(JSON.stringify(result, null, 2));
}

/**
 * Simulates a Daraja callback hitting our handler, without waiting for
 * a real phone prompt. Useful for verifying the round-trip while in sandbox.
 */
function test_simulateCallback() {
  const orders = Utils.readAllRows(CONFIG.SHEETS.ORDERS);
  if (!orders.length) { Logger.log('No orders to test with.'); return; }
  const latest = orders[orders.length - 1];

  const payments = Utils.readAllRows(CONFIG.SHEETS.PAYMENTS)
    .filter(function (r) { return String(r.order_id) === String(latest.id); });
  if (!payments.length) { Logger.log('No payment row for latest order.'); return; }

  const payment = payments[payments.length - 1];
  const checkoutId = String(payment.mpesa_checkout_request_id || 'TEST-CHECKOUT-ID');

  const fakeEvent = {
    parameter: { action: 'mpesaCallback' },
    postData: {
      contents: JSON.stringify({
        Body: {
          stkCallback: {
            MerchantRequestID: String(payment.mpesa_merchant_request_id || 'TEST-MERCHANT-ID'),
            CheckoutRequestID: checkoutId,
            ResultCode: 0,
            ResultDesc: 'The service request is processed successfully.',
            CallbackMetadata: {
              Item: [
                { Name: 'Amount',             Value: payment.amount },
                { Name: 'MpesaReceiptNumber', Value: 'SJL4K2M9QT' },
                { Name: 'TransactionDate',    Value: 20250920153045 },
                { Name: 'PhoneNumber',        Value: Number(payment.mpesa_phone) || 254708374149 },
              ],
            },
          },
        },
      }),
    },
  };

  const res = Mpesa.handleCallback(fakeEvent);
  Logger.log('Callback response: ' + res.getContent());
  Logger.log('Payment row status should now be PAID for order ' + latest.id);
}

function test_callbackUrl() {
  try { Logger.log('Callback URL: ' + Mpesa.getCallbackUrl()); }
  catch (err) { Logger.log('FAILED — ' + err.message); }
}