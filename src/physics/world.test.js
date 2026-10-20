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

function inserted(type, depth, radius, rotation = 0) {
  const sim = simulation(type); sim.items[0].rotation = rotation;
  const record = sim.activate(0), mouth = hole(0, radius);
  record.body.position.y -= depth; record.body.aabbNeedsUpdate = true;
  sim.step([mouth]);
  return { sim, record, mouth };
}

test('an advancing rim pushes a half-inserted prop only after contact and creates torque', () => {
  const { sim, record, mouth } = inserted('neonCrate', .4, .65);
  for (let i = 1; i <= 2; i++) {
    mouth.x = i * 7 * PHYSICS_STEP; sim.step([mouth]);
    assert.equal(record.pose.x, 0, 'moving a nearby opening does not attract the body');
  }
  mouth.x += 7 * PHYSICS_STEP; sim.step([mouth]);
  assert.ok(record.body.velocity.x > 6, 'the moving rim transfers its normal velocity');
  assert.ok(record.pose.x > .08 && record.pose.x < .16, 'contact pushes, not a position snap');
  assert.ok(Math.abs(record.body.angularVelocity.z) > .01, 'off-center contact produces torque');
  assert.equal(record.done, false, 'contact is not an immediate score');
});

test('a receding wall does not pull a falling prop toward its moving hole', () => {
  const sim = simulation('neonCrate', .4), record = sim.activate(0);
  record.body.position.y -= .2; record.body.aabbNeedsUpdate = true;
  sim.step([hole(0, .75)]);
  const before = record.pose.x;
  sim.step([hole(.12, .75)]);
  assert.ok(record.pose.x <= before + .00001);
  assert.ok(record.body.velocity.x <= .001);
});

test('a half-submerged compound car is not pinned between wheel and chassis contacts', () => {
  for (const axis of ['x', 'z']) for (const direction of [-1, 1]) for (const speed of [4, 7, 30]) {
    const { sim, record, mouth } = inserted('car', .65, 1.8, .4);
    const completed = []; let previous = { ...record.pose }, maxStep = 0, maxTravel = 0;
    for (let i = 0; i < 600; i++) {
      mouth[axis] = direction * Math.min(3, (i + 1) * speed * PHYSICS_STEP);
      completed.push(...sim.step([mouth]));
      const pose = record.pose;
      assert.ok([pose.x, pose.y, pose.z, ...pose.q, ...record.body.velocity.toArray()].every(Number.isFinite));
      maxStep = Math.max(maxStep, Math.hypot(pose.x - previous.x, pose.y - previous.y, pose.z - previous.z));
      previous = { ...pose };
      maxTravel = Math.max(maxTravel, direction * pose[axis]);
    }
    assert.equal(completed.length, 1, `${axis}/${direction}/${speed}: cannot remain embedded`);
    assert.ok(sim.verticalBounds(record).max < -GROUND_THICKNESS);
    assert.ok(maxTravel > .15, 'contact initially pushes in the rim travel direction; tipping may reverse it later');
    assert.ok(maxStep < speed * PHYSICS_STEP + .2, 'fast wall motion stays continuous');
    assert.ok(Math.abs(sim.world.time - 601 * PHYSICS_STEP) < 1e-9, 'substeps preserve elapsed time');
  }
});

test('a naturally falling car clears when the hole moves away midway through descent', () => {
  const sim = simulation('car'), mouth = hole(0, 1.9);
  run(sim, [mouth], 12);
  const record = sim.records.get(0), initial = sim.verticalBounds(record);
  assert.ok(initial.min < -GROUND_THICKNESS && initial.max > 0);
  const completed = [];
  for (let i = 0; i < 600; i++) {
    mouth.x = Math.min(10.5, (i + 1) * 7 * PHYSICS_STEP);
    completed.push(...sim.step([mouth]));
  }
  assert.deepEqual(completed, [{ id: 0, owner: 'host' }]);
  assert.ok(sim.verticalBounds(record).max < -GROUND_THICKNESS);
});

test('removed or discontinuously relocated holes recover whole compounds without launching or scoring', () => {
  for (const [type, depth, radius] of [['car', .65, 1.8], ['tree', 1.2, 1.5]]) for (const moved of [false, true]) {
    const { sim, record } = inserted(type, depth, radius);
    let previous = { ...record.pose }, maxStep = 0, recoveryStep = 0;
    for (let i = 0; i < 600; i++) {
      assert.deepEqual(sim.step(moved ? [hole(10, radius)] : []), []);
      const displacement = Math.hypot(record.pose.x - previous.x, record.pose.y - previous.y, record.pose.z - previous.z);
      maxStep = Math.max(maxStep, displacement);
      if (i < 30) recoveryStep = Math.max(recoveryStep, displacement);
      previous = { ...record.pose };
      const normals = sim.world.contacts.map(contact => contact.ni.y);
      assert.ok(!(normals.includes(1) && normals.includes(-1)), 'parts cannot pin each other across the slab');
    }
    assert.ok(sim.verticalBounds(record).min > -.02, `${type}: restored terrain catches the whole body`);
    assert.ok(recoveryStep < .05, 'position resets do not generate teleport impulses');
    assert.ok(maxStep < .2, 'later toppling stays continuous without artificial static friction');
    assert.equal(record.owner, null);
  }
});

test('a laterally pushed tree does not remain hooked by an unloaded wall', () => {
  const { sim, record, mouth } = inserted('tree', 1.2, 1.5);
  const completed = []; let pushed = false;
  for (let i = 0; i < 1800; i++) {
    mouth.x = Math.min(3, (i + 1) * 7 * PHYSICS_STEP);
    completed.push(...sim.step([mouth]));
    pushed ||= record.pose.x > .5;
    if (!record.done) continue;
    assert.ok(sim.verticalBounds(record).max < -GROUND_THICKNESS, 'canopy must actually clear before scoring');
  }
  assert.ok(pushed, 'rim pushes a trunk, not only box-shaped props');
  assert.deepEqual(completed, [{ id: 0, owner: 'host' }]);
});

test('an overlapping stationary opening hides another moving rim without transferring its motion', () => {
  const { sim, record, mouth } = inserted('neonCrate', .4, .65);
  const cover = hole(0, 2, 'other');
  for (let i = 0; i < 5; i++) {
    mouth.x += 7 * PHYSICS_STEP;
    // Reorder the players too: wall velocity is tracked by identity, not index.
    sim.step(i % 2 ? [mouth, cover] : [cover, mouth]);
    assert.equal(record.pose.x, 0);
    assert.equal(record.pose.z, 0);
    assert.deepEqual(record.pose.q, [0, 0, 0, 1]);
    assert.equal(sim.world.contacts.length, 0);
  }
});

test('independent moving holes impart opposite contact velocities and clear pooled velocity when stopped', () => {
  const sim = new HolePhysics([-3, 3].map((x, id) => ({ ...ITEM_CATALOG.neonCrate, type: 'neonCrate', id, x, z: 0, rotation: 0 })));
  const records = [0, 1].map(id => sim.activate(id));
  for (const { body } of records) { body.position.y -= .4; body.aabbNeedsUpdate = true; }
  const left = hole(-3, .65, 'left'), right = hole(3, .65, 'right');
  sim.step([left, right]);
  for (let i = 0; i < 3; i++) {
    left.x -= 7 * PHYSICS_STEP; right.x += 7 * PHYSICS_STEP;
    sim.step(i % 2 ? [left, right] : [right, left]);
  }
  assert.ok(records[0].body.velocity.x < -6);
  assert.ok(records[1].body.velocity.x > 6);
  assert.ok(sim.world.contacts.some(contact => contact.wallSpeed > 6));
  sim.step([left, right]);
  assert.ok(sim.world.contacts.every(contact => contact.wallSpeed === 0), 'stopped walls and reused support equations cannot retain motion');
});

test('fully cleared geometry is not towed or resurfaced by a moving or removed hole', () => {
  for (const mouths of [[hole(.5, .65)], []]) {
    const { sim, record } = inserted('neonCrate', .4, .65);
    record.body.position.y -= 1; record.body.aabbNeedsUpdate = true;
    const x = record.body.position.x, y = record.body.position.y;
    assert.deepEqual(sim.step(mouths), [{ id: 0, owner: 'host' }]);
    assert.equal(record.body.position.x, x);
    assert.ok(record.body.position.y < y);
    assert.equal(sim.world.contacts.length, 0);
    assert.deepEqual(run(sim, mouths), []);
  }
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
