import { ApiError } from '../envelope.js';

/**
 * Fixed-window counter per key (in memory, single instance).
 *
 *   check(key)  throws RATE_LIMITED once `max` hits are recorded in the window
 *   hit(key)    records one hit
 *
 * Callers decide what counts as a hit, e.g. only failed order lookups.
 */
export function createRateLimiter({ max, windowMs, now = () => new Date() }) {
  const buckets = new Map();

  function bucket(key) {
    const t = now().getTime();
    let b = buckets.get(key);
    if (!b || t >= b.resetAt) {
      b = { count: 0, resetAt: t + windowMs };
      buckets.set(key, b);
    }
    return b;
  }

  // Drop expired buckets so the map can't grow without bound.
  function sweep() {
    const t = now().getTime();
    for (const [key, b] of buckets) if (t >= b.resetAt) buckets.delete(key);
  }

  return {
    check(key) {
      if (bucket(key).count >= max) {
        throw new ApiError('RATE_LIMITED', 'Too many attempts. Please wait a few minutes and try again.');
      }
    },
    hit(key) {
      bucket(key).count++;
      if (buckets.size > 10000) sweep();
    },
  };
}
