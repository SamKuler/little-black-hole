import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HolePhysics } from './world.js';
import { ITEM_CATALOG } from '../items/catalog.js';
import { GROUND_THICKNESS } from './ground.js';

const mouth = radius => ({ id: 'host', x: 0, z: 0, radius, online: true });
const create = (type, x, rotation = 0) => new HolePhysics([{ ...ITEM_CATALOG[type], type, id: 0, x, z: 0, rotation }]);

function contactInvariants(sim, label) {
  for (const contact of sim.world.contacts) assert.ok(contact.multiplier >= -1e-8, `${label}: contacts push, never pull`);
  for (const tangent of sim.world.frictionEquations) {
    assert.ok(Math.abs(tangent.t.length() - 1) < 1e-10, `${label}: unit friction tangent`);
    if (!tangent.lastTangent) continue;
    const limit = tangent.frictionCoefficient * Math.max(0, tangent.normalContact.multiplier);
    const magnitude = Math.hypot(tangent.multiplier, tangent.otherTangent.multiplier);
    assert.ok(magnitude <= limit + 1e-7, `${label}: friction ${magnitude} <= mu*N ${limit}`);
  }
}

test('naturally tipping terminal and half-submerged bush do not hang on unloaded wall friction', () => {
  // On the previous solver these remained for 30s: the terminal's unloaded
  // wall supplied 36.56N upward friction, and the bush hung without top support.
  for (const [type, x, rotation, radius, depth] of [
    ['terminal', .85, .4, .85 / .88 + .1, 0],
    ['bush', .2, 0, .4 / .88 + .1, .8],
  ]) {
    const sim = create(type, x, rotation), record = sim.activate(0), hole = mouth(radius);
    record.body.position.y -= depth; record.body.aabbNeedsUpdate = true;
    const completed = [];
    for (let i = 0; i < 1800; i++) {
      completed.push(...sim.step([hole]));
      contactInvariants(sim, type);
    }
    assert.deepEqual(completed, [{ id: 0, owner: 'host' }], type);
    assert.ok(sim.verticalBounds(record).max < -GROUND_THICKNESS, type);
  }
});

test('long rim settling preserves physical constraints across shapes, sizes, offsets and rotations', () => {
  // A rest is not automatically an error: a tilted hull may bridge a smaller
  // aperture. Audit force bounds and finite state, not automatic swallowing.
  for (const type of ['neonCrate', 'terminal', 'car', 'tree', 'pine', 'tower']) {
    for (const ratio of [1.15, 1.5]) for (const rotation of [0, .4, Math.PI / 4]) for (const offset of [.3, .7, .95]) {
      const radius = ITEM_CATALOG[type].radius * ratio, sim = create(type, radius * offset, rotation);
      const label = `${type}/${ratio}/${rotation}/${offset}`, hole = mouth(radius);
      for (let frame = 0; frame < 1800; frame++) {
        sim.step([hole]);
        contactInvariants(sim, label);
        const record = sim.records.get(0);
        if (record) {
          assert.ok([record.pose.x, record.pose.y, record.pose.z, ...record.pose.q, ...record.body.velocity.toArray()].every(Number.isFinite), label);
          assert.ok(Math.abs(Math.hypot(...record.pose.q) - 1) < 1e-6, label);
          assert.ok(record.done || sim.verticalBounds(record).max >= -GROUND_THICKNESS || record.owner, `${label}: no orphan below ground`);
        }
      }
    }
  }
});
