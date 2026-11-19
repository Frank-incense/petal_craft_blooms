/**
 * Serialises async work. Replaces Apps Script's LockService for the
 * read-check-write sequences (stock decrement, order creation).
 *
 * Only correct while the server runs as a single instance — see
 * server/README.md.
 */

import { ApiError } from '../envelope.js';

export function createMutex({ timeoutMs = 15000 } = {}) {
  let tail = Promise.resolve();

  return {
    /** Runs fn once every earlier holder has finished. */
    run(fn) {
      const previous = tail;
      let release;
      const mine = new Promise((resolve) => { release = resolve; });
      tail = previous.then(() => mine);

      let timer;
      const waited = new Promise((resolve, reject) => {
        timer = setTimeout(() => reject(new ApiError('LOCK_TIMEOUT', 'Server busy, please retry')), timeoutMs);
        previous.then(resolve);
      });

      return waited
        .then(() => { clearTimeout(timer); return fn(); })
        .finally(() => { clearTimeout(timer); release(); });
    },
  };
}
