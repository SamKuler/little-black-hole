import { test } from 'node:test';
import assert from 'node:assert/strict';
import { START_RADIUS, radiusForMass, canSwallow, levelForRadius, clampPosition } from './rules.js';
import { createMap, MAPS } from './maps/index.js';

test('growth starts small and reaches the largest buildings through available food', () => {
  assert.equal(radiusForMass(0), START_RADIUS);
  let mass = 0;
  const tiers = [{ radius: .45, mass: 2, count: 100 }, { radius: 1.15, mass: 9, count: 45 }, { radius: 1.65, mass: 16, count: 20 }, { radius: 2.5, mass: 38, count: 16 }, { radius: 3.6, mass: 70, count: 8 }];
  for (const tier of tiers) {
    assert.ok(canSwallow({ x: 0, z: 0, radius: radiusForMass(mass) }, { ...tier, x: 0, z: 0 }), `tier ${tier.radius} reachable`);
    mass += tier.mass * tier.count;
  }
  assert.equal(levelForRadius(radiusForMass(mass)), 4);
});
test('size and containment both control swallowing', () => {
  const hole = { x: 0, z: 0, radius: 2 };
  assert.equal(canSwallow(hole, { x: 0, z: 0, radius: 2 }), false);
  assert.equal(canSwallow(hole, { x: 4, z: 0, radius: .3 }), false);
  assert.equal(canSwallow(hole, { x: .4, z: 0, radius: 1.4 }), true);
});
test('hole stays inside town at every size', () => {
  assert.equal(clampPosition(100, 6, 40), 34);
  assert.equal(clampPosition(-100, 6, 40), -34);
  assert.equal(clampPosition(3, 6, 40), 3);
});

test('every map has a complete growth path', () => {
  for (const mapId of Object.keys(MAPS)) for (const seed of [1, 24681, 98765]) {
    const map = createMap(mapId, seed);
    const remaining = map.items.sort((a, b) => a.radius - b.radius || Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z));
    let mass = 0;
    while (remaining.length) {
      const radius = radiusForMass(mass);
      const index = remaining.findIndex(item => canSwallow({ x: clampPosition(item.x, radius, map.bounds), z: clampPosition(item.z, radius, map.bounds), radius }, item));
      assert.notEqual(index, -1, `${mapId}, seed ${seed}: ${remaining.length} unreachable items at radius ${radius}`);
      mass += remaining.splice(index, 1)[0].mass;
    }
  }
});

test('any item on any map can be left until last and reached by the largest hole', () => {
  for (const mapId of Object.keys(MAPS)) {
  const map = createMap(mapId, 24681);
  const totalMass = map.items.reduce((mass, item) => mass + item.mass, 0);
  for (const item of map.items) {
    const radius = radiusForMass(totalMass - item.mass);
    const hole = { x: clampPosition(item.x, radius, map.bounds), z: clampPosition(item.z, radius, map.bounds), radius };
    assert.ok(canSwallow(hole, item), `${mapId}: ${item.type} at (${item.x}, ${item.z}) remains reachable last`);
  }
  }
});
