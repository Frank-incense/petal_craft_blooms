import { randomBytes, randomInt } from 'node:crypto';
import { nairobiDate } from './time.js';

/** Row id like Apps Script's Utils.generateId: `<prefix>_<time><random>`. */
export function generateId(prefix, now = new Date()) {
  return `${prefix}_${now.getTime().toString(36)}${randomBytes(3).toString('hex')}`;
}

/** PCB-YYYYMMDD-NNNNNN, dated in Nairobi time. */
export function generateOrderNumber(now = new Date()) {
  const ymd = nairobiDate(now).replaceAll('-', '');
  return `PCB-${ymd}-${randomInt(100000, 1000000)}`;
}
