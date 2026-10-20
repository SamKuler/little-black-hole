import { test } from 'node:test';
import assert from 'node:assert/strict';
import { snapshotFraction } from './interpolation.js';
import { interpolatePose, interpolateHole } from '../fall.js';
import { Match } from '../match.js';
import { HolePhysics } from '../physics/world.js';
import { ITEM_CATALOG } from '../items/catalog.js';

test('playing and finished snapshots share a clamped interpolation interval', () => {
  for (const phase of ['playing', 'finished']) {
    assert.equal(snapshotFraction(phase, -.01, .1), 0);
    assert.equal(snapshotFraction(phase, 0, .1), 0);
    assert.equal(snapshotFraction(phase, .05, .1), .5);
    assert.equal(snapshotFraction(phase, .1, .1), 1);
    assert.equal(snapshotFraction(phase, 10, .1), 1);
  }
});

test('paused and lobby snapshots stay frozen at their authoritative endpoint', () => {
  for (const phase of ['paused', 'lobby']) for (const age of [0, .05, 1]) {
    assert.equal(snapshotFraction(phase, age, .1), 1);
  }
});

test('the last swallowed prop finishes its visible descent without advancing a finished match', () => {
  const match = new Match('free', 42);
  const item = { ...ITEM_CATALOG.stone, id: 0, type: 'stone', x: 0, z: 0, rotation: 0 };
  match.items = [item]; match.physics = new HolePhysics(match.items);
  match.addPlayer('host', 'host'); Object.assign(match.players[0], { x: 0, z: 0 }); match.start();
  let previous;
  for (let i = 0; i < 20 && match.phase === 'playing'; i++) {
    previous = match.snapshot(); match.advance(.1);
  }
  const current = match.snapshot(), before = previous.claims[0], after = current.claims[0];
  assert.equal(current.phase, 'finished');
  assert.equal(after.done, true); assert.ok(after.pose, 'the final authoritative pose is retained');
  assert.ok(before.pose.y + item.height > 0, 'the preceding snapshot still shows the stone above ground');

  const start = snapshotFraction(current.phase, 0, .1), middle = snapshotFraction(current.phase, .05, .1);
  assert.equal(start, 0); assert.ok(middle > 0 && middle < 1, 'completion is not hidden on receipt');
  assert.deepEqual(interpolatePose(item, before, after, start), before.pose);
  const pose = interpolatePose(item, before, after, middle);
  assert.ok(pose.y < before.pose.y && pose.y > after.pose.y, 'the final fall is rendered, not skipped');
  const mouth = interpolateHole(previous.players[0], current.players[0], middle);
  assert.ok(mouth.radius > previous.players[0].radius && mouth.radius < current.players[0].radius, 'hole growth uses the same clock');
  assert.equal(snapshotFraction(current.phase, .1, .1), 1, 'completed props may hide at the endpoint');
  match.advance(10);
  assert.deepEqual(match.snapshot(), current, 'rendering the final interval cannot advance physics or scores');
});
