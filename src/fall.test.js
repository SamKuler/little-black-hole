import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fallDuration, fallPose } from './fall.js';
import { ITEM_CATALOG } from './items/catalog.js';

test('tall objects take longer to clear the mouth than stones', () => {
  assert.ok(fallDuration(ITEM_CATALOG.tower) > fallDuration(ITEM_CATALOG.stone));
});
test('fall animation advances at render intervals between network snapshots', () => {
  const item = { ...ITEM_CATALOG.house, x: 1, z: 0 }, claim = { x: 0, z: 0, at: 0 }, owner = { x: 0, z: 0 };
  const a = fallPose(item, claim, .24, owner), b = fallPose(item, claim, .248, owner);
  assert.ok(b.y < a.y); assert.ok(b.x < a.x);
  assert.ok(fallPose(item, claim, fallDuration(item), owner).y < -item.height);
});
test('gravity accelerates descent and leaning faces the center', () => {
  const item = { ...ITEM_CATALOG.tree, x: 1, z: 1 }, claim = { x: 0, z: 0, at: 0 }, owner = { x: 0, z: 0 };
  const pose = fallPose(item, claim, .3, owner);
  assert.ok(pose.rx < 0 && pose.rz > 0); assert.ok(pose.x < item.x && pose.z < item.z);
  assert.equal(Math.abs(fallPose(item, claim, .3, owner, true).rx), 0);
});
