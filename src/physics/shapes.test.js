import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Body, Box, Quaternion, Vec3 } from 'cannon-es';
import { ITEM_CATALOG } from '../items/catalog.js';
import { createItemBody, getConvexHull, highestPoint } from './shapes.js';

const EPSILON = 1e-8;
const close = (actual, expected, message = '') => assert.ok(Math.abs(actual - expected) < EPSILON, `${message}: ${actual} != ${expected}`);
const placed = (type, rotation = 0) => ({ ...ITEM_CATALOG[type], type, id: 4, x: 9, z: -7, rotation });

function worldVertices(record) {
  return record.localVertices.map(vertex => record.body.pointToWorldFrame(vertex));
}

function footprintAtGround(record) {
  return worldVertices(record).filter(vertex => vertex.y < .02);
}

test('every catalog item has finite full-size compound convex physics geometry', () => {
  for (const type of Object.keys(ITEM_CATALOG)) {
    const item = placed(type), record = createItemBody(item);
    assert.equal(record.body.mass, item.mass, type);
    assert.equal(record.body.type, Body.DYNAMIC, type);
    assert.ok(record.parts.length > 0 && record.parts.length <= 7, type);
    assert.equal(record.body.shapes.length, record.parts.length, type);
    assert.ok(record.centerHeight > 0 && record.centerHeight < item.height, type);
    assert.ok(record.clearanceRadius > 0 && record.clearanceRadius <= item.radius + EPSILON, type);
    assert.ok(highestPoint(record) <= item.height + EPSILON, type);
    assert.ok(Math.min(...worldVertices(record).map(v => v.y)) >= -EPSILON, `${type} starts above ground`);
    for (const coordinate of [...record.body.inertia.toArray(), ...record.body.invInertia.toArray()]) assert.ok(Number.isFinite(coordinate) && coordinate > 0, type);
    for (const vertex of record.localVertices) for (const coordinate of vertex.toArray()) assert.ok(Number.isFinite(coordinate), type);
  }
});

test('shape-local edge topology is complete, deduplicated, and nondegenerate', () => {
  for (const type of Object.keys(ITEM_CATALOG)) {
    for (const part of createItemBody(placed(type)).parts) {
      assert.equal(getConvexHull(part.shape), getConvexHull(part.shape), 'topology is cached');
      const keys = new Set(part.edges.map(([a, b]) => [Math.min(a,b), Math.max(a,b)].join(':')));
      assert.equal(keys.size, part.edges.length, type);
      for (const [a,b] of part.edges) {
        assert.ok(part.vertices[a] && part.vertices[b], type);
        assert.ok(part.vertices[a].distanceSquared(part.vertices[b]) > EPSILON, type);
      }
      for (const face of part.convex.faces) for (let i = 0; i < face.length; i++) {
        const a = face[i], b = face[(i + 1) % face.length];
        assert.ok(keys.has([Math.min(a,b), Math.max(a,b)].join(':')), type);
      }
      for (let i = 0; i < part.convex.faces.length; i++) {
        const point = part.vertices[part.convex.faces[i][0]], normal = part.convex.faceNormals[i];
        assert.ok(normal.dot(point) > 0, `${type} outward face normal`);
      }
    }
  }
});

test('body-local cached vertices agree with Cannon compound shape transforms', () => {
  for (const type of Object.keys(ITEM_CATALOG)) {
    const record = createItemBody(placed(type, .61));
    record.body.quaternion.setFromEuler(.37, .61, -.42);
    let index = 0;
    for (const part of record.parts) for (const vertex of part.vertices) {
      const local = part.orientation.vmult(vertex); local.vadd(part.offset, local);
      const expected = record.body.pointToWorldFrame(local);
      const actual = record.body.pointToWorldFrame(record.localVertices[index++]);
      close(actual.distanceTo(expected), 0, type);
    }
    record.body.updateAABB();
    const vertices = worldVertices(record);
    // Boxes compute a conservative world AABB from their eight exact corners;
    // all other proxies expose their complete hull vertices.
    for (const vertex of vertices) for (const axis of ['x', 'y', 'z']) {
      assert.ok(vertex[axis] >= record.body.aabb.lowerBound[axis] - EPSILON, type);
      assert.ok(vertex[axis] <= record.body.aabb.upperBound[axis] + EPSILON, type);
    }
  }
});

test('model-origin reconstruction preserves initial placement and any later rigid rotation', () => {
  for (const type of ['house', 'tree', 'log', 'lamp', 'car']) {
    const item = placed(type, .78), record = createItemBody(item);
    const initialOffset = record.body.quaternion.vmult(record.modelOffset);
    const origin = record.body.position.vsub(initialOffset);
    close(origin.x, item.x, type); close(origin.y, 0, type); close(origin.z, item.z, type);
    record.body.quaternion.setFromEuler(.42, -.3, .61);
    const offset = record.body.quaternion.vmult(record.modelOffset);
    const expectedOrigin = new Vec3(-4, -.7, 2);
    expectedOrigin.vadd(offset, record.body.position);
    const reconstructed = record.body.position.vsub(record.body.quaternion.vmult(record.modelOffset));
    close(reconstructed.distanceTo(expectedOrigin), 0, type);
  }
});

test('highestPoint respects tipping instead of scoring from center height or original height', () => {
  for (const type of ['tree', 'tower', 'log', 'neonSign', 'car']) {
    const record = createItemBody(placed(type));
    for (const angle of [0, .2, 1, Math.PI / 2, Math.PI]) {
      record.body.quaternion.setFromEuler(angle, .7, -.34);
      record.body.position.y = -1.1;
      const expected = Math.max(...worldVertices(record).map(v => v.y));
      close(highestPoint(record), expected, `${type}/${angle}`);
    }
  }
  const tower = createItemBody(placed('tower'));
  tower.body.position.y = -1;
  assert.ok(highestPoint(tower) > 0, 'center underground does not mean the tower cleared');
  tower.body.position.y -= highestPoint(tower) + .26;
  close(highestPoint(tower), -.26, 'the entire hull is below a .25-thick slab');
});

test('upright trees and lamps have narrow real supports rather than canopy-width invisible bases', () => {
  for (const [type, maximumSupportRadius] of [['tree', .23], ['pine', .22], ['lamp', .10]]) {
    const record = createItemBody(placed(type));
    const supports = footprintAtGround(record);
    assert.ok(supports.length >= 4, type);
    for (const vertex of supports) assert.ok(Math.hypot(vertex.x - 9, vertex.z + 7) <= maximumSupportRadius, type);
    assert.ok(record.clearanceRadius > maximumSupportRadius * 4, type);
  }
});

test('benches and cars preserve separate support footprints and logs are horizontal', () => {
  const bench = createItemBody(placed('bench'));
  assert.equal(bench.parts.length, 4);
  const feet = footprintAtGround(bench);
  assert.ok(feet.every(vertex => Math.abs(vertex.x - 9) > .5), 'bench has no imaginary central leg');
  const car = createItemBody(placed('car'));
  assert.equal(car.parts.length, 6);
  const wheels = footprintAtGround(car);
  assert.ok(wheels.length >= 4);
  assert.ok(wheels.every(vertex => Math.abs(vertex.x - 9) > .5 && Math.abs(vertex.z + 7) > .5));
  const log = createItemBody(placed('log'));
  assert.ok(log.bounds.halfExtents.x > log.bounds.halfExtents.y * 2);
});

test('mass and yaw do not change collider geometry; inertia is heading independent', () => {
  const a = createItemBody(placed('car', 0));
  const b = createItemBody(placed('car', Math.PI / 4));
  assert.deepEqual(a.localVertices, b.localVertices);
  assert.deepEqual(a.body.inertia, b.body.inertia);
  const heavier = createItemBody({ ...placed('car'), mass: a.body.mass * 2 });
  for (const axis of ['x', 'y', 'z']) close(heavier.body.inertia[axis], a.body.inertia[axis] * 2, axis);
});

test('independent bodies do not share shape ownership or mutable transform state', () => {
  const a = createItemBody(placed('tree')), b = createItemBody(placed('tree'));
  assert.notEqual(a.body, b.body);
  for (let i = 0; i < a.parts.length; i++) {
    assert.notEqual(a.parts[i].shape, b.parts[i].shape);
    assert.equal(a.parts[i].shape.body, a.body);
    assert.equal(b.parts[i].shape.body, b.body);
  }
  assert.throws(() => createItemBody({ ...placed('tree'), mass: 0 }), /mass/);
  assert.throws(() => createItemBody({ ...placed('tree'), model: 'missing' }), /proxy/);
});
