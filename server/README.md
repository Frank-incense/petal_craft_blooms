# Petal Craft Blooms API server

Node/Express replacement for the Apps Script backend in `../apps-script/`. It speaks the same protocol, so the frontend only needs a new API URL:

- `GET /?action=<name>&…` for read actions
- `POST /` with a JSON string body containing `action`. The frontend sends it as `text/plain` to avoid a CORS preflight.
- Every response is HTTP 200 with `{ success, data, message }` or `{ success: false, error, code }`.

The data stays in the Google Sheet that staff already use.

## Commands

```bash
npm install
npm run dev          # http://localhost:3000, restarts on change, reads .env if present
npm test             # Vitest, uses the in-memory store, no Google credentials needed
npx vitest run test/protocol.test.js        # one file
npx vitest run -t "rejects bodies over"     # tests whose name matches
```

Copy `.env.example` to `.env` for local settings.

## Layout

| Path | Role |
|---|---|
| `src/app.js` | HTTP layer: parses requests, dispatches to actions, handles envelopes and CORS |
| `src/actions/` | One handler per action. Handlers receive `ctx = { input, store, lock, config, now }`, return data, and throw `ApiError` for expected failures |
| `src/store/` | Data access. `memory-store.js` is used for tests and local development; the Sheets store implements the same interface |
| `src/schema.js` | Sheet tab names and header columns, copied from `setupSheets()` in the Apps Script code |
| `src/lib/mutex.js` | Serialises read-check-write sequences, replacing Apps Script's `LockService` |
| `src/auth.js` | `requireAdmin(ctx)`, which checks `token` against `ADMIN_TOKEN` |

## Constraints

- **Single instance only.** The mutex and the planned in-memory cache of the sheet are per process. Do not scale horizontally.
- **`store.update` patches only the given cells.** Staff edit the sheet directly, so whole-row rewrites could overwrite their changes.
- **Never return internal error text.** Unexpected exceptions are logged and returned to the client as `UNHANDLED` / "Something went wrong".

## Migration status

- [x] Phase 1: server skeleton, protocol, memory store, mutex, admin auth, contract tests
- [ ] Phase 2: read actions (products, orders, deliveries, payments, settings)
- [ ] Phase 3: `createOrder`, including server-side custom bouquet pricing
- [ ] Phase 4: M-Pesa STK push and callback
- [ ] Phase 5: Google Sheets store
- [ ] Phase 6: Render deploy and cutover

Actions that haven't been ported yet return `NOT_IMPLEMENTED`.
