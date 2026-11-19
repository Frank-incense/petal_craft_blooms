/**
 * Sheet tabs and their header rows, matching setupSheets() in
 * apps-script/Code.js. The spreadsheet is the source of truth; these
 * lists are what the server expects to find in row 1 of each tab.
 *
 * `key` is the column used to locate a row for updates.
 */

export const TABLES = {
  PRODUCTS:               'Products',
  ORDERS:                 'Orders',
  ORDER_ITEMS:            'Order_Items',
  CUSTOMERS:              'Customers',
  INVENTORY:              'Inventory',
  INVENTORY_TRANSACTIONS: 'Inventory_Transactions',
  PAYMENTS:               'Payments',
  DELIVERIES:             'Deliveries',
  SETTINGS:               'Settings',
  ADMINS:                 'Admins',
};

export const SCHEMA = {
  [TABLES.PRODUCTS]: {
    key: 'id',
    columns: [
      'id', 'name', 'slug', 'description', 'category', 'occasion',
      'price', 'image', 'rating', 'featured', 'active',
      'created_at', 'updated_at',
    ],
  },
  [TABLES.ORDERS]: {
    key: 'id',
    columns: [
      'id', 'customer_id', 'customer_name', 'customer_phone', 'customer_email',
      'delivery_address', 'delivery_zone', 'delivery_date', 'delivery_time',
      'gift_message', 'subtotal', 'delivery_fee', 'total',
      'status', 'payment_status', 'payment_method', 'mpesa_receipt',
      'courier_name', 'courier_cost', 'notes', 'created_at', 'updated_at',
    ],
  },
  [TABLES.ORDER_ITEMS]: {
    key: 'id',
    columns: [
      'id', 'order_id', 'product_id', 'product_name', 'product_subtitle',
      'unit_price', 'quantity', 'line_total', 'created_at',
    ],
  },
  [TABLES.CUSTOMERS]: {
    key: 'id',
    columns: [
      'id', 'full_name', 'phone', 'email', 'password_hash', 'password_salt',
      'default_address', 'default_zone', 'created_at', 'updated_at', 'last_login',
    ],
  },
  [TABLES.INVENTORY]: {
    key: 'sku',
    columns: [
      'sku', 'product_id', 'product_name', 'current_qty', 'reorder_level',
      'supplier', 'unit_cost', 'last_restocked', 'status', 'updated_at',
    ],
  },
  [TABLES.INVENTORY_TRANSACTIONS]: {
    key: 'id',
    columns: [
      'id', 'sku', 'type', 'quantity_change', 'qty_before', 'qty_after',
      'order_id', 'notes', 'created_by', 'created_at',
    ],
  },
  [TABLES.PAYMENTS]: {
    key: 'id',
    columns: [
      'id', 'order_id', 'amount', 'method', 'status',
      'mpesa_checkout_request_id', 'mpesa_merchant_request_id', 'mpesa_receipt',
      'mpesa_phone', 'result_code', 'result_desc', 'raw_response',
      'created_at', 'updated_at',
    ],
  },
  [TABLES.DELIVERIES]: {
    key: 'id',
    columns: [
      'id', 'order_id', 'courier_name', 'courier_phone', 'assigned_at',
      'picked_up_at', 'delivered_at', 'status', 'delivery_notes',
      'recipient_name', 'created_at', 'updated_at',
    ],
  },
  [TABLES.SETTINGS]: {
    key: 'key',
    columns: ['key', 'value', 'type', 'description', 'updated_at'],
  },
  [TABLES.ADMINS]: {
    key: 'email',
    columns: [
      'email', 'full_name', 'password_hash', 'password_salt',
      'role', 'active', 'created_at', 'last_login',
    ],
  },
};
