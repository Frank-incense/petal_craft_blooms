/**
 * Wire-protocol contract: what src/js/api.js relies on.
 */

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { makeApp, FIXED_NOW } from './helpers.js';
import { ApiError, ok } from '../src/envelope.js';

describe('GET /?action=', () => {
  it('returns the success envelope', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/').query({ action: 'ping' });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toEqual({
      success: true,
      data: { pong: true, time: FIXED_NOW.toISOString() },
      message: 'Success',
    });
  });

  it('reports a missing action as MISSING_ACTION with HTTP 200', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: false, error: 'Missing action parameter', code: 'MISSING_ACTION' });
  });

  it('reports an unknown action as UNKNOWN_ACTION', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/').query({ action: 'nope' });
    expect(res.body).toEqual({ success: false, error: 'Unknown action: nope', code: 'UNKNOWN_ACTION' });
  });

  it.each(['__proto__', 'constructor', 'toString', 'hasOwnProperty'])(
    'does not resolve inherited property "%s" as an action',
    async (name) => {
      const { app } = makeApp();
      const res = await request(app).get('/').query({ action: name });
      expect(res.body.code).toBe('UNKNOWN_ACTION');
    },
  );

  it('no longer exposes the removed paymentCallback action', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/').query({ action: 'paymentCallback' });
    expect(res.body.code).toBe('UNKNOWN_ACTION');
  });
});

describe('POST /', () => {
  it('parses a text/plain JSON body (no Content-Type set by the frontend)', async () => {
    const { app } = makeApp();
    const res = await request(app)
      .post('/')
      .set('Content-Type', 'text/plain;charset=UTF-8')
      .send(JSON.stringify({ action: 'ping' }));
    expect(res.body.success).toBe(true);
    expect(res.body.data.pong).toBe(true);
  });

  it('also accepts application/json', async () => {
    const { app } = makeApp();
    const res = await request(app).post('/').send({ action: 'ping' });
    expect(res.body.success).toBe(true);
  });

  it('falls back to ?action= in the query string', async () => {
    const { app } = makeApp();
    const res = await request(app).post('/?action=ping').set('Content-Type', 'text/plain').send('{}');
    expect(res.body.success).toBe(true);
  });

  it('treats malformed JSON as an empty body', async () => {
    const { app } = makeApp();
    const res = await request(app).post('/').set('Content-Type', 'text/plain').send('{not json');
    expect(res.body.code).toBe('MISSING_ACTION');
  });

  it('treats a JSON array body as an empty body', async () => {
    const { app } = makeApp();
    const res = await request(app).post('/').set('Content-Type', 'text/plain').send('["ping"]');
    expect(res.body.code).toBe('MISSING_ACTION');
  });

  it('rejects bodies over 100kb', async () => {
    const { app } = makeApp();
    const big = JSON.stringify({ action: 'ping', pad: 'x'.repeat(110 * 1024) });
    const res = await request(app).post('/').set('Content-Type', 'text/plain').send(big);
    expect(res.status).toBe(413);
    expect(res.body).toEqual({ success: false, error: 'Request body too large', code: 'INVALID_REQUEST' });
  });

  it('merges body over query for handler input', async () => {
    let seen;
    const { app } = makeApp({ actions: { echo: (ctx) => { seen = ctx.input; return {}; } } });
    await request(app).post('/?action=echo&a=query&b=query').set('Content-Type', 'text/plain')
      .send(JSON.stringify({ b: 'body', c: 'body' }));
    expect(seen).toEqual({ action: 'echo', a: 'query', b: 'body', c: 'body' });
  });
});

describe('handler results and errors', () => {
  it('uses the message from ok(data, message)', async () => {
    const { app } = makeApp({ actions: { x: () => ok([1, 2], 'Products retrieved') } });
    const res = await request(app).get('/').query({ action: 'x' });
    expect(res.body).toEqual({ success: true, data: [1, 2], message: 'Products retrieved' });
  });

  it('turns undefined data into {}', async () => {
    const { app } = makeApp({ actions: { x: () => undefined } });
    const res = await request(app).get('/').query({ action: 'x' });
    expect(res.body.data).toEqual({});
  });

  it('passes ApiError code and message through', async () => {
    const { app } = makeApp({ actions: { x: async () => { throw new ApiError('NOT_FOUND', 'Order not found'); } } });
    const res = await request(app).get('/').query({ action: 'x' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: false, error: 'Order not found', code: 'NOT_FOUND' });
  });

  it('hides unexpected error details behind UNHANDLED', async () => {
    const { app } = makeApp({ actions: { x: () => { throw new Error('secret internal detail'); } } });
    const res = await request(app).get('/').query({ action: 'x' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: false, error: 'Something went wrong', code: 'UNHANDLED' });
  });

  it('reports actions that are not ported yet as NOT_IMPLEMENTED', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/').query({ action: 'getProducts' });
    expect(res.body.code).toBe('NOT_IMPLEMENTED');
  });
});

describe('CORS', () => {
  it('allows a configured origin', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/').query({ action: 'ping' }).set('Origin', 'https://shop.example');
    expect(res.headers['access-control-allow-origin']).toBe('https://shop.example');
    expect(res.headers.vary).toMatch(/Origin/);
  });

  it('does not allow other origins', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/').query({ action: 'ping' }).set('Origin', 'https://evil.example');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('answers preflight requests', async () => {
    const { app } = makeApp();
    const res = await request(app).options('/')
      .set('Origin', 'https://shop.example')
      .set('Access-Control-Request-Method', 'POST');
    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-methods']).toMatch(/POST/);
  });
});

describe('ops', () => {
  it('serves a health check', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('does not advertise Express', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/healthz');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});
