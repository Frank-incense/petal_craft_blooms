import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createMemoryStore } from './store/memory-store.js';

const config = loadConfig();

if (config.dataStore === 'sheets') {
  // Arrives in phase 5.
  throw new Error('DATA_STORE=sheets is not implemented yet; use DATA_STORE=memory');
}

const store = createMemoryStore();
const app = createApp({ store, config });

app.listen(config.port, () => {
  console.log(`[server] listening on http://localhost:${config.port} (store: ${config.dataStore})`);
});
