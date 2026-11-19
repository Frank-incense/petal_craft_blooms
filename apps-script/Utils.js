/**
 * Petal Craft Blooms — Utilities
 * Spreadsheet access + response envelopes + small helpers.
 */

const Utils = {
  // ==================== SPREADSHEET ACCESS ====================
  getSpreadsheet: function () {
    return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  },

  getSheet: function (name) {
    const sheet = Utils.getSpreadsheet().getSheetByName(name);
    if (!sheet) throw new Error('Sheet not found: ' + name);
    return sheet;
  },

  /**
   * Reads all rows of a sheet and returns an array of plain objects
   * keyed by the header row. Values are raw (Dates, numbers, booleans).
   */
  readAllRows: function (sheetName) {
    const sheet = Utils.getSheet(sheetName);
    const values = sheet.getDataRange().getValues();
    if (values.length < 2) return [];
    const headers = values[0];
    return values.slice(1).map(function (row) {
      const obj = {};
      headers.forEach(function (h, i) { obj[h] = row[i]; });
      return obj;
    });
  },

  /**
   * Appends a row whose keys match the sheet headers.
   * Missing keys become empty strings.
   */
  appendRow: function (sheetName, rowObject) {
    const sheet = Utils.getSheet(sheetName);
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const row = headers.map(function (h) {
      return rowObject[h] !== undefined && rowObject[h] !== null ? rowObject[h] : '';
    });
    sheet.appendRow(row);
    return rowObject;
  },

  /**
   * Returns the 1-based row number where columnName === value, or -1.
   */
  findRowByColumn: function (sheetName, columnName, value) {
    const sheet = Utils.getSheet(sheetName);
    const values = sheet.getDataRange().getValues();
    if (values.length < 2) return -1;
    const headers = values[0];
    const colIndex = headers.indexOf(columnName);
    if (colIndex === -1) throw new Error('Column not found: ' + columnName);
    for (let i = 1; i < values.length; i++) {
      if (String(values[i][colIndex]) === String(value)) return i + 1;
    }
    return -1;
  },

  updateRow: function (sheetName, rowNum, rowObject) {
    const sheet = Utils.getSheet(sheetName);
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const row = headers.map(function (h) {
      return rowObject[h] !== undefined && rowObject[h] !== null ? rowObject[h] : '';
    });
    sheet.getRange(rowNum, 1, 1, row.length).setValues([row]);
  },

  // ==================== RESPONSE ENVELOPES ====================
  success: function (data, message) {
    return ContentService
      .createTextOutput(JSON.stringify({
        success: true,
        data: data === undefined ? {} : data,
        message: message || 'Success',
      }))
      .setMimeType(ContentService.MimeType.JSON);
  },

  error: function (message, code) {
    return ContentService
      .createTextOutput(JSON.stringify({
        success: false,
        error: message || 'Unknown error',
        code: code || 'ERROR',
      }))
      .setMimeType(ContentService.MimeType.JSON);
  },

  // ==================== IDS AND DATES ====================
  now: function () {
    return new Date().toISOString();
  },

  generateId: function (prefix) {
    const ts = Date.now().toString(36);
    const rand = Math.random().toString(36).slice(2, 6);
    return (prefix || 'id') + '_' + ts + rand;
  },

  generateOrderNumber: function () {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const rand = Math.floor(100000 + Math.random() * 900000); // 6 digits
    return 'PCB-' + yyyy + mm + dd + '-' + rand;
  },

  // ==================== COERCION ====================
  parseBool: function (v) {
    if (v === true) return true;
    const s = String(v).toLowerCase();
    return s === 'true' || s === '1' || s === 'yes';
  },

  asNumber: function (v, fallback) {
    const n = Number(v);
    return isNaN(n) ? (fallback === undefined ? 0 : fallback) : n;
  },

  asString: function (v) {
    return v === null || v === undefined ? '' : String(v);
  },

    // ==================== SETTINGS ====================
  /**
   * Reads the Settings sheet once and returns a key→coerced-value map.
   * Coercion uses the row's `type` column (string|number|boolean|json).
   */
  getSettingsMap: function () {
    const rows = Utils.readAllRows(CONFIG.SHEETS.SETTINGS);
    const map = {};
    rows.forEach(function (r) {
      let v = r.value;
      const t = String(r.type || 'string').toLowerCase();
      if (t === 'number')  v = Number(v);
      else if (t === 'boolean') v = (String(v).toLowerCase() === 'true' || v === true);
      else if (t === 'json') { try { v = JSON.parse(v); } catch (e) { /* leave raw */ } }
      map[r.key] = v;
    });
    return map;
  },

  // ==================== PHONE NORMALISATION ====================
  /**
   * Normalises a Kenyan phone number to 254XXXXXXXXX for comparison.
   * Accepts 0712…, +254712…, 254712…, 712… (missing prefix tolerated).
   */
  normalisePhone: function (phone) {
    const s = String(phone || '').replace(/\D/g, '');
    if (s.indexOf('254') === 0) return s;
    if (s.indexOf('0') === 0)   return '254' + s.slice(1);
    if (s.length === 9)          return '254' + s; // 712345678
    return s;
  },
};