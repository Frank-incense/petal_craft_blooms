/**
 * The business runs on Nairobi time (the Apps Script project's timezone).
 * The server itself runs in UTC on Render, so convert explicitly.
 */

export const TIMEZONE = 'Africa/Nairobi';

const dateFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit',
});

/** 'YYYY-MM-DD' in Nairobi for the given instant, or '' if unparseable. */
export function nairobiDate(value) {
  if (value === '' || value === null || value === undefined) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return dateFmt.format(d);
}
