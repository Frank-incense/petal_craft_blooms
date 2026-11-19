/**
 * Server-side pricing for custom bouquets from the builder.
 *
 * The client sends the selection ({ flowers, wrapping, ribbon }); the
 * price and description are computed here. Apps Script accepted any
 * client-supplied price up to 50,000 KES.
 *
 * These tables must match src/js/builder.js — test/bouquet.test.js
 * fails if they drift.
 */

import { ApiError } from '../envelope.js';

export const FLOWERS = [
  { id: 'rose',       name: 'Roses',         price: 180 },
  { id: 'lily',       name: 'Lilies',        price: 220 },
  { id: 'tulip',      name: 'Tulips',        price: 130 },
  { id: 'sunflower',  name: 'Sunflowers',    price: 180 },
  { id: 'carnation',  name: 'Carnations',    price: 110 },
  { id: 'babys',      name: "Baby's Breath", price: 90 },
  { id: 'eucalyptus', name: 'Eucalyptus',    price: 70 },
];

export const WRAPPINGS = [
  { id: 'kraft',   name: 'Kraft',   price: 500 },
  { id: 'white',   name: 'White',   price: 600 },
  { id: 'blush',   name: 'Blush',   price: 700 },
  { id: 'premium', name: 'Premium', price: 1000 },
];

export const RIBBONS = [
  { id: 'white',    name: 'White',    price: 100 },
  { id: 'pink',     name: 'Pink',     price: 100 },
  { id: 'burgundy', name: 'Burgundy', price: 150 },
  { id: 'sage',     name: 'Sage',     price: 150 },
  { id: 'gold',     name: 'Gold',     price: 200 },
];

export const MIN_STEMS = 5;
export const MAX_PER_FLOWER = 30;

/**
 * Returns { unitPrice, subtitle } for a builder selection, or throws
 * INVALID_ITEM. The subtitle matches buildSubtitle() in builder.js.
 */
export function priceBouquet(config) {
  const invalid = (msg) => new ApiError('INVALID_ITEM', msg);

  if (!config || typeof config !== 'object' || !config.flowers || typeof config.flowers !== 'object') {
    // Carts saved before server-side pricing have no selection to price.
    throw invalid('Please rebuild your custom bouquet — it was saved in an older format.');
  }

  let stems = 0;
  let flowerTotal = 0;
  const parts = [];
  // Iterate the price table (not the input) so order is stable and
  // unknown keys can't sneak through.
  const seen = new Set();
  for (const f of FLOWERS) {
    if (!Object.hasOwn(config.flowers, f.id)) continue;
    seen.add(f.id);
    const qty = config.flowers[f.id];
    if (!Number.isInteger(qty) || qty < 0 || qty > MAX_PER_FLOWER) throw invalid('Invalid flower quantity in custom bouquet');
    if (qty === 0) continue;
    stems += qty;
    flowerTotal += f.price * qty;
    parts.push(qty + ' ' + f.name);
  }
  for (const id of Object.keys(config.flowers)) {
    if (!seen.has(id)) throw invalid('Unknown flower in custom bouquet: ' + id);
  }
  if (stems < MIN_STEMS) throw invalid(`A custom bouquet needs at least ${MIN_STEMS} stems`);

  const wrap = WRAPPINGS.find((w) => w.id === config.wrapping);
  const ribbon = RIBBONS.find((r) => r.id === config.ribbon);
  if (!wrap) throw invalid('Unknown wrapping in custom bouquet');
  if (!ribbon) throw invalid('Unknown ribbon in custom bouquet');

  let flowerText = parts.slice(0, 3).join(' · ');
  if (parts.length > 3) flowerText += ' +' + (parts.length - 3) + ' more';

  return {
    unitPrice: flowerTotal + wrap.price + ribbon.price,
    subtitle: `${flowerText} · ${wrap.name} wrap · ${ribbon.name} ribbon`,
  };
}
