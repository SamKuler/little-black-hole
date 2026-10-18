import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMap, MAPS } from './index.js';
import { ITEM_CATALOG } from '../items/catalog.js';
import { MODEL_BUILDERS } from '../items/models.js';
import { Match } from '../match.js';

const courtyard = {
  id: 'courtyard-test', name: '庭院', bounds: 12, spawns: [{ x: -4, z: 0 }, { x: 4, z: 0 }], sky: '#e4edf0', cameraOffset: [16, 25, 20],
  create: () => ({ surfaces: [{ color: '#a9c5b7', position: [0, -.1, 0], size: [26, .2, 26] }], placements: [{ type: 'stone', x: 0, z: 8 }] }),
};

test('the existing town preserves item count and deterministic placements', () => {
  const a = createMap('town', 42), b = createMap('town', 42);
  assert.equal(a.items.length, 212); assert.deepEqual(a.items, b.items);
  for (const item of a.items) { assert.ok(item.height > 0 && item.mass > 0 && item.radius > 0); assert.ok(MODEL_BUILDERS[item.model]); }
});
test('new maps and catalog items use the same loading contract', () => {
  const map = { ...courtyard, create: () => ({ surfaces: [], placements: [{ type: 'pebble', x: 1, z: 2 }] }) };
  const catalog = { ...ITEM_CATALOG, pebble: { ...ITEM_CATALOG.stone, name: '鹅卵石', radius: .3, mass: 1, color: '#c5c5c5' } };
  const loaded = createMap(map.id, 1, { [map.id]: map }, catalog);
  assert.equal(loaded.items[0].mass, 1); assert.equal(loaded.items[0].model, 'stone'); assert.equal(loaded.bounds, 12);
});
test('the match uses map birth points and bounds rather than town constants', () => {
  MAPS[courtyard.id] = courtyard;
  try {
    const match = new Match('free', 1, courtyard.id); match.addPlayer('host', '我'); match.start();
    assert.equal(match.players[0].x, -4); assert.equal(match.snapshot().mapId, courtyard.id);
    for (let i = 0; i < 100; i++) { match.setInput('host', { x: 1, z: 0 }); match.advance(.1); }
    assert.equal(match.players[0].x, 10.8);
  } finally { delete MAPS[courtyard.id]; }
});
