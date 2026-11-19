import { describe, it, expect } from 'vitest';
import { createMemoryStore } from '../src/store/memory-store.js';
import { TABLES } from '../src/schema.js';

const { PRODUCTS, INVENTORY } = TABLES;

describe('memory store', () => {
  it('fills missing columns with empty strings', async () => {
    const store = createMemoryStore({ [PRODUCTS]: [{ id: 'p1', name: 'Rose', price: 100 }] });
    const [row] = await store.all(PRODUCTS);
    expect(row.id).toBe('p1');
    expect(row.price).toBe(100);
    expect(row.description).toBe('');
    expect(Object.keys(row)).toHaveLength(13);
  });

  it('returns copies, so callers cannot mutate stored rows', async () => {
    const store = createMemoryStore({ [PRODUCTS]: [{ id: 'p1', name: 'Rose' }] });
    const rows = await store.all(PRODUCTS);
    rows[0].name = 'changed';
    const found = await store.find(PRODUCTS, (r) => r.id === 'p1');
    found.name = 'changed again';
    expect((await store.all(PRODUCTS))[0].name).toBe('Rose');
  });

  it('finds a row or returns null', async () => {
    const store = createMemoryStore({ [PRODUCTS]: [{ id: 'p1' }, { id: 'p2' }] });
    expect((await store.find(PRODUCTS, (r) => r.id === 'p2')).id).toBe('p2');
    expect(await store.find(PRODUCTS, (r) => r.id === 'p3')).toBeNull();
  });

  it('inserts rows', async () => {
    const store = createMemoryStore();
    await store.insert(PRODUCTS, { id: 'p1', name: 'Rose' });
    expect(await store.all(PRODUCTS)).toHaveLength(1);
  });

  it('updates only the patched fields, located by the key column', async () => {
    const store = createMemoryStore({
      [INVENTORY]: [{ sku: 'pcb001', product_name: 'Rose', current_qty: 10, supplier: 'Farm A' }],
    });
    const updated = await store.update(INVENTORY, 'pcb001', { current_qty: 7 });
    expect(updated.current_qty).toBe(7);
    expect(updated.supplier).toBe('Farm A');
  });

  it('matches the key as a string (sheet cells may read back as numbers)', async () => {
    const store = createMemoryStore({ [INVENTORY]: [{ sku: 1001, current_qty: 1 }] });
    expect(await store.update(INVENTORY, '1001', { current_qty: 2 })).not.toBeNull();
  });

  it('returns null when updating a missing row', async () => {
    const store = createMemoryStore();
    expect(await store.update(PRODUCTS, 'nope', { name: 'x' })).toBeNull();
  });

  it('rejects unknown tables and columns', async () => {
    const store = createMemoryStore();
    await expect(store.all('Nope')).rejects.toThrow(/Unknown table/);
    await expect(store.insert(PRODUCTS, { id: 'p1', colour: 'red' })).rejects.toThrow(/Unknown column/);
    await expect(store.update(PRODUCTS, 'p1', { colour: 'red' })).rejects.toThrow(/Unknown column/);
  });
});
