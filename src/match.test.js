import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Match, ROUND_SECONDS, standings } from './match.js';
import { MAPS } from './maps/index.js';

function started(mode = 'free') {
  const match = new Match(mode, 42); match.addPlayer('host', '房主'); match.start(); return match;
}
test('timed matches finish exactly at the deadline and scores freeze', () => {
  const match = started('timed');
  match.advance(119.95); assert.equal(match.phase, 'playing');
  match.advance(.2); assert.equal(match.elapsed, ROUND_SECONDS); assert.equal(match.phase, 'finished');
  const result = match.snapshot(); match.advance(10); assert.deepEqual(match.snapshot(), result);
});
test('free play and cooperation continue beyond two minutes', () => {
  for (const mode of ['free', 'coop']) { const match = started(mode); match.advance(180); assert.equal(match.phase, 'playing'); }
});
test('a contested object is captured and scored once for exactly one player', () => {
  const match = new Match('race', 42);
  match.addPlayer('host', '房主'); match.addPlayer('guest', '朋友'); match.setReady('guest', true);
  const item = match.items.find(item => item.radius === .4);
  for (const player of match.players) { player.x = item.x; player.z = item.z; }
  match.start(); match.advance(.05);
  const claims = match.claims.filter(claim => claim.id === match.items.indexOf(item)); assert.equal(claims.length, 1);
  match.advance(.7);
  const totalEaten = match.players.reduce((n, p) => n + p.eaten, 0);
  assert.equal(totalEaten, match.eaten);
  assert.equal(match.players.reduce((n, p) => n + p.mass, 0), match.claims.filter(c => c.done).reduce((n, c) => n + match.items[c.id].mass, 0));
});
test('room capacity, readiness and nickname output use the same match contract', () => {
  const match = new Match('coop', 42);
  for (let i = 0; i < 4; i++) assert.equal(match.addPlayer(String(i), '<测试>名字很长很长很长很长很长'), true);
  assert.equal(match.addPlayer('extra', '第五人'), false); assert.equal(match.start(), false);
  for (let i = 1; i < 4; i++) match.setReady(String(i), true);
  assert.equal(match.start(), true); assert.equal(match.addPlayer('late', '迟到'), false);
  assert.ok(match.players.every(p => p.name.length <= 12));
});
test('network input cannot teleport players, inject nonfinite coordinates or move another identity', () => {
  const match = started(); const player = match.players[0], initialX = player.x;
  match.setInput('stranger', { x: 10000, z: 0 }); match.advance(.05); assert.equal(player.x, initialX);
  match.setInput('host', { x: Infinity, z: NaN }); match.advance(.05); assert.equal(player.x, initialX);
  match.setInput('host', { x: 10000, z: 0 }); match.advance(.05); assert.ok(player.x - initialX < .4);
  const before = player.x; match.advance(1); assert.equal(player.x, before);
});
test('disconnect preserves awarded food, stops movement and standings rank by mass', () => {
  const match = started(); match.players[0].mass = 10;
  match.setInput('host', { x: 1, z: 0 }); match.removePlayer('host'); const x = match.players[0].x; match.advance(.1);
  assert.equal(match.players[0].x, x); assert.equal(match.players[0].mass, 10); assert.equal(match.players[0].online, false);
  assert.equal(standings([{ id: 'a', mass: 4, eaten: 2 }, { id: 'b', mass: 9, eaten: 1 }])[0].id, 'b');
});
test('snapshots cannot mutate authoritative scores or claim state', () => {
  const match = started(); const snapshot = match.snapshot(); snapshot.players[0].mass = 99999;
  assert.equal(match.players[0].mass, 0);
});

test('large-map late-round snapshots compact completed food and retain active animations', () => {
  for (const mapId of Object.keys(MAPS)) {
    const match = new Match('coop', 42, mapId); match.addPlayer('host', '房主'); match.start();
    match.claims = match.items.map(item => ({ id: item.id, done: true }));
    const item = match.items.at(-1);
    match.claims[match.claims.length - 1] = { id: item.id, done: false, owner: 'host', pose: { x: item.x + .1, y: -.4, z: item.z, q: [0, 0, Math.sin(.2), Math.cos(.2)] } };
    const snapshot = match.snapshot();
    assert.equal(snapshot.claims.length, match.items.length);
    assert.deepEqual(snapshot.claims[0], { id: 0, done: true });
    assert.deepEqual(snapshot.claims.at(-1), match.claims.at(-1));
    assert.ok(Buffer.byteLength(JSON.stringify(snapshot)) < 24000, `${mapId} late-round network payload stays bounded`);
    snapshot.claims[0].id = -1; snapshot.claims.at(-1).pose.q[0] = 999;
    assert.equal(match.claims[0].id, 0); assert.equal(match.claims.at(-1).pose.q[0], 0);
    assert.equal(match.claims.at(-1).owner, 'host');
  }
});

test('cooperation shares growth and keeps the team size when a contributor leaves', () => {
  const match = new Match('coop', 42); match.addPlayer('host', '房主'); match.addPlayer('guest', '朋友'); match.setReady('guest', true); match.start();
  const item = match.items.find(item => item.radius === .4);
  Object.assign(match.players[1], { x: item.x, z: item.z });
  match.advance(.05); match.advance(.7);
  const radius = match.players[1].radius;
  assert.ok(radius > 1.2); assert.equal(match.players[0].radius, radius);
  match.removePlayer('guest'); match.advance(.05); assert.equal(match.players[0].radius, radius);
});

test('advancing to command arrival before applying input preserves fresh movement after a stalled tick', () => {
  const match = started('race'); match.advance(1);
  match.setInput('host', { x: 1, z: 0 }); const x = match.players[0].x; match.advance(.05);
  assert.ok(match.players[0].x > x);
});

test('only the host can pause the whole match, freezing clock and pending food', () => {
  const match = new Match('race', 42); match.addPlayer('host', '房主'); match.addPlayer('guest', '朋友'); match.setReady('guest', true); match.start();
  const item = match.items.find(item => item.radius === .4); Object.assign(match.players[0], { x: item.x, z: item.z }); match.advance(.05);
  assert.equal(match.setPaused('guest', true), false); assert.equal(match.setPaused('host', true), true);
  const snapshot = match.snapshot(); match.advance(10); assert.deepEqual(match.snapshot(), snapshot);
  assert.equal(match.setPaused('guest', false), false); assert.equal(match.setPaused('host', false), true); match.advance(2);
  assert.ok(match.eaten > 0); assert.equal(match.elapsed, 2.05);
});

test('fixed-step movement keeps fractional time across render and network command frequencies', () => {
  for (const frequency of [20, 60, 100, 120, 144, 240]) {
    const match = started(), player = match.players[0], x = player.x;
    // Isolate time integration from food-driven growth along the travel path.
    match.physics.step = () => [];
    for (let i = 0; i < frequency; i++) {
      match.setInput('host', { x: 1, z: 0 }); match.advance(1 / frequency);
    }
    assert.ok(Math.abs(player.x - x - 6.98) < 1e-8, `${frequency} Hz movement lost fractional time`);
  }
});
