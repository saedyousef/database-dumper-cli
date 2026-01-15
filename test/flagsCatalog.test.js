import assert from 'node:assert';
import { test } from 'node:test';
import { getFlagCatalog, resolveFlags } from '../dist/flagsCatalog.js';

test('flag catalog exposes configured options', () => {
  const catalog = getFlagCatalog();
  assert.ok(Array.isArray(catalog));
  const ids = catalog.map((entry) => entry.id);
  assert.ok(ids.includes('single-transaction'));
  assert.ok(ids.includes('quick'));
});

test('resolveFlags merges selected and custom flags preserving order', () => {
  const resolved = resolveFlags(['single-transaction', 'quick'], ['--custom-flag']);
  assert.deepStrictEqual(resolved, ['--single-transaction', '--quick', '--custom-flag']);
});

test('resolveFlags handles missing custom flags gracefully', () => {
  const resolved = resolveFlags(['single-transaction']);
  assert.deepStrictEqual(resolved, ['--single-transaction']);
});
