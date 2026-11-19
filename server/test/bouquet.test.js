import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { FLOWERS, WRAPPINGS, RIBBONS, MIN_STEMS, MAX_PER_FLOWER, priceBouquet } from '../src/lib/bouquet.js';

describe('priceBouquet', () => {
  it('prices flowers + wrapping + ribbon', () => {
    // 3 roses (540) + 2 tulips (260) = 800, premium wrap 1000, gold ribbon 200
    expect(priceBouquet({ flowers: { rose: 3, tulip: 2 }, wrapping: 'premium', ribbon: 'gold' })).toEqual({
      unitPrice: 2000,
      subtitle: '3 Roses · 2 Tulips · Premium wrap · Gold ribbon',
    });
  });

  it('lists flowers in builder order and summarises beyond three', () => {
    const { subtitle } = priceBouquet({
      flowers: { eucalyptus: 1, rose: 1, lily: 1, tulip: 1, babys: 1 }, wrapping: 'kraft', ribbon: 'white',
    });
    expect(subtitle).toBe('1 Roses · 1 Lilies · 1 Tulips +2 more · Kraft wrap · White ribbon');
  });

  it('ignores zero quantities', () => {
    expect(priceBouquet({ flowers: { rose: 5, lily: 0 }, wrapping: 'kraft', ribbon: 'white' }).subtitle)
      .toBe('5 Roses · Kraft wrap · White ribbon');
  });

  it.each([
    ['no selection (cart saved before this change)', undefined, /older format/],
    ['flowers missing', { wrapping: 'kraft', ribbon: 'white' }, /older format/],
    ['too few stems', { flowers: { rose: 4 }, wrapping: 'kraft', ribbon: 'white' }, /at least 5 stems/],
    ['unknown flower', { flowers: { rose: 5, orchid: 1 }, wrapping: 'kraft', ribbon: 'white' }, /Unknown flower/],
    ['prototype key', JSON.parse('{"flowers":{"rose":5,"__proto__":1},"wrapping":"kraft","ribbon":"white"}'), /Unknown flower/],
    ['negative quantity', { flowers: { rose: 6, lily: -1 }, wrapping: 'kraft', ribbon: 'white' }, /Invalid flower quantity/],
    ['fractional quantity', { flowers: { rose: 5.5 }, wrapping: 'kraft', ribbon: 'white' }, /Invalid flower quantity/],
    ['quantity as string', { flowers: { rose: '5' }, wrapping: 'kraft', ribbon: 'white' }, /Invalid flower quantity/],
    ['over the per-flower max', { flowers: { rose: 31 }, wrapping: 'kraft', ribbon: 'white' }, /Invalid flower quantity/],
    ['unknown wrapping', { flowers: { rose: 5 }, wrapping: 'gold-leaf', ribbon: 'white' }, /Unknown wrapping/],
    ['unknown ribbon', { flowers: { rose: 5 }, wrapping: 'kraft', ribbon: 'silk' }, /Unknown ribbon/],
  ])('rejects %s', (_, config, message) => {
    expect(() => priceBouquet(config)).toThrow(expect.objectContaining({ code: 'INVALID_ITEM', message: expect.stringMatching(message) }));
  });
});

describe('price tables match src/js/builder.js', () => {
  const source = readFileSync(fileURLToPath(new URL('../../src/js/builder.js', import.meta.url)), 'utf8');

  // Evaluates `const NAME = <literal>;` from the builder source.
  function extract(name) {
    const match = source.match(new RegExp(`const ${name} = ([\\s\\S]*?);\\n`));
    if (!match) throw new Error(`${name} not found in builder.js`);
    return new Function(`return (${match[1]});`)();
  }
  const pick = (list) => list.map(({ id, name, price }) => ({ id, name, price }));

  it('flowers', () => expect(pick(extract('FLOWERS'))).toEqual(FLOWERS));
  it('wrappings', () => expect(pick(extract('WRAPPINGS'))).toEqual(WRAPPINGS));
  it('ribbons', () => expect(pick(extract('RIBBONS'))).toEqual(RIBBONS));
  it('limits', () => {
    expect(extract('MIN_STEMS')).toBe(MIN_STEMS);
    expect(extract('MAX_PER_FLOWER')).toBe(MAX_PER_FLOWER);
  });
});
