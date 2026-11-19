import { JWT } from 'google-auth-library';

/**
 * Returns getToken() for the Sheets API from a service-account key
 * (raw JSON or base64-encoded JSON). The library caches and refreshes
 * the token.
 */
export function serviceAccountTokenSource(keyText) {
  if (!keyText) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not set');
  const text = keyText.trim().startsWith('{') ? keyText : Buffer.from(keyText, 'base64').toString('utf8');
  let key;
  try { key = JSON.parse(text); } catch { throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON (or base64 JSON)'); }
  if (key.type !== 'service_account' || !key.client_email || !key.private_key) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not a service-account key');
  }

  const client = new JWT({
    email: key.client_email,
    key: key.private_key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  return {
    email: key.client_email,
    async getToken() {
      const { token } = await client.getAccessToken();
      if (!token) throw new Error('Could not get a Google access token');
      return token;
    },
  };
}
