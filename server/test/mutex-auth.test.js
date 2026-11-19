import { describe, it, expect } from 'vitest';
import { createMutex } from '../src/lib/mutex.js';
import { requireAdmin } from '../src/auth.js';
import { loadConfig } from '../src/config.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

describe('mutex', () => {
  it('runs holders one at a time, in order', async () => {
    const lock = createMutex();
    const log = [];
    const task = (name, ms) => lock.run(async () => {
      log.push(name + ':start');
      await sleep(ms);
      log.push(name + ':end');
      return name;
    });
    const results = await Promise.all([task('a', 20), task('b', 5), task('c', 1)]);
    expect(results).toEqual(['a', 'b', 'c']);
    expect(log).toEqual(['a:start', 'a:end', 'b:start', 'b:end', 'c:start', 'c:end']);
  });

  it('releases the lock when a holder throws', async () => {
    const lock = createMutex();
    await expect(lock.run(() => { throw new Error('boom'); })).rejects.toThrow('boom');
    expect(await lock.run(() => 'next')).toBe('next');
  });

  it('gives up with LOCK_TIMEOUT when the wait is too long', async () => {
    const lock = createMutex({ timeoutMs: 20 });
    const slow = lock.run(() => sleep(60));
    await expect(lock.run(() => 'never')).rejects.toMatchObject({ code: 'LOCK_TIMEOUT' });
    await slow;
    expect(await lock.run(() => 'after')).toBe('after');
  });
});

describe('requireAdmin', () => {
  const ctx = (token, adminToken = 'right-token') => ({
    input: { token },
    config: loadConfig({ ADMIN_TOKEN: adminToken }),
  });

  it('accepts the configured token', () => {
    expect(() => requireAdmin(ctx('right-token'))).not.toThrow();
  });

  it.each([['wrong-token'], [''], [undefined], [['right-token']]])('rejects token %j', (token) => {
    expect(() => requireAdmin(ctx(token))).toThrow(expect.objectContaining({ code: 'UNAUTHORIZED' }));
  });

  it('refuses everything when no ADMIN_TOKEN is configured', () => {
    expect(() => requireAdmin(ctx('', ''))).toThrow(expect.objectContaining({ code: 'UNAUTHORIZED' }));
  });
});
