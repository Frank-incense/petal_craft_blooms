/**
 * Petal Craft Blooms — Configuration
 * Every hardcoded constant lives here. No magic strings elsewhere.
 */

const CONFIG = {
  // ⚠️ PASTE YOUR SPREADSHEET ID HERE.
  // Open your sheet → the URL is:
  //   https://docs.google.com/spreadsheets/d/<THIS_PART>/edit
  SPREADSHEET_ID: '1Y2CNnGhmsa6aY1J7TNr4PFK6kuHrSAi7q4tZ79pYKTY',

  SHEETS: {
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
  },

  ORDER_STATUS: {
    RECEIVED:         'RECEIVED',
    PAID:             'PAID',
    PREPARING:        'PREPARING',
    READY:            'READY',
    OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY',
    DELIVERED:        'DELIVERED',
    CANCELLED:        'CANCELLED',
  },

  PAYMENT_STATUS: {
    PENDING:  'PENDING',
    PAID:     'PAID',
    FAILED:   'FAILED',
    REFUNDED: 'REFUNDED',
  },

  INVENTORY_STATUS: {
    IN_STOCK:     'IN_STOCK',
    LOW_STOCK:    'LOW_STOCK',
    OUT_OF_STOCK: 'OUT_OF_STOCK',
  },

  DEFAULTS: {
    FREE_DELIVERY_THRESHOLD: 5000,
    DELIVERY_ZONE_CBD:       300,
    DELIVERY_ZONE_SUBURBS:   500,
    CURRENCY:                'KES',
  },
    // ==================== M-PESA (Daraja) ====================
  // Only non-secret configuration lives here. Credentials are read at
  // runtime from Script Properties — never from this file, never from Sheets.
  MPESA: {
    ENVIRONMENTS: {
      sandbox: {
        OAUTH_URL:   'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials',
        STK_URL:     'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest',
        DEFAULT_SHORTCODE: '174379', // Safaricom's public sandbox shortcode
      },
      production: {
        OAUTH_URL:   'https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials',
        STK_URL:     'https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest',
        DEFAULT_SHORTCODE: '',       // Must be set in Script Properties
      },
    },

    // TransactionType — use CustomerPayBillOnline for PayBill shortcodes,
    // CustomerBuyGoodsOnline for Till (Buy Goods) shortcodes.
    TRANSACTION_TYPE: 'CustomerPayBillOnline',

    // Token cached for (expires_in − this) milliseconds to avoid edge-of-expiry
    TOKEN_REFRESH_MARGIN_MS: 60000,

    // Daraja's callback expects this response shape on receipt.
    ACK: { ResultCode: 0, ResultDesc: 'Accepted' },
  },
};