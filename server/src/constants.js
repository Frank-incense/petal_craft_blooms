/**
 * Status vocabularies, from CONFIG in apps-script/Config.js.
 */

export const ORDER_STATUS = {
  RECEIVED:         'RECEIVED',
  PAID:             'PAID',
  PREPARING:        'PREPARING',
  READY:            'READY',
  OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY',
  DELIVERED:        'DELIVERED',
  CANCELLED:        'CANCELLED',
};

export const PAYMENT_STATUS = {
  PENDING:  'PENDING',
  PAID:     'PAID',
  FAILED:   'FAILED',
  REFUNDED: 'REFUNDED',
};

export const INVENTORY_STATUS = {
  IN_STOCK:     'IN_STOCK',
  LOW_STOCK:    'LOW_STOCK',
  OUT_OF_STOCK: 'OUT_OF_STOCK',
};
