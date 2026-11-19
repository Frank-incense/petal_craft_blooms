import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createMemoryStore } from '../src/store/memory-store.js';

export const FIXED_NOW = new Date('2026-11-19T09:30:00.000Z');

const silentLogger = { error() {}, log() {}, warn() {} };

/** Builds an app wired to an in-memory store. Pass overrides as needed. */
export function makeApp({ seed, env = {}, ...overrides } = {}) {
  const store = overrides.store || createMemoryStore(seed);
  const config = loadConfig({ CORS_ORIGINS: 'https://shop.example', ADMIN_TOKEN: 'test-admin-token', ...env });
  const app = createApp({ store, config, now: () => FIXED_NOW, logger: silentLogger, ...overrides });
  return { app, store, config };
}
