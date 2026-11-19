/**
 * Reads configuration from environment variables (see .env.example).
 */

export function loadConfig(env = process.env) {
  const store = env.DATA_STORE || 'memory';
  if (!['memory', 'sheets'].includes(store)) {
    throw new Error(`DATA_STORE must be "memory" or "sheets", got "${store}"`);
  }

  const mpesaEnv = (env.MPESA_ENVIRONMENT || 'sandbox').toLowerCase();
  if (!['sandbox', 'production'].includes(mpesaEnv)) {
    throw new Error(`MPESA_ENVIRONMENT must be "sandbox" or "production", got "${mpesaEnv}"`);
  }

  const publicBaseUrl = (env.PUBLIC_BASE_URL || '').replace(/\/+$/, '');

  return {
    port: Number(env.PORT) || 3000,
    dataStore: store,
    corsOrigins: (env.CORS_ORIGINS || 'http://localhost:5173')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    adminToken: env.ADMIN_TOKEN || '',
    // Public HTTPS origin of this server, used to build the M-Pesa callback URL.
    publicBaseUrl,
    mpesa: {
      environment:     mpesaEnv,
      consumerKey:     env.MPESA_CONSUMER_KEY || '',
      consumerSecret:  env.MPESA_CONSUMER_SECRET || '',
      passkey:         env.MPESA_PASSKEY || '',
      // Safaricom's public sandbox shortcode when none is set.
      shortcode:       env.MPESA_SHORTCODE || (mpesaEnv === 'sandbox' ? '174379' : ''),
      // CustomerPayBillOnline for PayBill, CustomerBuyGoodsOnline for Till.
      transactionType: env.MPESA_TRANSACTION_TYPE || 'CustomerPayBillOnline',
      // Path segment of the callback URL; unguessable so callbacks can't be forged.
      callbackSecret:  env.MPESA_CALLBACK_SECRET || '',
    },
  };
}

/** Names of missing settings that initiateStkPush needs, or [] when ready. */
export function missingMpesaConfig(config) {
  const m = config.mpesa;
  const missing = [];
  if (!m.consumerKey)    missing.push('MPESA_CONSUMER_KEY');
  if (!m.consumerSecret) missing.push('MPESA_CONSUMER_SECRET');
  if (!m.passkey)        missing.push('MPESA_PASSKEY');
  if (!m.shortcode)      missing.push('MPESA_SHORTCODE');
  if (!m.callbackSecret || m.callbackSecret.length < 24) missing.push('MPESA_CALLBACK_SECRET (24+ chars)');
  if (!/^https:\/\//.test(config.publicBaseUrl)) missing.push('PUBLIC_BASE_URL (https)');
  return missing;
}
