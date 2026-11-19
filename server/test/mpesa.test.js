import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { makeApp, FIXED_NOW } from './helpers.js';
import { seed, ORDER_NO } from './fixtures.js';
import { TABLES } from '../src/schema.js';
import { loadConfig } from '../src/config.js';
import { createDarajaClient, darajaTimestamp } from '../src/mpesa/daraja.js';

const SECRET = 'cb-secret-0123456789abcdefghij';
const MPESA_ENV = {
  MPESA_CONSUMER_KEY: 'key', MPESA_CONSUMER_SECRET: 'secret', MPESA_PASSKEY: 'passkey',
  MPESA_SHORTCODE: '174379', MPESA_CALLBACK_SECRET: SECRET, PUBLIC_BASE_URL: 'https://api.shop.example/',
};
const UNPAID = 'PCB-20261101-000001'; // total 500, phone 0700000000, RECEIVED/PENDING

/** Records STK pushes; returns `reply` (or calls it) for each. */
function fakeMpesa(reply = (n) => ({ accepted: true, checkoutRequestId: 'ws_CO_' + n, merchantRequestId: 'mr_' + n, customerMessage: 'Success. Request accepted for processing' })) {
  const calls = [];
  return {
    calls,
    async stkPush(args) {
      calls.push(args);
      return typeof reply === 'function' ? reply(calls.length) : reply;
    },
  };
}

function mpesaApp({ mpesa = fakeMpesa(), env = MPESA_ENV, s = seed(), ...rest } = {}) {
  return { ...makeApp({ seed: s, env, mpesa, ...rest }), mpesa };
}

const post = (app, body) => request(app).post('/').set('Content-Type', 'text/plain').send(JSON.stringify(body)).then((r) => r.body);
const push = (app, orderNumber = UNPAID, extra = {}) => post(app, { action: 'initiateStkPush', orderNumber, ...extra });

function callbackBody({ checkoutId = 'ws_CO_1', resultCode = 0, amount = 500, receipt = 'SJL4K2M9QT', desc } = {}) {
  const stkCallback = {
    MerchantRequestID: 'mr_1',
    CheckoutRequestID: checkoutId,
    ResultCode: resultCode,
    ResultDesc: desc || (resultCode === 0 ? 'The service request is processed successfully.' : 'Request cancelled by user'),
  };
  if (resultCode === 0) {
    stkCallback.CallbackMetadata = { Item: [
      { Name: 'Amount', Value: amount },
      { Name: 'MpesaReceiptNumber', Value: receipt },
      { Name: 'TransactionDate', Value: 20261119123045 },
      { Name: 'PhoneNumber', Value: 254700000000 },
    ] };
  }
  return { Body: { stkCallback } };
}
const callback = (app, body, secret = SECRET) => request(app).post('/mpesa/callback/' + secret).send(body);

const paymentsFor = async (store, orderNumber) => (await store.all(TABLES.PAYMENTS)).filter((p) => p.order_id === orderNumber);
const orderRow = (store, id) => store.find(TABLES.ORDERS, (r) => r.id === id);

// ==================== initiateStkPush ====================

describe('initiateStkPush', () => {
  it('pushes the order total to the order phone, ignoring client amount and phone', async () => {
    const { app, mpesa } = mpesaApp();
    const body = await push(app, UNPAID, { amount: 1, phone: '0799999999' });
    expect(body).toEqual({
      success: true, message: 'STK Push sent',
      data: { orderNumber: UNPAID, customerMessage: 'Success. Request accepted for processing' },
    });
    expect(mpesa.calls).toEqual([{
      amount: 500,
      phone: '254700000000',
      accountReference: 'PCB000001',
      callbackUrl: `https://api.shop.example/mpesa/callback/${SECRET}`,
    }]);
  });

  it('records the checkout ID on a new payment row, without returning it', async () => {
    const { app, store } = mpesaApp();
    const body = await push(app);
    expect(JSON.stringify(body)).not.toContain('ws_CO_');
    const [payment] = await paymentsFor(store, UNPAID);
    expect(payment).toMatchObject({
      amount: 500, status: 'PENDING', mpesa_checkout_request_id: 'ws_CO_1',
      mpesa_merchant_request_id: 'mr_1', mpesa_phone: '254700000000',
    });
  });

  it("claims createOrder's unclaimed PENDING row instead of adding one", async () => {
    const s = seed();
    s[TABLES.PAYMENTS].push({ id: 'pay_fresh', order_id: UNPAID, amount: 500, status: 'PENDING', created_at: '2026-11-01T10:00:00.000Z' });
    const { app, store } = mpesaApp({ s });
    await push(app);
    const rows = await paymentsFor(store, UNPAID);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: 'pay_fresh', mpesa_checkout_request_id: 'ws_CO_1' });
  });

  it('gives each retry its own row (the Apps Script retry bug)', async () => {
    const { app, store } = mpesaApp();
    await push(app);
    await callback(app, callbackBody({ checkoutId: 'ws_CO_1', resultCode: 1032 }));
    await push(app);
    const rows = await paymentsFor(store, UNPAID);
    expect(rows.map((r) => [r.mpesa_checkout_request_id, r.status])).toEqual([['ws_CO_1', 'FAILED'], ['ws_CO_2', 'PENDING']]);

    // …and the retry's callback is matched and confirms the order.
    await callback(app, callbackBody({ checkoutId: 'ws_CO_2' }));
    expect((await orderRow(store, UNPAID)).payment_status).toBe('PAID');
  });

  it.each([
    ['an unknown order', { orderNumber: 'PCB-nope' }, 'NOT_FOUND'],
    ['a missing order number', { orderNumber: '' }, 'MISSING_ID'],
    ['an already-paid order', { orderNumber: ORDER_NO }, 'ALREADY_PAID'],
  ])('rejects %s', async (_, input, code) => {
    const { app, mpesa } = mpesaApp();
    expect((await post(app, { action: 'initiateStkPush', ...input })).code).toBe(code);
    expect(mpesa.calls).toHaveLength(0);
  });

  it('rejects a cancelled order', async () => {
    const s = seed();
    s[TABLES.ORDERS][2].status = 'CANCELLED';
    const { app } = mpesaApp({ s });
    expect((await push(app)).code).toBe('CANCELLED');
  });

  it('passes a Daraja rejection through and records nothing', async () => {
    const mpesa = fakeMpesa({ accepted: false, code: '400.002.02', message: 'Bad Request - Invalid PhoneNumber' });
    const { app, store } = mpesaApp({ mpesa });
    expect(await push(app)).toEqual({ success: false, error: 'Bad Request - Invalid PhoneNumber', code: '400.002.02' });
    expect(await paymentsFor(store, UNPAID)).toHaveLength(0);
  });

  it('reports NETWORK when Daraja is unreachable, without leaking details', async () => {
    const mpesa = { stkPush: () => Promise.reject(new Error('ECONNRESET at 10.0.0.1')) };
    const { app } = mpesaApp({ mpesa });
    expect(await push(app)).toEqual({ success: false, error: "We couldn't reach M-Pesa. Please try again.", code: 'NETWORK' });
  });

  it('refuses to run when M-Pesa is not configured', async () => {
    const { app, mpesa } = mpesaApp({ env: { ...MPESA_ENV, MPESA_PASSKEY: '' } });
    expect((await push(app)).code).toBe('MPESA_NOT_CONFIGURED');
    expect(mpesa.calls).toHaveLength(0);
  });

  it.each([
    ['a short callback secret', { MPESA_CALLBACK_SECRET: 'short' }],
    ['an http base URL', { PUBLIC_BASE_URL: 'http://api.shop.example' }],
  ])('treats %s as not configured', async (_, env) => {
    const { app } = mpesaApp({ env: { ...MPESA_ENV, ...env } });
    expect((await push(app)).code).toBe('MPESA_NOT_CONFIGURED');
  });

  it('limits pushes per order', async () => {
    const { app } = mpesaApp();
    for (let i = 0; i < 5; i++) expect((await push(app)).success).toBe(true);
    expect((await push(app)).code).toBe('RATE_LIMITED');
  });
});

// ==================== callback ====================

describe('M-Pesa callback', () => {
  async function pushed(opts) {
    const ctx = mpesaApp(opts);
    await push(ctx.app);
    return ctx;
  }

  it('marks payment and order PAID on a full-amount success, and ACKs', async () => {
    const { app, store } = await pushed();
    const res = await callback(app, callbackBody());
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ResultCode: 0, ResultDesc: 'Accepted' });

    const [payment] = await paymentsFor(store, UNPAID);
    expect(payment).toMatchObject({ status: 'PAID', mpesa_receipt: 'SJL4K2M9QT', result_code: '0', updated_at: FIXED_NOW.toISOString() });
    expect(JSON.parse(payment.raw_response).Body.stkCallback.CheckoutRequestID).toBe('ws_CO_1');
    expect(await orderRow(store, UNPAID)).toMatchObject({ status: 'PAID', payment_status: 'PAID', mpesa_receipt: 'SJL4K2M9QT' });
  });

  it('marks FAILED on a user cancellation', async () => {
    const { app, store } = await pushed();
    await callback(app, callbackBody({ resultCode: 1032 }));
    const [payment] = await paymentsFor(store, UNPAID);
    expect(payment).toMatchObject({ status: 'FAILED', result_code: '1032', result_desc: 'Request cancelled by user' });
    expect(await orderRow(store, UNPAID)).toMatchObject({ status: 'RECEIVED', payment_status: 'FAILED' });
  });

  it('refuses a success for the wrong amount', async () => {
    const { app, store } = await pushed();
    await callback(app, callbackBody({ amount: 1 }));
    const [payment] = await paymentsFor(store, UNPAID);
    expect(payment).toMatchObject({ status: 'FAILED', result_desc: 'Amount mismatch: paid 1, expected 500' });
    expect((await orderRow(store, UNPAID)).payment_status).toBe('FAILED');
  });

  it('is idempotent for repeated success callbacks', async () => {
    const { app, store } = await pushed();
    await callback(app, callbackBody());
    await callback(app, callbackBody({ receipt: 'DIFFERENT' }));
    expect((await paymentsFor(store, UNPAID))[0].mpesa_receipt).toBe('SJL4K2M9QT');
  });

  it('does not let a late failure for an older push undo a success', async () => {
    const { app, store } = await pushed();
    await push(app); // ws_CO_2
    await callback(app, callbackBody({ checkoutId: 'ws_CO_2' }));
    await callback(app, callbackBody({ checkoutId: 'ws_CO_1', resultCode: 1037, desc: 'Timeout' }));
    expect(await orderRow(store, UNPAID)).toMatchObject({ status: 'PAID', payment_status: 'PAID' });
  });

  it('does not move an order that staff already advanced', async () => {
    const s = seed();
    s[TABLES.ORDERS][2].status = 'PREPARING';
    const { app, store } = await pushed({ s });
    await callback(app, callbackBody());
    expect(await orderRow(store, UNPAID)).toMatchObject({ status: 'PREPARING', payment_status: 'PAID' });
  });

  it('returns 404 and changes nothing for a wrong secret', async () => {
    const { app, store } = await pushed();
    const res = await callback(app, callbackBody(), 'wrong-secret');
    expect(res.status).toBe(404);
    expect((await paymentsFor(store, UNPAID))[0].status).toBe('PENDING');
  });

  it('returns 404 for every path when no secret is configured', async () => {
    const { app } = mpesaApp({ env: { ...MPESA_ENV, MPESA_CALLBACK_SECRET: '' } });
    expect((await callback(app, callbackBody(), '')).status).toBe(404);
    expect((await callback(app, callbackBody(), 'undefined')).status).toBe(404);
  });

  it.each([
    ['an unknown checkout ID', callbackBody({ checkoutId: 'ws_CO_unknown' })],
    ['no checkout ID', callbackBody({ checkoutId: '' })],
    ['an unexpected shape', { hello: 'world' }],
  ])('ACKs and ignores %s', async (_, body) => {
    const logger = { error: vi.fn(), warn: vi.fn(), log() {} };
    const { app, store } = await pushed({ logger });
    const res = await callback(app, body);
    expect(res.body).toEqual({ ResultCode: 0, ResultDesc: 'Accepted' });
    expect((await paymentsFor(store, UNPAID))[0].status).toBe('PENDING');
    expect(logger.error.mock.calls.length + logger.warn.mock.calls.length).toBeGreaterThan(0);
  });

  it('still ACKs when processing throws', async () => {
    const logger = { error: vi.fn(), warn() {}, log() {} };
    const { app, store } = await pushed({ logger });
    store.update = () => Promise.reject(new Error('Sheets down'));
    const res = await callback(app, callbackBody());
    expect(res.body).toEqual({ ResultCode: 0, ResultDesc: 'Accepted' });
    expect(logger.error).toHaveBeenCalledWith('[mpesa] callback processing failed', expect.any(Error));
  });
});

describe('getPayments after a retry', () => {
  it('lists a PAID payment first even if a newer push is pending', async () => {
    const { app } = mpesaApp();
    await push(app);
    await callback(app, callbackBody({ checkoutId: 'ws_CO_1' }));
    // A newer row (e.g. from a double-clicked retry) must not hide the PAID one.
    const s = await request(app).get('/').query({ action: 'getPayments', orderNumber: UNPAID });
    expect(s.body.data[0].status).toBe('PAID');
  });
});

// ==================== Daraja client ====================

describe('Daraja client', () => {
  const config = loadConfig(MPESA_ENV);

  function fakeFetch(stkReply = { MerchantRequestID: 'mr_1', CheckoutRequestID: 'ws_CO_1', ResponseCode: '0', ResponseDescription: 'Success', CustomerMessage: 'Success. Request accepted for processing' }, stkStatus = 200) {
    const calls = [];
    const fn = async (url, init = {}) => {
      calls.push({ url, init });
      if (url.includes('/oauth/')) return new Response(JSON.stringify({ access_token: 'tok_' + calls.length, expires_in: '3599' }));
      return new Response(JSON.stringify(stkReply), { status: stkStatus });
    };
    return { fn, calls };
  }

  it('formats the timestamp in Nairobi time', () => {
    expect(darajaTimestamp(new Date('2026-11-19T21:05:09Z'))).toBe('20261120000509');
  });

  it('sends a correctly signed STK request to the sandbox', async () => {
    const { fn, calls } = fakeFetch();
    const client = createDarajaClient({ config, fetch: fn, now: () => FIXED_NOW });
    const result = await client.stkPush({ amount: 500, phone: '254700000000', accountReference: 'PCB000001', callbackUrl: 'https://x/cb' });

    expect(result).toEqual({ accepted: true, checkoutRequestId: 'ws_CO_1', merchantRequestId: 'mr_1', customerMessage: 'Success. Request accepted for processing' });
    expect(calls[0].url).toBe('https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials');
    expect(calls[0].init.headers.Authorization).toBe('Basic ' + Buffer.from('key:secret').toString('base64'));

    expect(calls[1].url).toBe('https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest');
    expect(calls[1].init.headers.Authorization).toBe('Bearer tok_1');
    const sent = JSON.parse(calls[1].init.body);
    const timestamp = '20261119123000'; // FIXED_NOW in Nairobi
    expect(sent).toEqual({
      BusinessShortCode: '174379',
      Password: Buffer.from('174379' + 'passkey' + timestamp).toString('base64'),
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: 500,
      PartyA: '254700000000',
      PartyB: '174379',
      PhoneNumber: '254700000000',
      CallBackURL: 'https://x/cb',
      AccountReference: 'PCB000001',
      TransactionDesc: 'Petal Craft Blooms',
    });
  });

  it('uses production endpoints when configured', async () => {
    const { fn, calls } = fakeFetch();
    const client = createDarajaClient({ config: loadConfig({ ...MPESA_ENV, MPESA_ENVIRONMENT: 'production' }), fetch: fn });
    await client.stkPush({ amount: 1, phone: '254700000000', accountReference: 'x', callbackUrl: 'https://x' });
    expect(calls.map((c) => new URL(c.url).host)).toEqual(['api.safaricom.co.ke', 'api.safaricom.co.ke']);
  });

  it('caches the OAuth token until shortly before expiry', async () => {
    let now = FIXED_NOW;
    const { fn, calls } = fakeFetch();
    const client = createDarajaClient({ config, fetch: fn, now: () => now });
    const args = { amount: 1, phone: '254700000000', accountReference: 'x', callbackUrl: 'https://x' };
    await client.stkPush(args);
    await client.stkPush(args);
    expect(calls.filter((c) => c.url.includes('/oauth/'))).toHaveLength(1);
    now = new Date(FIXED_NOW.getTime() + 3599_000 - 59_000); // inside the 60s refresh margin
    await client.stkPush(args);
    expect(calls.filter((c) => c.url.includes('/oauth/'))).toHaveLength(2);
  });

  it('maps a Daraja error response to accepted:false', async () => {
    const { fn } = fakeFetch({ requestId: 'r1', errorCode: '400.002.02', errorMessage: 'Bad Request - Invalid Amount' }, 400);
    const client = createDarajaClient({ config, fetch: fn });
    expect(await client.stkPush({ amount: 1, phone: '254700000000', accountReference: 'x', callbackUrl: 'https://x' }))
      .toEqual({ accepted: false, code: '400.002.02', message: 'Bad Request - Invalid Amount' });
  });

  it('rejects when OAuth fails', async () => {
    const client = createDarajaClient({ config, fetch: async () => new Response('Unauthorized', { status: 401 }) });
    await expect(client.getAccessToken()).rejects.toThrow(/OAuth failed \(401\)/);
  });
});
