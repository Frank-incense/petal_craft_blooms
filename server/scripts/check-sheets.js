/**
 * Read-only check of the configured spreadsheet:
 *   npm run check:sheets
 *
 * Loads every tab through the Sheets store (no writes) and reports row
 * counts, missing/extra columns, and values the server will have to
 * cope with (phones stored as numbers, dates stored as dates, etc.).
 */

import { loadConfig } from '../src/config.js';
import { createSheetsStore } from '../src/store/sheets-store.js';
import { serviceAccountTokenSource } from '../src/store/google-auth.js';
import { SCHEMA, TABLES } from '../src/schema.js';

const config = loadConfig();
if (!config.sheets.spreadsheetId) {
  console.error('SPREADSHEET_ID is not set (see .env.example)');
  process.exit(1);
}

const auth = serviceAccountTokenSource(config.sheets.serviceAccountJson);
const warnings = [];
const store = createSheetsStore({
  spreadsheetId: config.sheets.spreadsheetId,
  getToken: auth.getToken,
  logger: { warn: (m) => warnings.push(m), error: console.error, log: console.log },
});

console.log(`Service account: ${auth.email}`);
console.log(`Spreadsheet:     ${config.sheets.spreadsheetId}\n`);

try {
  await store.load();
} catch (err) {
  console.error('Could not load the spreadsheet:\n  ' + err.message);
  if (/403/.test(err.message)) console.error(`\nShare the spreadsheet with ${auth.email} (Editor) and enable the Google Sheets API.`);
  if (/404/.test(err.message)) console.error('\nCheck SPREADSHEET_ID.');
  process.exit(1);
}

for (const name of Object.keys(SCHEMA)) {
  const rows = await store.all(name);
  console.log(`${name.padEnd(24)} ${String(rows.length).padStart(5)} rows`);
}

const notes = [];
const orders = await store.all(TABLES.ORDERS);
const numericPhones = orders.filter((o) => typeof o.customer_phone === 'number').length;
if (numericPhones) notes.push(`${numericPhones} order phone(s) are stored as numbers (leading 0 lost). Lookups still match; new rows are written as text.`);
const odd = orders.filter((o) => o.delivery_date && !/^\d{4}-\d{2}-\d{2}$/.test(String(o.delivery_date)));
if (odd.length) notes.push(`${odd.length} delivery_date value(s) aren't YYYY-MM-DD, e.g. "${odd[0].delivery_date}". The tracking page shows them as-is.`);
const products = await store.all(TABLES.PRODUCTS);
const badPrice = products.filter((p) => typeof p.price !== 'number');
if (badPrice.length) notes.push(`${badPrice.length} product(s) have a non-numeric price, e.g. ${badPrice[0].id}: "${badPrice[0].price}". They can't be ordered.`);

console.log(warnings.length || notes.length ? '\nNotes:' : '\nNo problems found.');
for (const w of warnings) console.log('  - ' + w.replace('[sheets] ', ''));
for (const n of notes) console.log('  - ' + n);
