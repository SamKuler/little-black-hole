import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createMap, MAPS } from './index.js';
import { ITEM_CATALOG } from '../items/catalog.js';
import { MODEL_BUILDERS } from '../items/models.js';
import { Match } from '../match.js';
import { START_RADIUS, fitsHole, radiusForMass, canSwallow, clampPosition } from '../rules.js';

const THEMES = ['town', 'forest', 'cyberpunk'];
const SEEDS = [0, 1, 42, 24681, 98765, 683129967, 0xffffffff, ...Array.from({ length: 12 }, (_, i) => Math.imul(i + 1, 2654435761) >>> 0)];
const fixtures = THEMES.flatMap(id => SEEDS.map(seed => ({ id, seed, map: createMap(id, seed) })));
const courtyard = {
  id: 'courtyard-test', name: '庭院', bounds: 12, spawns: [{ x: -4, z: 0 }, { x: 4, z: 0 }], sky: '#e4edf0', cameraOffset: [16, 25, 20],
  create: () => ({ surfaces: [{ color: '#a9c5b7', position: [0, -.1, 0], size: [26, .2, 26] }], placements: [{ type: 'stone', x: 0, z: 8 }] }),
};

function nearestHole(item, radius, bounds) {
  return { x: clampPosition(item.x, radius, bounds), z: clampPosition(item.z, radius, bounds), radius };
}

test('all three expanded maps reproduce their seeded counts, layouts, and item IDs', () => {
  assert.deepEqual(Object.keys(MAPS), THEMES);
  for (const { id, seed, map } of fixtures) {
    const again = createMap(id, seed);
    assert.deepEqual(map.items, again.items, `${id}/${seed} items`);
    assert.deepEqual(map.surfaces, again.surfaces, `${id}/${seed} surfaces`);
    assert.ok(map.bounds >= 52 && map.bounds <= 64);
    assert.equal(map.spawns.length, 4);
    map.items.forEach((item, index) => {
      assert.equal(item.id, index);
      assert.ok(item.height > 0 && item.mass > 0 && item.radius > 0);
      assert.ok(MODEL_BUILDERS[item.model]);
      assert.ok(Number.isFinite(item.rotation) && Number.isFinite(item.x) && Number.isFinite(item.z));
      assert.ok(Math.max(Math.abs(item.x), Math.abs(item.z)) + item.radius < map.bounds - 6.99);
    });
  }
});

test('each theme has a different identity and variable but dense object budgets', () => {
  const ranges = { town: [530, 650], forest: [640, 780], cyberpunk: [530, 650] };
  for (const id of THEMES) {
    const maps = fixtures.filter(fixture => fixture.id === id).map(fixture => fixture.map);
    const counts = new Set(maps.map(map => map.items.length));
    assert.ok(counts.size >= 5, `${id} varies its count with the seed`);
    for (const map of maps) {
      assert.ok(map.items.length >= ranges[id][0] && map.items.length <= ranges[id][1], `${id}: ${map.items.length}`);
      for (let x = -40; x <= 40; x += 16) for (let z = -40; z <= 40; z += 16) {
        const nearby = map.items.filter(item => Math.abs(item.x - x) < 8 && Math.abs(item.z - z) < 8);
        assert.ok(nearby.length >= 6, `${id}: sparse neighborhood at ${x},${z}`);
      }
    }
  }
  const town = createMap('town', 42), forest = createMap('forest', 42), city = createMap('cyberpunk', 42);
  assert.ok(town.items.some(item => item.type === 'car') && town.items.some(item => item.type === 'shop'));
  assert.ok(forest.items.some(item => item.type === 'mushroom') && forest.items.some(item => item.type === 'ancientTree'));
  assert.ok(city.items.some(item => item.type === 'neonSign') && city.items.some(item => item.type === 'cyberTower'));
  assert.ok(forest.items.length > town.items.length && forest.items.length > city.items.length);
  assert.notDeepEqual(town.surfaces, forest.surfaces);
  assert.notDeepEqual(forest.surfaces, city.surfaces);
});

test('every player gets a clear, equally stocked starting pocket and a local growth path', () => {
  for (const { id, seed, map } of fixtures) {
    const masses = [];
    for (const spawn of map.spawns) {
      assert.ok(Math.max(Math.abs(spawn.x), Math.abs(spawn.z)) < map.bounds - 12);
      const food = map.items.filter(item => Math.hypot(item.x - spawn.x, item.z - spawn.z) < 11.2);
      assert.equal(food.length, 30, `${id}/${seed} starter count`);
      assert.ok(food.every(item => fitsHole(START_RADIUS, item)), `${id} starter food must fit immediately`);
      assert.ok(food.every(item => Math.hypot(item.x - spawn.x, item.z - spawn.z) >= item.radius + 1.64));
      const mass = food.reduce((sum, item) => sum + item.mass, 0);
      masses.push(mass);
      assert.ok(fitsHole(radiusForMass(mass), { radius: id === 'forest' ? 1.8 : 1.65 }), `${id} pocket unlocks the vehicle/boulder tier`);
      // No player must steal another quadrant's starter food to reach the largest tier.
      const quadrant = map.items.filter(item => Math.sign(item.x) === Math.sign(spawn.x) && Math.sign(item.z) === Math.sign(spawn.z)).sort((a, b) => a.radius - b.radius);
      let availableMass = 0;
      for (const item of quadrant) {
        assert.ok(canSwallow(nearestHole(item, radiusForMass(availableMass), map.bounds), item), `${id}/${seed}: quadrant stuck at ${item.type}`);
        availableMass += item.mass;
      }
    }
    assert.equal(new Set(masses).size, 1, `${id}/${seed}: equal local growth mass`);
  }
});

test('all maps can be cleared and every corner item may be left until last', () => {
  for (const { id, seed, map } of fixtures) {
    let mass = 0;
    for (const item of [...map.items].sort((a, b) => a.radius - b.radius)) {
      assert.ok(canSwallow(nearestHole(item, radiusForMass(mass), map.bounds), item), `${id}/${seed}: stuck at ${item.type}`);
      mass += item.mass;
    }
    for (const item of map.items) {
      assert.ok(canSwallow(nearestHole(item, radiusForMass(mass - item.mass), map.bounds), item), `${id}/${seed}: unreachable last ${item.type} at ${item.x},${item.z}`);
    }
  }
});

test('objects do not overlap and terrain layers stay below the mouth rim', () => {
  for (const { id, seed, map } of fixtures) {
    for (let a = 0; a < map.items.length; a++) for (let b = a + 1; b < map.items.length; b++) {
      const first = map.items[a], second = map.items[b];
      assert.ok(Math.hypot(first.x - second.x, first.z - second.z) >= first.radius + second.radius + .17, `${id}/${seed}: overlapping ${a}/${b}`);
    }
    for (const surface of map.surfaces) {
      assert.ok(surface.position.every(Number.isFinite) && surface.size.every(value => Number.isFinite(value) && value > 0));
      assert.ok(surface.position[1] + surface.size[1] / 2 <= .075, `${id}: ground hides the hole`);
    }
  }
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

test('every registered map supplies a real scene thumbnail and a shared UI theme', () => {
  for (const definition of Object.values(MAPS)) {
    assert.ok(['light', 'dark'].includes(definition.theme));
    const bytes = readFileSync(new URL(`../../public${definition.preview}`, import.meta.url));
    assert.ok(bytes.length > 0, `${definition.id} preview asset is present`);
  }
});
