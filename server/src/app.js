/**
 * HTTP layer. Speaks the same protocol as the Apps Script web app:
 *
 *   GET  /?action=<name>&…          read actions, params in the query
 *   POST /   body: JSON string       write actions, `action` in the body
 *
 * POST bodies arrive as text/plain (the frontend avoids a CORS preflight
 * by not setting Content-Type), so the body is read as text and parsed
 * here. Application errors are HTTP 200 with success:false, as before.
 */

import express from 'express';
import { actions as defaultActions } from './actions/index.js';
import { ApiError, successBody, errorBody } from './envelope.js';
import { createMutex } from './lib/mutex.js';

export function createApp({ store, config, actions = defaultActions, lock = createMutex(), now = () => new Date(), logger = console }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // Render terminates TLS in front of us

  app.use(cors(config.corsOrigins));

  app.get('/healthz', (req, res) => res.json({ ok: true }));

  app.get('/', (req, res) => {
    dispatch(req.query.action, { ...req.query }, res);
  });

  app.post('/', express.text({ type: () => true, limit: '100kb' }), (req, res) => {
    let body = {};
    if (typeof req.body === 'string' && req.body) {
      try {
        const parsed = JSON.parse(req.body);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) body = parsed;
      } catch { /* malformed JSON → empty body, as Apps Script did */ }
    }
    dispatch(body.action || req.query.action, { ...req.query, ...body }, res);
  });

  // Body-parser failures (oversized or unreadable bodies).
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    const status = err.status || 500;
    if (status >= 500) logger.error('[server] request failed', err);
    res.status(status).json(errorBody(status === 413 ? 'Request body too large' : 'Invalid request', 'INVALID_REQUEST'));
  });

  async function dispatch(action, input, res) {
    try {
      if (!action) throw new ApiError('MISSING_ACTION', 'Missing action parameter');
      const name = String(action);
      if (!Object.hasOwn(actions, name)) throw new ApiError('UNKNOWN_ACTION', 'Unknown action: ' + name);

      const result = await actions[name]({ input, store, lock, config, now });
      res.json(successBody(result));
    } catch (err) {
      if (err instanceof ApiError) {
        res.json(errorBody(err.message, err.code));
      } else {
        // Unexpected: log the detail, return nothing internal to the client.
        logger.error(`[server] action "${action}" failed`, err);
        res.json(errorBody('Something went wrong', 'UNHANDLED'));
      }
    }
  }

  return app;
}

function cors(allowed) {
  return (req, res, next) => {
    const origin = req.headers.origin;
    if (origin && allowed.includes(origin)) {
      res.set('Access-Control-Allow-Origin', origin);
      res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.set('Access-Control-Allow-Headers', 'Content-Type');
      res.set('Access-Control-Max-Age', '86400');
    }
    res.vary('Origin');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  };
}
