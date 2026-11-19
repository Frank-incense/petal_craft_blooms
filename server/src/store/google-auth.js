import { GoogleAuth } from 'google-auth-library';

/**
 * Returns getToken() for the Sheets API from a service-account key
 * (raw JSON or base64-encoded JSON). The library caches and refreshes
 * the token.
 */
export function serviceAccountTokenSource(keyText) {
  if (!keyText) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not set');
  const text = keyText.trim().startsWith('{') ? keyText : Buffer.from(keyText, 'base64').toString('utf8');
  let credentials;
  try { credentials = JSON.parse(text); } catch { throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON (or base64 JSON)'); }

  const auth = new GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
  let client;
  return {
    email: credentials.client_email,
    async getToken() {
      client = client || (await auth.getClient());
      const { token } = await client.getAccessToken();
      if (!token) throw new Error('Could not get a Google access token');
      return token;
    },
  };
}
