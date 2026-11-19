import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createMemoryStore } from './store/memory-store.js';
import { createSheetsStore } from './store/sheets-store.js';
import { serviceAccountTokenSource } from './store/google-auth.js';

const config = loadConfig();

async function createStore() {
  if (config.dataStore === 'memory') return createMemoryStore();

  if (!config.sheets.spreadsheetId) throw new Error('SPREADSHEET_ID is not set');
  const auth = serviceAccountTokenSource(config.sheets.serviceAccountJson);
  const store = createSheetsStore({
    spreadsheetId: config.sheets.spreadsheetId,
    getToken: auth.getToken,
    refreshMs: config.sheets.refreshMs,
  });
  await store.load();
  store.startAutoRefresh();
  console.log(`[server] loaded spreadsheet ${config.sheets.spreadsheetId} as ${auth.email}`);
  return store;
}

const store = await createStore();
const app = createApp({ store, config });

const server = app.listen(config.port, () => {
  console.log(`[server] listening on http://localhost:${config.port} (store: ${config.dataStore})`);
});

// Render sends SIGTERM before replacing the instance on each deploy.
// Stop accepting connections and let in-flight requests (an order being
// written to the sheet, a payment callback) finish first.
process.on('SIGTERM', () => {
  console.log('[server] SIGTERM: finishing in-flight requests');
  store.stop?.();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 25_000).unref();
});
