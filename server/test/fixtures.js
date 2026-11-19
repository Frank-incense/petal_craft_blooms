/**
 * Sample sheet contents. Values are typed the way a sheet reads back:
 * numbers as numbers, checkboxes as booleans or 'TRUE' strings, and
 * phone numbers in whatever format staff typed.
 */

import { TABLES } from '../src/schema.js';

export const ORDER_NO = 'PCB-20261119-123456';
export const OTHER_ORDER_NO = 'PCB-20261118-654321';

export function seed() {
  return {
    [TABLES.PRODUCTS]: [
      { id: 'pcb001', name: 'Crimson Rose Bouquet', slug: 'crimson-rose-bouquet', category: 'Roses', occasion: 'Anniversary', price: 3500, image: 'https://img/1.jpg', rating: 4.8, featured: false, active: true },
      { id: 'pcb004', name: 'Grand Romance', slug: 'grand-romance', category: 'Roses', price: '8500', rating: '5', featured: 'TRUE', active: 'TRUE' },
      { id: 'pcb099', name: 'Retired Bouquet', price: 1000, active: false },
    ],
    [TABLES.ORDERS]: [
      {
        id: ORDER_NO, customer_id: 'cust_1', customer_name: 'Jane Wanjiku', customer_phone: '0712345678',
        delivery_address: 'Westlands, Ring Road', delivery_zone: 'cbd', delivery_date: '2026-11-20',
        delivery_time: '10:00 AM – 12:00 PM', gift_message: 'Happy Birthday!', subtotal: 3500,
        delivery_fee: 300, total: 3800, status: 'PAID', payment_status: 'PAID', payment_method: 'MPESA',
        created_at: '2026-11-19T06:00:00.000Z',
      },
      {
        id: OTHER_ORDER_NO, customer_name: 'Otieno', customer_phone: '+254 733 000 111', delivery_zone: 'suburbs',
        total: 9000, status: 'OUT_FOR_DELIVERY', payment_status: 'PAID',
        // 23:30 UTC on the 18th = 02:30 on the 19th in Nairobi.
        created_at: '2026-11-18T23:30:00.000Z',
      },
      {
        id: 'PCB-20261101-000001', customer_name: 'Old Unpaid', customer_phone: '0700000000',
        total: 500, status: 'RECEIVED', payment_status: 'PENDING', created_at: '2026-11-01T10:00:00.000Z',
      },
    ],
    [TABLES.ORDER_ITEMS]: [
      { id: 'oi_1', order_id: ORDER_NO, product_id: 'pcb001', product_name: 'Crimson Rose Bouquet', unit_price: 3500, quantity: 1, line_total: 3500 },
      { id: 'oi_2', order_id: OTHER_ORDER_NO, product_id: 'pcb004', product_name: 'Grand Romance', unit_price: 8500, quantity: 1, line_total: 8500 },
    ],
    [TABLES.PAYMENTS]: [
      { id: 'pay_old', order_id: ORDER_NO, amount: 3800, method: 'MPESA', status: 'FAILED', mpesa_checkout_request_id: 'ws_CO_secret_1', mpesa_phone: '254712345678', result_desc: 'Cancelled by user', created_at: '2026-11-19T06:01:00.000Z' },
      { id: 'pay_new', order_id: ORDER_NO, amount: 3800, method: 'MPESA', status: 'PAID', mpesa_checkout_request_id: 'ws_CO_secret_2', mpesa_receipt: 'SJL4K2M9QT', mpesa_phone: '254712345678', created_at: '2026-11-19T06:05:00.000Z' },
    ],
    [TABLES.DELIVERIES]: [
      { id: 'del_1', order_id: ORDER_NO, status: 'UNASSIGNED', recipient_name: 'Jane Wanjiku' },
      { id: 'del_2', order_id: OTHER_ORDER_NO, courier_name: 'Kimani Deliveries', courier_phone: '0722111222', status: 'PICKED_UP', picked_up_at: '2026-11-19T08:00:00.000Z', recipient_name: 'Otieno' },
    ],
    [TABLES.INVENTORY]: [
      { sku: 'pcb001', product_id: 'pcb001', product_name: 'Crimson Rose Bouquet', current_qty: 3, reorder_level: 5, status: 'LOW_STOCK' },
      { sku: 'pcb004', product_id: 'pcb004', product_name: 'Grand Romance', current_qty: 0, reorder_level: 2, status: 'OUT_OF_STOCK' },
    ],
    [TABLES.INVENTORY_TRANSACTIONS]: [
      { id: 'invtx_1', sku: 'pcb001', type: 'SALE', quantity_change: -1, order_id: ORDER_NO },
      { id: 'invtx_2', sku: 'pcb004', type: 'RESTOCK', quantity_change: 10 },
    ],
    [TABLES.SETTINGS]: [
      { key: 'free_delivery_threshold', value: '5000', type: 'number' },
      { key: 'delivery_zone_cbd', value: '300', type: 'number' },
      { key: 'maintenance', value: 'TRUE', type: 'boolean' },
      { key: 'zones', value: '["cbd","suburbs"]', type: 'json' },
      { key: 'business_name', value: 'Petal Craft Blooms', type: 'string' },
    ],
  };
}
