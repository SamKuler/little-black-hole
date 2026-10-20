import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ITEM_CATALOG } from '../items/catalog.js';
import { createModel } from '../items/models.js';
import { HolePhysics } from './world.js';
import { GROUND_THICKNESS } from './ground.js';

function modelVertices(item) {
  const material = new THREE.MeshBasicMaterial(), root = createModel(item, () => material), vertices = [];
  root.updateMatrixWorld(true);
  root.traverse(mesh => {
    if (!mesh.isMesh) return;
    const position = mesh.geometry.getAttribute('position');
    for (let i = 0; i < position.count; i++) vertices.push(new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld));
  });
  material.dispose();
  return vertices;
}

function renderTop(vertices, pose) {
  const q = new THREE.Quaternion().fromArray(pose.q);
  return Math.max(...vertices.map(vertex => vertex.clone().applyQuaternion(q).y + pose.y));
}

test('every rendered model fits its conservative vertical envelope, including tipped and inverted poses', () => {
  const rotations = [[0, 0, 0], [.4, .7, -.3], [Math.PI / 2, .7, 0], [2.2, -1.2, .4], [Math.PI, 0, 0], [0, 0, Math.PI], [.8, 1.1, -2.5]];
  for (const [type, item] of Object.entries(ITEM_CATALOG)) {
    const vertices = modelVertices(item), minY = item.minY ?? 0;
    for (const vertex of vertices) {
      assert.ok(vertex.y >= minY - 1e-6, `${type}: rendered geometry extends below declared model origin bound`);
      assert.ok(vertex.y <= item.height + 1e-6, `${type}: rendered geometry extends above declared height`);
      assert.ok(Math.hypot(vertex.x, vertex.z) <= item.radius + 1e-6, `${type}: rendered geometry extends outside declared radius`);
    }
    for (const rotation of rotations) {
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation));
      const upY = 1 - 2 * (q.x * q.x + q.z * q.z), y = -.7;
      const upperBound = y + Math.max(minY * upY, item.height * upY) + item.radius * Math.sqrt(Math.max(0, 1 - upY * upY));
      assert.ok(renderTop(vertices, { y, q: q.toArray() }) <= upperBound + 1e-6, `${type}/${rotation}: rotated envelope cannot understate visible geometry`);
    }
  }
});

for (const type of ['stone', 'bush']) test(`an inverted ${type} cannot score while its authored below-origin geometry still crosses the slab`, () => {
  const item = { ...ITEM_CATALOG[type], type, id: 0, x: 0, z: 0, rotation: 0 };
  const vertices = modelVertices(item), sim = new HolePhysics([item]), record = sim.activate(0);
  record.body.quaternion.setFromEuler(Math.PI, 0, 0);
  record.body.position.y = -.304 - record.modelOffset.y;
  record.body.updateInertiaWorld(true); record.body.aabbNeedsUpdate = true;
  const hole = { id: 'host', x: 0, z: 0, radius: 1.2, online: true };
  const completed = sim.step([hole]);
  assert.ok(sim.verticalBounds(record).max < -GROUND_THICKNESS, 'the simplified collider has cleared');
  assert.ok(renderTop(vertices, record.pose) > -GROUND_THICKNESS, 'the real mesh still intersects the slab');
  assert.deepEqual(completed, [], 'clearance is based on all visual geometry, not the proxy alone');
  assert.equal(record.done, false);
  for (let i = 0; i < 120; i++) completed.push(...sim.step([hole]));
  assert.deepEqual(completed, [{ id: 0, owner: 'host' }]);
  assert.ok(renderTop(vertices, record.pose) < -GROUND_THICKNESS - .06, 'the visible model clears the full safety margin before scoring');
});
