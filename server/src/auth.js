import { timingSafeEqual, createHash } from 'node:crypto';
import { ApiError } from './envelope.js';

/**
 * Admin actions require `token` (body or query) to equal ADMIN_TOKEN.
 * With no ADMIN_TOKEN configured, every admin call is refused.
 */
export function requireAdmin(ctx) {
  const expected = ctx.config.adminToken;
  const given = ctx.input.token;
  if (!expected || typeof given !== 'string' || !safeEqual(given, expected)) {
    throw new ApiError('UNAUTHORIZED', 'Unauthorized');
  }
}

// Hash first so the comparison is constant-time regardless of length.
function safeEqual(a, b) {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}
