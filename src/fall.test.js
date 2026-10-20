import { test } from 'node:test';
import assert from 'node:assert/strict';
import { interpolatePose, interpolateHole, restingPose } from './fall.js';

const item = { x: 1, z: 2, rotation: Math.PI / 2 };
test('rendering interpolates authoritative rigid poses without owner tracking or scaling', () => {
  const a = { pose: restingPose(item) }, b = { pose: { x: 2, y: -1, z: 3, q: [0, 0, 1, 0] } };
  const pose = interpolatePose(item, a, b, .5);
  assert.deepEqual([pose.x, pose.y, pose.z], [1.5, -.5, 2.5]);
  assert.ok(Math.abs(Math.hypot(...pose.q) - 1) < 1e-12);
  assert.equal(pose.scale, undefined);
});
test('a missing prior pose starts at the authored placement, not the hole center', () => {
  assert.deepEqual(interpolatePose(item, undefined, { pose: { x: 8, y: -1, z: 7, q: [0,0,0,1] } }, 0), restingPose(item));
});
test('equivalent opposite quaternion signs do not produce a rotation flip', () => {
  const a = { pose: { x: 0, y: 0, z: 0, q: [0, 0, 0, 1] } }, b = { pose: { ...a.pose, q: [0, 0, 0, -1] } };
  assert.deepEqual(interpolatePose(item, a, b, .5).q, [0,0,0,1]);
});
test('body and aperture interpolation clamp at the authoritative endpoint', () => {
  const a = { x: 0, z: 0, radius: 1 }, b = { x: 2, z: 4, radius: 2 };
  assert.deepEqual(interpolateHole(a, b, .5), { x: 1, z: 2, radius: 1.5 });
  assert.deepEqual(interpolateHole(a, b, 20), b);
});
