import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Body } from 'cannon-es';
import { HolePhysics } from './world.js';
import { ITEM_CATALOG } from '../items/catalog.js';

function settledCrate() {
  const sim = new HolePhysics([{ ...ITEM_CATALOG.neonCrate, type: 'neonCrate', id: 0, x: 0, z: 0, rotation: 0 }]);
  const record = sim.activate(0), hole = { id: 'host', x: 1.5, z: 0, radius: 1.2, online: true };
  for (let i = 0; i < 120; i++) sim.step([hole]);
  assert.equal(record.body.sleepState, Body.SLEEPING);
  return { sim, record, hole };
}

for (const action of ['grow', 'move']) test(`a sleeping supported prop wakes when a hole can reach it by ${action}`, () => {
  const { sim, record, hole } = settledCrate();
  const completed = [];
  if (action === 'move') {
    hole.x = 3; hole.radius = 1.2;
    for (let i = 0; i < 120; i++) sim.step([hole]);
    assert.equal(record.body.sleepState, Body.SLEEPING);
    for (let i = 0; i < 30; i++) { hole.x = Math.max(0, hole.x - .1); completed.push(...sim.step([hole])); }
  } else hole.radius = 2.2;
  for (let i = 0; i < 240; i++) completed.push(...sim.step([hole]));
  assert.equal(record.done, true);
  assert.deepEqual(completed, [{ id: 0, owner: 'host' }]);
  assert.equal(sim.world.bodies.length, 1, 'completed bodies leave the solver');
});

test('removing an opening wakes a sleeping bridge without losing its support or scoring', () => {
  const { sim, record } = settledCrate();
  assert.deepEqual(sim.step([]), []);
  assert.notEqual(record.body.sleepState, Body.SLEEPING, 'restored terrain wakes the affected body');
  for (let i = 0; i < 120; i++) assert.deepEqual(sim.step([]), []);
  assert.ok(Math.abs(record.pose.y) < .002);
  assert.equal(record.owner, null); assert.equal(record.done, false);
  assert.equal(record.body.sleepState, Body.SLEEPING, 'stable support can sleep again');
});
