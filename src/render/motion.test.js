import { test } from 'node:test';
import assert from 'node:assert/strict';
import { predictPosition } from './motion.js';

test('movement continues smoothly between snapshots without crossing map edges', () => {
  const player = { x: 0, z: 0, radius: 1, vx: 6, vz: 0 };
  assert.ok(Math.abs(predictPosition(player, .05, 12).x - .3) < 1e-10);
  assert.ok(Math.abs(predictPosition(player, .1, 12).x - .6) < 1e-10);
  assert.equal(predictPosition({ ...player, x: 10.9 }, .1, 12).x, 11);
  assert.ok(Math.abs(predictPosition(player, 2, 12).x - .9) < 1e-10);
});
