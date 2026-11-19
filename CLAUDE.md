# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Petal Craft Blooms: a storefront for a Nairobi florist. It has a retail shop with a custom bouquet builder, checkout with M-Pesa payment, and order tracking, plus a separate B2B wholesale export catalogue priced in USD. It is a vanilla-JS single-page app served by Vite. There is no framework, no TypeScript, no test suite and no linter.

## Commands

```bash
npm run dev        # Vite dev server
npm run dev:css    # Tailwind watcher: src/style.css -> src/output.css (run alongside `dev`)
npm run build:css  # One-off minified Tailwind build
npm run build      # Vite production build -> dist/
npm run preview    # Serve dist/
```

The API server in `server/` is a separate package. Run its commands from `server/`: `npm run dev`, `npm test`, or `npx vitest run test/<file>` for a single file. See `server/README.md`.

Tailwind is **not** wired into Vite. `index.html` links the prebuilt `src/output.css` directly. After adding or changing Tailwind classes, run `dev:css` or `build:css`, or the new classes won't exist. Do not hand-edit `output.css`.

## Architecture

### Shell + router
- `index.html` is the persistent shell: the nav, the `<main id="view">` container and the footer. It loads every JS file with `<script>` tags. There is no bundler-level import graph.
- `src/js/router.js` does hash routing (`#/shop`, `#/wholesale/cart`, …). The `ROUTES` table maps each path to an HTML fragment in `src/views/`. The router `fetch`es the fragment, injects it into `#view`, then dispatches **`petal:view-loaded`** on `document`. `/occasions`, `/about` and `/reviews` reuse `home.html` and scroll to a section id.
- To add a page, add a fragment in `src/views/`, add a `ROUTES` entry, and (if it belongs in the nav) a `data-nav-route` link plus a branch in `updateActiveNav`.

### Module pattern
Every JS file is an IIFE that publishes a global on `window` and talks to other modules through `CustomEvent`s on `document`. Files do not use `import`/`export`.

| Global | File | Role |
|---|---|---|
| `PetalApi` | `api.js` | Backend client (`call` = GET, `post` = POST) |
| `PetalRouter` | `router.js` | `navigate(path)`, `getCurrentRoute()` |
| `PetalCart` | `cart.js` | Retail cart, drawer UI, badge |
| `PetalProducts` | `products.js` | Product catalogue; renders featured grid + shop grid |
| `PetalWholesaleCatalog` | `wholesale_catalog.js` | Wholesale variety data, SKU generation, USD pricing |
| `PetalWholesaleCart` | `wholesale-cart.js` | B2B cart with MOQ and volume discounts |

`builder.js`, `checkout.js`, `tracking.js` and `wholesale-catalogue.js` are view controllers that don't publish a global. Watch the near-identical names: `wholesale_catalog.js` holds the data, `wholesale-catalogue.js` drives the catalogue view.

**View lifecycle convention:** each view controller listens for `petal:view-loaded` and returns early unless its anchor element is present. The anchors are `#checkout-form`, `#flower-grid`, `#shop-grid`/`#featured-grid`, `#w-tbody` and `#wc-content`. Because each navigation mounts a fresh fragment, per-element listeners disappear with the old DOM and need no teardown. Behaviour that must survive view swaps (as in `app.js`) is delegated on `document` and bound once.

Events: `petal:view-loaded`, `petal:cart-updated`, `petal:wholesale-cart-updated`, `petal:products-loading`, `petal:products-loaded`.

### Backend (Google Apps Script)
- The base URL comes from `<meta name="petal-api-url">` in `index.html`, or from `window.PETAL_API_URL` if that is set.
- Responses use the envelope `{ success, data, error, code }`. `PetalApi` unwraps `data` or throws an `Error` with a `.code`.
- **POST requests must not set any headers**, including `Content-Type`. Any custom header triggers a CORS preflight, and Apps Script can't answer it. See the header comment in `api.js`.
- Actions in use: `getProducts`, `createOrder`, `initiateStkPush`, `getPayments` (polled during M-Pesa payment), `getOrder`, `getDelivery`.
- The Apps Script source is in `apps-script/`, a clasp project. `Api.js` maps actions to modules. The data lives in a Google Sheet with one tab per entity; the column schemas are in `setupSheets()` in `Code.js`. M-Pesa credentials are kept in Script Properties, not in the code.
- To deploy Apps Script changes, run these from `apps-script/`: `npx @google/clasp push`, then `npx @google/clasp version "<desc>"`, then `npx @google/clasp redeploy <prod deploymentId> -V <n>`. The production deployment ID is the `AKfycbzc…` value in the `petal-api-url` meta. Redeploying that ID keeps the URL unchanged.
- When testing POSTs with curl, use `curl -sL -d '<json>' <url>`, **not** `-X POST`. Apps Script answers with a 302 to a URL that only accepts GET.

### API server (migration in progress)
- `server/` is the Node/Express replacement for Apps Script. It runs on Render and keeps Google Sheets as the data store.
- It speaks the exact same protocol. Each action is a handler in `server/src/actions/`, called with `ctx = { input, store, lock, config, now }`. A handler returns its data and throws `ApiError(code, message)` for expected failures.
- When porting an action, copy the behaviour and error codes from the matching `apps-script/*.js` module, and add a contract test.
- The progress checklist is in `server/README.md`.

### localStorage keys
- `petal_craft_cart`: the retail cart. An inline script in `index.html` also reads it to set the badge before the modules load.
- `petal_craft_wholesale_cart`: kept deliberately separate from the retail cart.
- `petal_craft_last_order`: written by checkout and used by tracking to prefill the lookup form.

### Styling
- Tailwind v4 CLI. `src/style.css` loads the v3-style `tailwind.config.js` through `@config`. That file defines the brand palette (`forest`, `sage`, `cream`, `ivory`, `blush`, `rose`, `beige`, `charcoal`, `stone`), the `font-display` (Playfair Display) and `font-body` (Inter) families, and `max-w-container` (1240px).
- `hover:` and `group-hover:` are redefined in `style.css` so they also match a `.hover-active` class. `app.js` (`initHoverPolyfill`) adds that class on mouseover, for environments where Chrome won't fire native `:hover`. Keep this in mind when debugging hover styles.

## Known rough edges (verify before relying on them)
- `index.html` loads `wholesale-catalogue.js` twice (once as a module, once as a classic script). It also references `src/js/wholesale-catalog.js`, which doesn't exist.
- In `products.js`, `FALLBACK_PRODUCTS` is commented out but still referenced. If the API is unconfigured or fails, that path throws a `ReferenceError`.
- `app.js` `hashToViewPath` prefetches `views/<route>.html`, but the router fetches `./src/views/<route>.html`, so the prefetch misses.
