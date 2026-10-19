import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HolePhysics, PHYSICS_STEP } from './world.js';
import { GROUND_THICKNESS } from './ground.js';
import { ITEM_CATALOG } from '../items/catalog.js';

const hole = (x = 0, radius = 1.2, id = 'host') => ({ id, x, z: 0, radius, online: true });
function simulation(type, x = 0) {
  return new HolePhysics([{ ...ITEM_CATALOG[type], type, id: 0, x, z: 0, rotation: 0 }]);
}
function run(sim, holes, frames = 240) {
  const completed = [];
  for (let i = 0; i < frames; i++) completed.push(...sim.step(holes));
  return completed;
}

test('full support stays level and sleeping props away from holes never enter broadphase', () => {
  const sim = simulation('house');
  run(sim, [hole(20)]);
  assert.equal(sim.records.size, 0);
  const record = sim.activate(0); run(sim, [], 300);
  assert.ok(Math.abs(record.pose.y) < .002);
  assert.ok(Math.abs(record.pose.q[0]) + Math.abs(record.pose.q[2]) < .002);
  assert.equal(record.done, false);
  assert.equal(sim.world.contacts.length, 0, 'settled body sleeps');
});

test('a wholly unsupported object accelerates under gravity without horizontal attraction', () => {
  const sim = simulation('stone', .3); const holes = [hole()];
  run(sim, holes, Math.round(.066 / PHYSICS_STEP)); const a = sim.records.get(0).pose.y;
  run(sim, holes, Math.round(.066 / PHYSICS_STEP)); const b = sim.records.get(0).pose.y;
  run(sim, holes, Math.round(.066 / PHYSICS_STEP)); const record = sim.records.get(0), c = record.pose.y;
  assert.ok(c - b < b - a);
  assert.equal(record.pose.x, .3); assert.equal(record.pose.z, 0);
  assert.deepEqual(record.pose.q, [0,0,0,1]);
});

test('partial support creates torque before the footprint fits inside the opening', () => {
  const sim = simulation('neonCrate', 1.1);
  assert.ok(1.1 + ITEM_CATALOG.neonCrate.radius > 1.2);
  run(sim, [hole()], Math.round(.4 / PHYSICS_STEP));
  const record = sim.records.get(0);
  assert.ok(record.pose.q[2] > .12, 'support forces tip toward the opening');
  assert.equal(record.done, false, 'tilting is not an immediate score');
  const completed = run(sim, [hole()], 240);
  assert.deepEqual(completed, [{ id: 0, owner: 'host' }]);
  assert.ok(sim.verticalBounds(record).max < -GROUND_THICKNESS);
});

test('an oversized building bridges the hole without collapsing or scoring', () => {
  const sim = simulation('house');
  assert.deepEqual(run(sim, [hole()], 600), []);
  const record = sim.records.get(0);
  assert.ok(Math.abs(record.pose.y) < .003);
  assert.ok(Math.abs(record.pose.q[0]) + Math.abs(record.pose.q[2]) < .003);
  assert.equal(record.owner, null);
});

test('a moving mouth can restore support without attaching or teleporting a falling prop', () => {
  const sim = simulation('neonCrate'); let x = 0, maxStep = 0, previous;
  for (let i = 0; i < Math.round(2.5 / PHYSICS_STEP); i++) {
    if (i > Math.round(.0833 / PHYSICS_STEP) && i < Math.round(.3333 / PHYSICS_STEP)) x += 7 * PHYSICS_STEP;
    assert.deepEqual(sim.step([hole(x)]), []);
    const record = sim.records.get(0);
    if (previous) maxStep = Math.max(maxStep, Math.hypot(record.pose.x - previous.x, record.pose.y - previous.y, record.pose.z - previous.z));
    previous = { ...record.pose };
  }
  const record = sim.records.get(0);
  assert.ok(maxStep < .18);
  assert.ok(Math.abs(record.pose.x - x) > 1, 'body does not follow owner position');
  assert.ok(sim.verticalBounds(record).min > -.02, 'returned ground catches the body');
  assert.equal(record.owner, null);
});

test('overlapping mouths have one authoritative score and cleared bodies stay removed', () => {
  const sim = simulation('stone');
  const completed = run(sim, [hole(0, 1.2, 'a'), hole(0, 1.2, 'b')]);
  assert.equal(completed.length, 1);
  assert.ok(['a','b'].includes(completed[0].owner));
  assert.equal(sim.world.bodies.length, 1);
  assert.deepEqual(run(sim, [hole(15)]), []);
  assert.deepEqual(sim.snapshot(), [{ id: 0, done: true }]);
});

test('all catalog models clear a generously sized centered aperture at full scale', () => {
  for (const [type, definition] of Object.entries(ITEM_CATALOG)) {
    const sim = simulation(type), completed = run(sim, [hole(0, definition.radius / .88 + .1)], 240);
    assert.equal(completed.length, 1, type);
    const record = sim.records.get(0);
    assert.equal(record.pose.x, 0, type); assert.equal(record.pose.z, 0, type);
    assert.ok(record.pose.y + definition.height < -GROUND_THICKNESS, `${type} visual top clears`);
    assert.deepEqual(record.pose.q, [0,0,0,1], type);
  }
});

test('snapshots own their nested pose and quaternion arrays', () => {
  const sim = simulation('neonCrate'); sim.step([hole()]);
  const snapshot = sim.snapshot(); snapshot[0].pose.x = 100; snapshot[0].pose.q[0] = 20;
  assert.equal(sim.records.get(0).pose.x, 0); assert.equal(sim.records.get(0).pose.q[0], 0);
});

test('completion retains a final pose briefly, then compacts to an ID for fresh views', () => {
  const sim = simulation('stone'); let completed = [];
  while (!completed.length) completed = sim.step([hole()]);
  const final = sim.snapshot()[0];
  assert.equal(final.done, true); assert.ok(final.pose.y + ITEM_CATALOG.stone.height < -GROUND_THICKNESS);
  run(sim, [hole()], 32);
  assert.deepEqual(sim.snapshot(), [{ id: 0, done: true }]);
});
