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
npm run check:sheets # read-only check of the configured spreadsheet
```

Copy `.env.example` to `.env` for local settings.

## Layout

| Path | Role |
|---|---|
| `src/app.js` | HTTP layer: parses requests, dispatches to actions, handles envelopes and CORS |
| `src/actions/` | One handler per action. Handlers receive `ctx = { input, store, lock, config, now }`, return data, and throw `ApiError` for expected failures |
| `src/store/` | Data access. `memory-store.js` is for tests and local development; `sheets-store.js` uses Google Sheets. `test/store.test.js` runs one contract against both |
| `src/schema.js` | Sheet tab names and header columns, copied from `setupSheets()` in the Apps Script code |
| `src/lib/mutex.js` | Serialises read-check-write sequences, replacing Apps Script's `LockService` |
| `src/auth.js` | `requireAdmin(ctx)`, which checks `token` against `ADMIN_TOKEN` |

## Google Sheets store

- **Reads** come from an in-memory copy of every tab, loaded in one request at startup and refreshed every `SHEETS_REFRESH_MS` (default 30s). Staff edits appear within that window.
- **Writes** go to the sheet immediately and update the copy:
  - Columns are matched by header name, so staff can reorder them or add their own.
  - Before an update, the server re-reads the header row and key column, so a row staff sorted or inserted can't redirect the write. Only the patched cells are written.
  - Every value is written `RAW`. Customer text is never run as a formula (Apps Script's `appendRow` would run it), and phone numbers keep their leading 0.
  - 429 and 5xx responses are retried with backoff, up to 3 times.
- **Quota:** a service account gets about 60 reads and 60 writes per minute. Reads are served from memory, so only writes count against it. `createOrder` makes about 7 calls.
- **Setup:** see the Sheets section of `.env.example`. Run `npm run check:sheets` to confirm access.

## Constraints

- **Single instance only.** The mutex and the planned in-memory cache of the sheet are per process. Do not scale horizontally.
- **`store.update` patches only the given cells.** Staff edit the sheet directly, so whole-row rewrites could overwrite their changes.
- **Client IPs come from Render's proxy** (`trust proxy` = 1). The `getOrder`/`getDelivery` rate limit (10 failed matches per IP per 15 minutes) depends on that. Without a proxy in front, `X-Forwarded-For` could be spoofed.
- **Race-condition tests need latency.** Wrap the store with `withLatency()` from `test/helpers.js`. The memory store resolves instantly, so without it concurrent requests never overlap and the test passes even with no lock.
- **Never return internal error text.** Unexpected exceptions are logged and returned to the client as `UNHANDLED` / "Something went wrong".

## Migration status

- [x] Phase 1: server skeleton, protocol, memory store, mutex, admin auth, contract tests
- [x] Phase 2: read actions (`getProducts`, `getProduct`, `getOrder`, `getPayments`, `getDelivery`, plus admin reads)
- [x] Phase 3: `createOrder`, including server-side custom bouquet pricing
- [x] Phase 4: M-Pesa STK push and callback, plus the admin writes (`updateOrderStatus`, `restock`, `assignCourier`, `updateDeliveryStatus`)
- [~] Phase 5: Google Sheets store. The code and tests are done (against a fake Sheets API); it still needs a run against a copy of the real spreadsheet and a Daraja sandbox payment.
- [ ] Phase 6: Render deploy and cutover

Every Apps Script action is ported except `paymentCallback`. `test/protocol.test.js` checks this against `apps-script/Api.js`.

## M-Pesa

- **STK push:** `initiateStkPush` charges the **order's** total to the **order's** phone. The client's `amount` and `phone` are ignored. Each push gets its own payment row, which holds the checkout ID; the ID is never sent to the browser.
- **Callbacks** arrive at `POST /mpesa/callback/<MPESA_CALLBACK_SECRET>`. Any other path gets a 404. A success is accepted only for the full amount on the payment row, and repeated callbacks are ignored. Daraja always gets an ACK, even if processing fails; the failure is logged.
- **Configuration** is listed in `.env.example`. Until it's complete, `initiateStkPush` returns `MPESA_NOT_CONFIGURED`, and the server log names the missing settings.

### Intentional differences from Apps Script

- `paymentCallback` doesn't exist (it was removed in the v9 hotfix).
- `getDelivery` requires `phone`, which must match the order, the same as `getOrder`. `src/js/tracking.js` sends it.
- Failed `getOrder`/`getDelivery` matches are rate-limited (`RATE_LIMITED`).
- `listDeliveries`, `getInventory`, `getTransactions`, `adminDashboard` and `adminListOrders` require `token` = `ADMIN_TOKEN`. Apps Script's admin check let everyone in, and some of these actions had no check at all.
- `getPayments` never returns the M-Pesa checkout ID or the payer's phone. A `PAID` payment always sorts first, because `checkout.js` only reads `payments[0]`.
- M-Pesa:
  - **Retries fixed.** Every STK push records its checkout ID on its own payment row. Apps Script only recorded it on a `PENDING` row, so a retry after a failed payment could never be confirmed.
  - **Phone from the order.** The STK push always goes to the order's phone, and is limited to 5 pushes per order per 15 minutes.
  - **Late failures ignored.** A failure callback for an older push no longer resets a paid order to `FAILED`.
  - **Callback URL** uses a secret path instead of the web app URL. The request field is spelled `CallBackURL`, as in Safaricom's docs; Apps Script sent `CallbackURL`.
  - **`AccountReference`** is now `PCB` plus the order number's last six digits. Apps Script used `PCB-YYYYMMDD`, which was the same for every order placed that day.
- `updateOrderStatus`, `restock`, `assignCourier` and `updateDeliveryStatus` require `token`. Some had no check at all in Apps Script, and the others used its placeholder check that let everyone through.
- `createOrder`:
  - **Custom bouquets are priced on the server** from the selection (`custom: { flowers, wrapping, ribbon }`), using `src/lib/bouquet.js`. The client's price is ignored. The tables must match `src/js/builder.js`; `test/bouquet.test.js` fails if they drift. Carts saved before this change get `INVALID_ITEM` "Please rebuild your custom bouquet".
  - **Stock is summed per product** before checking. Apps Script checked each line separately, so two lines of one product could oversell.
  - **Stricter validation.** Phone numbers must be Kenyan (`2547…`/`2541…`, since M-Pesa needs one). Emails are format-checked. The delivery date must be a real date, no earlier than yesterday and no later than 90 days ahead (Nairobi time). Text fields have length limits. `payment_method` must be `MPESA`.
  - **Rate limit:** 20 orders per IP per hour.
  - **Write order:** customer, then items, then the order row (the commit point), then payment, delivery and inventory (best effort, with failures logged). Sheets has no transactions, so a failure part-way leaves harmless leftovers instead of an order with missing pieces.
- The `adminDashboard` "today" count uses the Nairobi date. Apps Script compared UTC dates, so orders placed between 00:00 and 03:00 EAT were counted as the previous day.
