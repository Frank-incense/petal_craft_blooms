/**
 * Safaricom Daraja client: OAuth token caching and STK Push.
 * Ported from apps-script/Mpesa.js. `fetch` is injectable for tests.
 */

const ENDPOINTS = {
  sandbox: {
    oauth: 'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials',
    stk:   'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest',
  },
  production: {
    oauth: 'https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials',
    stk:   'https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest',
  },
};

const TOKEN_REFRESH_MARGIN_MS = 60_000;
const TIMEOUT_MS = 15_000;

/** Daraja wants YYYYMMDDHHmmss in Nairobi time. */
export function darajaTimestamp(date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Africa/Nairobi', hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(date).map((p) => [p.type, p.value]),
  );
  return `${parts.year}${parts.month}${parts.day}${parts.hour}${parts.minute}${parts.second}`;
}

export function createDarajaClient({ config, fetch = globalThis.fetch, now = () => new Date() }) {
  const m = config.mpesa;
  const urls = ENDPOINTS[m.environment];
  let cached = null; // { token, expiresAt }

  async function getAccessToken() {
    if (cached && now().getTime() < cached.expiresAt) return cached.token;

    const auth = Buffer.from(`${m.consumerKey}:${m.consumerSecret}`).toString('base64');
    const res = await fetch(urls.oauth, {
      headers: { Authorization: 'Basic ' + auth },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`M-Pesa OAuth failed (${res.status}): ${text.slice(0, 300)}`);
    let json;
    try { json = JSON.parse(text); } catch { throw new Error('M-Pesa OAuth returned invalid JSON'); }
    if (!json.access_token) throw new Error('M-Pesa OAuth returned no access_token');

    const ttlMs = (Number(json.expires_in) || 3600) * 1000;
    cached = { token: json.access_token, expiresAt: now().getTime() + ttlMs - TOKEN_REFRESH_MARGIN_MS };
    return cached.token;
  }

  /**
   * Sends an STK Push. Resolves to
   *   { accepted: true,  checkoutRequestId, merchantRequestId, customerMessage }
   *   { accepted: false, code, message }
   * Network/auth failures reject.
   */
  async function stkPush({ amount, phone, accountReference, callbackUrl }) {
    const token = await getAccessToken();
    const timestamp = darajaTimestamp(now());
    const password = Buffer.from(m.shortcode + m.passkey + timestamp).toString('base64');

    const res = await fetch(urls.stk, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        BusinessShortCode: m.shortcode,
        Password:          password,
        Timestamp:         timestamp,
        TransactionType:   m.transactionType,
        Amount:            amount,
        PartyA:            phone,
        PartyB:            m.shortcode,
        PhoneNumber:       phone,
        CallBackURL:       callbackUrl,
        AccountReference:  accountReference,
        TransactionDesc:   'Petal Craft Blooms',
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    const text = await res.text();
    let body;
    try { body = JSON.parse(text); } catch {
      throw new Error(`Daraja returned invalid JSON (${res.status}): ${text.slice(0, 300)}`);
    }

    // A rejected token means our cache is stale; drop it for next time.
    if (res.status === 401) cached = null;

    if (String(body.ResponseCode) === '0') {
      return {
        accepted: true,
        checkoutRequestId: String(body.CheckoutRequestID || ''),
        merchantRequestId: String(body.MerchantRequestID || ''),
        customerMessage:   String(body.CustomerMessage || 'STK Push sent'),
      };
    }
    return {
      accepted: false,
      code: String(body.errorCode || 'STK_REJECTED'),
      message: String(body.ResponseDescription || body.errorMessage || 'STK Push rejected'),
    };
  }

  return { getAccessToken, stkPush };
}
