/**
 * Petal Craft Blooms — M-Pesa Daraja integration
 * Phase 11A: OAuth token caching, STK Push, callback handler.
 *
 * Credentials are read from Script Properties. Never commit them to code.
 * Required properties (Project Settings → Script Properties):
 *   MPESA_CONSUMER_KEY
 *   MPESA_CONSUMER_SECRET
 *   MPESA_PASSKEY
 *   MPESA_SHORTCODE
 *   MPESA_ENVIRONMENT         (sandbox | production)
 *   MPESA_CALLBACK_URL        (optional — auto-derived from deployment)
 *
 * The callback handler delegates to Payments.processCallback, which
 * already does idempotency + order status advancement (Phase 6C).
 */

const Mpesa = {
  // ==================== CREDENTIALS ====================
  getCredentials: function () {
    const props = PropertiesService.getScriptProperties();
    const env = String(props.getProperty('MPESA_ENVIRONMENT') || 'sandbox').toLowerCase();

    const creds = {
      environment:   env,
      consumerKey:   props.getProperty('MPESA_CONSUMER_KEY')    || '',
      consumerSecret:props.getProperty('MPESA_CONSUMER_SECRET') || '',
      passkey:       props.getProperty('MPESA_PASSKEY')         || '',
      shortcode:     props.getProperty('MPESA_SHORTCODE')       ||
                     CONFIG.MPESA.ENVIRONMENTS[env].DEFAULT_SHORTCODE,
    };

    const missing = [];
    if (!creds.consumerKey)    missing.push('MPESA_CONSUMER_KEY');
    if (!creds.consumerSecret) missing.push('MPESA_CONSUMER_SECRET');
    if (!creds.passkey)        missing.push('MPESA_PASSKEY');
    if (!creds.shortcode)      missing.push('MPESA_SHORTCODE');

    if (missing.length) {
      throw new Error('Missing M-Pesa credentials in Script Properties: ' + missing.join(', '));
    }
    return creds;
  },

  // ==================== CALLBACK URL ====================
  getCallbackUrl: function () {
    const props = PropertiesService.getScriptProperties();
    const explicit = props.getProperty('MPESA_CALLBACK_URL');
    const url = explicit && explicit.trim() ? explicit.trim() : (function () {
      try { return ScriptApp.getService().getUrl(); } catch (e) { return ''; }
    })();

    if (!url) throw new Error('Cannot determine callback URL. Set MPESA_CALLBACK_URL in Script Properties.');

    // Daraja's STK Push rejects URLs with query strings, fragments, or
    // trailing whitespace. Return the bare HTTPS URL.
    return url.split('#')[0].split('?')[0].replace(/\s+$/, '');
  },

  // ==================== OAUTH ====================
  getAccessToken: function () {
    const props = PropertiesService.getScriptProperties();
    const cached = props.getProperty('MPESA_ACCESS_TOKEN');
    const expiresAt = Number(props.getProperty('MPESA_TOKEN_EXPIRES_AT') || 0);

    if (cached && Date.now() < expiresAt) return cached;

    const creds = this.getCredentials();
    const endpoints = CONFIG.MPESA.ENVIRONMENTS[creds.environment];
    const auth = Utilities.base64Encode(creds.consumerKey + ':' + creds.consumerSecret);

    const res = UrlFetchApp.fetch(endpoints.OAUTH_URL, {
      method: 'get',
      headers: { Authorization: 'Basic ' + auth },
      muteHttpExceptions: true,
    });

    if (res.getResponseCode() !== 200) {
      throw new Error('M-Pesa OAuth failed (' + res.getResponseCode() + '): ' + res.getContentText());
    }

    let json;
    try { json = JSON.parse(res.getContentText()); } catch (e) {
      throw new Error('M-Pesa OAuth returned invalid JSON: ' + res.getContentText());
    }
    if (!json.access_token) {
      throw new Error('M-Pesa OAuth returned no access_token: ' + res.getContentText());
    }

    const ttlMs = (Number(json.expires_in) || 3600) * 1000;
    const safeExpiry = Date.now() + ttlMs - CONFIG.MPESA.TOKEN_REFRESH_MARGIN_MS;

    props.setProperties({
      MPESA_ACCESS_TOKEN: json.access_token,
      MPESA_TOKEN_EXPIRES_AT: String(safeExpiry),
    });
    return json.access_token;
  },

  // ==================== HELPERS ====================
  /**
   * Daraja wants YYYYMMDDHHmmss in the script's timezone.
   * The project should have its timezone set to Africa/Nairobi.
   */
  generateTimestamp: function () {
    const d = new Date();
    return d.getFullYear() +
           String(d.getMonth() + 1).padStart(2, '0') +
           String(d.getDate()).padStart(2, '0') +
           String(d.getHours()).padStart(2, '0') +
           String(d.getMinutes()).padStart(2, '0') +
           String(d.getSeconds()).padStart(2, '0');
  },

  generateStkPassword: function (shortcode, passkey, timestamp) {
    return Utilities.base64Encode(shortcode + passkey + timestamp);
  },

  
  normalisePhone: function (phone) {
    return Utils.normalisePhone(phone);
  },

  // ==================== STK PUSH ====================
  /**
   * Initiates an STK Push for an order.
   *
   * Does NOT create or modify any database rows except the M-Pesa request
   * identifiers on the Payments sheet (via Payments.recordStkPushRequested).
   * The callback handler is what marks the payment as PAID or FAILED.
   *
   * Returns { ok, message, checkoutRequestId, merchantRequestId } — a plain
   * object, not a JSON envelope, so Api.gs can decide the response shape.
   */
  initiateStkPush: function (orderNumber, phone) {
    if (!orderNumber) return { ok: false, message: 'Missing orderNumber', code: 'MISSING_ID' };
    if (!phone)       return { ok: false, message: 'Missing phone',       code: 'MISSING_ID' };

    // Verify the order exists and is still payable.
    const orderRow = Utils.findRowByColumn(CONFIG.SHEETS.ORDERS, 'id', orderNumber);
    if (orderRow <= 0) return { ok: false, message: 'Order not found', code: 'NOT_FOUND' };

    const orderSheet = Utils.getSheet(CONFIG.SHEETS.ORDERS);
    const orderHeaders = orderSheet.getRange(1, 1, 1, orderSheet.getLastColumn()).getValues()[0];
    const orderRaw = orderSheet.getRange(orderRow, 1, 1, orderHeaders.length).getValues()[0];
    const order = {};
    orderHeaders.forEach(function (h, i) { order[h] = orderRaw[i]; });

    if (String(order.payment_status) === CONFIG.PAYMENT_STATUS.PAID) {
      return { ok: false, message: 'Order already paid', code: 'ALREADY_PAID' };
    }
    if (String(order.status) === CONFIG.ORDER_STATUS.CANCELLED) {
      return { ok: false, message: 'Order is cancelled', code: 'CANCELLED' };
    }

    // The amount always comes from the order — never from the client.
    const amt = Math.round(Number(order.total));
    if (!isFinite(amt) || amt < 1) {
      return { ok: false, message: 'Invalid amount', code: 'INVALID_AMOUNT' };
    }

    const creds = this.getCredentials();
    const endpoints = CONFIG.MPESA.ENVIRONMENTS[creds.environment];
    const token = this.getAccessToken();
    const timestamp = this.generateTimestamp();
    const password = this.generateStkPassword(creds.shortcode, creds.passkey, timestamp);
    const msisdn = this.normalisePhone(phone);

    if (msisdn.length !== 12) {
      return { ok: false, message: 'Invalid phone number', code: 'INVALID_PHONE' };
    }

    const callbackUrl = this.getCallbackUrl();

    const payload = {
      BusinessShortCode: creds.shortcode,
      Password:          password,
      Timestamp:         timestamp,
      TransactionType:   CONFIG.MPESA.TRANSACTION_TYPE,
      Amount:            amt,             // Daraja requires an integer
      PartyA:            msisdn,
      PartyB:            creds.shortcode,
      PhoneNumber:       msisdn,
      CallbackURL:       callbackUrl,
      // AccountReference: max 12 chars. Use the date portion for human recognition.
      AccountReference:  orderNumber.slice(0, 12),
      TransactionDesc:   'Petal Craft Blooms',
    };
    let res;
    try {
      res = UrlFetchApp.fetch(endpoints.STK_URL, {
        method: 'post',
        contentType: 'application/json',
        headers: { Authorization: 'Bearer ' + token },
        payload: JSON.stringify(payload),
        muteHttpExceptions: true,
      });
    } catch (fetchErr) {
      return { ok: false, message: 'Daraja unreachable: ' + fetchErr.message, code: 'NETWORK' };
    }

    const bodyText = res.getContentText();
    let body;
    try { body = JSON.parse(bodyText); } catch (e) {
      return { ok: false, message: 'Daraja returned invalid JSON', code: 'INVALID_JSON', raw: bodyText };
    }

    // Daraja returns ResponseCode "0" on accepted, non-zero otherwise.
    const accepted = String(body.ResponseCode) === '0';

    // Persist identifiers on the payment row (best-effort; STK Push already sent)
    try {
      if (accepted) {
        Payments.recordStkPushRequested(
          orderNumber,
          body.CheckoutRequestID || '',
          body.MerchantRequestID || '',
          msisdn
        );
      }
    } catch (e) {
      Logger.log('Failed to record STK push identifiers: ' + e.message);
    }

    if (!accepted) {
      return {
        ok: false,
        message: body.ResponseDescription || body.errorMessage || 'STK Push rejected',
        code: body.errorCode || 'STK_REJECTED',
        raw: body,
      };
    }

    return {
      ok: true,
      message: body.CustomerMessage || 'STK Push sent',
      checkoutRequestId: body.CheckoutRequestID,
      merchantRequestId: body.MerchantRequestID,
      raw: body,
    };
  },

  // ==================== CALLBACK ====================
  /**
   * Handles the POST from Safaricom. `e` is the Apps Script event object.
   *
   * Shape of the Daraja callback (abbreviated):
   *   { "Body": { "stkCallback": {
   *       "MerchantRequestID": "...",
   *       "CheckoutRequestID": "...",
   *       "ResultCode": 0,
   *       "ResultDesc": "...",
   *       "CallbackMetadata": { "Item": [ { Name, Value }, … ] }
   *   }}}
   *
   * Returns the Daraja-shaped acknowledgement, regardless of internal result.
   * If our internal processing fails we still ACK so Daraja doesn't retry
   * indefinitely — the failure is logged for admin follow-up.
   */
  handleCallback: function (e) {
    let payload;
    try {
      payload = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    } catch (parseErr) {
      Logger.log('M-Pesa callback: could not parse body: ' + parseErr.message);
      return this.ackResponse();
    }

    const stk = payload && payload.Body && payload.Body.stkCallback;
    if (!stk) {
      Logger.log('M-Pesa callback: unexpected shape: ' + JSON.stringify(payload).slice(0, 400));
      return this.ackResponse();
    }

    const checkoutRequestId = String(stk.CheckoutRequestID || '');
    const resultCode        = String(stk.ResultCode);
    const resultDesc        = String(stk.ResultDesc || '');

    // Extract receipt + phone from metadata when present
    let mpesaReceipt = '';
    let mpesaPhone   = '';
    let paidAmount   = null;
    if (stk.CallbackMetadata && Array.isArray(stk.CallbackMetadata.Item)) {
      stk.CallbackMetadata.Item.forEach(function (item) {
        if (item.Name === 'MpesaReceiptNumber') mpesaReceipt = String(item.Value);
        if (item.Name === 'PhoneNumber')        mpesaPhone   = String(item.Value);
        if (item.Name === 'Amount')             paidAmount   = Number(item.Value);
      });
    }

    // Callbacks are matched on CheckoutRequestID only. Without one there is
    // nothing safe to update.
    if (!checkoutRequestId) {
      Logger.log('M-Pesa callback: missing CheckoutRequestID — ignored.');
      return this.ackResponse();
    }

    try {
      Payments.processCallback({
        checkoutRequestId: checkoutRequestId,
        resultCode:        resultCode,
        resultDesc:        resultDesc,
        mpesaReceipt:      mpesaReceipt,
        mpesaPhone:        mpesaPhone,
        amount:            paidAmount,
        rawResponse:       payload,
      });
    } catch (err) {
      // Log for admin; still ACK so Daraja doesn't retry on our bug.
      Logger.log('M-Pesa callback processing failed: ' + err.message + '\n' + err.stack);
    }

    return this.ackResponse();
  },

  /**
   * The 200 the Daraja API expects when a callback is received.
   */
  ackResponse: function () {
    return ContentService
      .createTextOutput(JSON.stringify(CONFIG.MPESA.ACK))
      .setMimeType(ContentService.MimeType.JSON);
  },
};