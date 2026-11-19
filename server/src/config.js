/**
 * Reads configuration from environment variables (see .env.example).
 */

export function loadConfig(env = process.env) {
  const store = env.DATA_STORE || 'memory';
  if (!['memory', 'sheets'].includes(store)) {
    throw new Error(`DATA_STORE must be "memory" or "sheets", got "${store}"`);
  }

  return {
    port: Number(env.PORT) || 3000,
    dataStore: store,
    corsOrigins: (env.CORS_ORIGINS || 'http://localhost:5173')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    adminToken: env.ADMIN_TOKEN || '',
  };
}
