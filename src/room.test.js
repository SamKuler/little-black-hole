import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Room, newRoomCode, validRoomCode } from './room.js';
import { MAPS, DEFAULT_MAP, createMap } from './maps/index.js';
import { ROUND_SECONDS } from './match.js';
import { START_RADIUS } from './rules.js';

// Exercise the real Room create/join/data handlers with paired, asynchronous
// connections. Tests never load PeerJS or contact a signaling server.
class TestConnection extends EventEmitter {
  constructor(peer, metadata) {
    super(); this.peer = peer; this.metadata = metadata; this.open = true; this.messages = [];
  }
  send(message) {
    const copy = structuredClone(message); this.messages.push(copy);
    queueMicrotask(() => { if (this.other.open) this.other.emit('data', copy); });
  }
  close() {
    if (!this.open) return;
    this.open = false; this.emit('close'); this.other.close();
  }
}

class TestPeer extends EventEmitter {
  constructor(network, id) { super(); this.network = network; this.id = id; this.connections = []; }
  connect(id, { metadata }) {
    const target = this.network.get(id);
    assert.ok(target, `Host peer ${id} must exist`);
    const local = new TestConnection(id, metadata), remote = new TestConnection(this.id, metadata);
    local.other = remote; remote.other = local;
    this.connections.push(local); target.connections.push(remote);
    queueMicrotask(() => { target.emit('connection', remote); remote.emit('open'); local.emit('open'); });
    return local;
  }
  destroy() { this.network.delete(this.id); for (const connection of this.connections) connection.close(); }
}

const flush = () => new Promise(resolve => setImmediate(resolve));
const alternateMap = () => {
  const id = Object.keys(MAPS).find(id => id !== DEFAULT_MAP);
  assert.ok(id, 'The map selector needs multiple registered maps');
  return id;
};

async function createRoom(t, { mapId = DEFAULT_MAP, mode = 'race', guests = 1 } = {}) {
  const network = new Map(), rooms = [];
  function makeRoom() {
    const snapshots = [], errors = [], statuses = [];
    const room = new Room({ onSnapshot: snapshot => snapshots.push(snapshot), onError: error => errors.push(error), onStatus: status => statuses.push(status) });
    room.openPeer = async id => {
      room.selfId = id || `guest-${network.size}`;
      room.peer = new TestPeer(network, room.selfId); network.set(room.selfId, room.peer);
    };
    Object.assign(room, { snapshots, errors, statuses }); rooms.push(room); return room;
  }
  t.after(() => { for (const room of rooms.toReversed()) room.close(); });
  const host = makeRoom(); await host.create('房主', mode, mapId);
  async function joinGuest(name) {
    const guest = makeRoom(); await guest.join(host.code, name); return guest;
  }
  const clients = [];
  for (let i = 0; i < guests; i++) {
    clients.push(await joinGuest(`朋友 ${i + 1}`));
  }
  await flush();
  return { host, guest: clients[0], clients, joinGuest };
}

test('room codes remain shareable and map-compatible peers use the v4 physics namespace', async t => {
  for (let i = 0; i < 20; i++) assert.equal(validRoomCode(newRoomCode()), true);
  for (const code of ['', '123', 'abcdefgh', 'ABCDEFG0', 'ABCDEFG1', 'ABCDEFG!']) assert.equal(validRoomCode(code), false);
  const { host, guest } = await createRoom(t);
  assert.equal(host.selfId, `little-black-hole-v4-${host.code}`);
  assert.equal(guest.hostConnection.peer, host.selfId);
});

test('creating a room publishes the chosen map and deterministic seed to joining guests', async t => {
  for (const mapId of Object.keys(MAPS)) {
    const { host, guest } = await createRoom(t, { mapId });
    const snapshot = guest.snapshots.at(-1);
    assert.equal(snapshot.mapId, mapId);
    assert.deepEqual(snapshot, host.snapshots.at(-1));
    assert.deepEqual(createMap(snapshot.mapId, snapshot.seed).items, host.game.items);
    assert.deepEqual(snapshot.players.map(({ x, z }) => ({ x, z })), host.game.map.spawns.slice(0, 2));
    assert.deepEqual(snapshot.players.map(player => player.ready), [true, false]);
  }
});

test('host map changes preserve roster identity and synchronize a fresh unready lobby', async t => {
  const { host, clients } = await createRoom(t, { guests: 3 });
  clients[0].close(); await flush();
  clients[1].ready(true); clients[2].ready(true); await flush();
  // Preserve even an offline roster entry instead of re-adding it as online.
  host.game.players[1].online = false;
  const roster = host.game.players.map(({ id, name, color, online }) => ({ id, name, color, online }));
  const oldRound = host.game.round, oldSeed = host.game.seed, before = clients[2].snapshots.length;
  const mapId = alternateMap();
  assert.equal(host.selectMap(mapId), true); await flush();
  assert.equal(host.game.mapId, mapId); assert.equal(host.game.phase, 'lobby');
  assert.notEqual(host.game.round, oldRound); assert.notEqual(host.game.seed, oldSeed);
  assert.equal(host.game.mode, 'race');
  assert.deepEqual(host.game.players.map(({ id, name, color, online }) => ({ id, name, color, online })), roster);
  assert.deepEqual(host.game.players.map(player => player.ready), [true, false, false]);
  assert.deepEqual(host.game.players.map(({ x, z }) => ({ x, z })), host.game.map.spawns.slice(0, 3));
  assert.ok(host.game.players.every(player => player.mass === 0 && player.eaten === 0 && player.radius === START_RADIUS));
  assert.equal(clients[2].snapshots.length, before + 1);
  for (const guest of clients.slice(1)) assert.deepEqual(guest.snapshots.at(-1), host.snapshots.at(-1));
  assert.deepEqual(createMap(mapId, clients[2].snapshots.at(-1).seed).items, host.game.items);
});

test('selecting the same or an unknown map is a complete no-op', async t => {
  const { host, guest } = await createRoom(t);
  guest.ready(true); await flush();
  const match = host.game, snapshot = match.snapshot(), count = guest.snapshots.length;
  for (const mapId of [DEFAULT_MAP, 'missing-map', '__proto__', 'constructor', null, undefined, {}, ['town']]) {
    assert.equal(host.selectMap(mapId), false);
    assert.equal(host.game, match); assert.deepEqual(host.game.snapshot(), snapshot);
  }
  await flush(); assert.equal(guest.snapshots.length, count);
});

test('a guest joining after a map change gets the current map, seed and cooperation mode', async t => {
  const { host, joinGuest } = await createRoom(t, { guests: 0, mode: 'coop' });
  assert.equal(host.selectMap(alternateMap()), true);
  const guest = await joinGuest('新朋友');
  assert.deepEqual(guest.snapshots.at(-1), host.snapshots.at(-1));
  assert.equal(guest.snapshots.at(-1).mode, 'coop');
  assert.equal(guest.snapshots.at(-1).mapId, alternateMap());
  assert.equal(guest.snapshots.at(-1).players[1].ready, false);
  guest.ready(true); await flush(); assert.equal(host.game.start(), true);
});

test('map changes require an open host lobby and never accept guest authority messages', async t => {
  const { host, guest } = await createRoom(t), mapId = alternateMap();
  const initial = host.game.snapshot();
  assert.equal(guest.selectMap(mapId), false); assert.equal(guest.rematch(), false);
  for (const type of ['selectMap', 'map', 'rematch', 'start', 'snapshot']) guest.hostConnection.send({ type, mapId, snapshot: { mapId } });
  await flush(); assert.deepEqual(host.game.snapshot(), initial);
  for (const phase of ['playing', 'paused', 'finished']) {
    host.game.phase = phase;
    const snapshot = host.game.snapshot();
    assert.equal(host.selectMap(mapId), false); assert.deepEqual(host.game.snapshot(), snapshot);
  }
  host.game.phase = 'lobby'; host.close();
  assert.equal(host.selectMap(mapId), false);
});

test('guests must ready the current map and cannot ready another player', async t => {
  const { host, guest, clients } = await createRoom(t, { guests: 2 });
  const oldRound = host.game.round;
  // This click was sent before the host switched, but arrives afterwards.
  guest.ready(true); assert.equal(host.selectMap(alternateMap()), true); await flush();
  assert.deepEqual(host.game.players.map(player => player.ready), [true, false, false]);
  for (const round of [oldRound, undefined]) guest.hostConnection.send({ type: 'ready', round, ready: true });
  await flush(); assert.equal(host.game.players[1].ready, false);
  assert.equal(host.game.start(), false);
  guest.hostConnection.send({ type: 'ready', round: host.game.round, ready: true, id: clients[1].selfId });
  await flush();
  assert.deepEqual(host.game.players.map(player => player.ready), [true, true, false]);
  clients[1].ready(true); await flush();
  assert.equal(host.game.start(), true); host.publish(); await flush();
  assert.equal(guest.snapshots.at(-1).phase, 'playing');
  assert.equal(guest.snapshots.at(-1).mapId, host.game.mapId);
});

test('only a finished host can rematch and the selected map persists with online players', async t => {
  const { host, clients } = await createRoom(t, { guests: 2, mode: 'race' });
  const guest = clients[1];
  host.selectMap(alternateMap()); await flush();
  const lobby = host.game; assert.equal(host.rematch(), false); assert.equal(host.game, lobby);
  for (const client of clients) client.ready(true);
  await flush(); assert.equal(host.game.start(), true);
  assert.equal(host.rematch(), false);
  host.game.setPaused(host.selfId, true); assert.equal(host.rematch(), false); host.game.setPaused(host.selfId, false);
  clients[0].close(); await flush();
  host.game.advance(ROUND_SECONDS); assert.equal(host.game.phase, 'finished');
  const old = host.game;
  assert.equal(guest.rematch(), false); assert.equal(host.rematch(), true); await flush();
  assert.equal(host.game.mapId, old.mapId); assert.equal(host.game.mode, old.mode);
  assert.notEqual(host.game.round, old.round); assert.notEqual(host.game.seed, old.seed);
  assert.equal(host.game.phase, 'lobby'); assert.equal(host.game.elapsed, 0);
  assert.equal(host.game.eaten, 0); assert.deepEqual(host.game.claims, []);
  assert.deepEqual(host.game.players.map(player => player.id), [host.selfId, guest.selfId]);
  assert.deepEqual(host.game.players.map(player => player.color), old.players.filter(player => player.online).map(player => player.color));
  assert.deepEqual(host.game.players.map(player => player.ready), [true, false]);
  assert.deepEqual(guest.snapshots.at(-1), host.snapshots.at(-1));
  const rematch = host.game; assert.equal(host.rematch(), false); assert.equal(host.game, rematch);
  host.game.phase = 'finished'; host.close(); assert.equal(host.rematch(), false);
});

test('multiple map changes in one clock tick still change the seed and round each time', async t => {
  const { host } = await createRoom(t);
  t.mock.method(Date, 'now', () => 12345);
  host.game.seed = 12345;
  for (const mapId of [alternateMap(), DEFAULT_MAP, alternateMap()]) {
    const oldSeed = host.game.seed, oldRound = host.game.round;
    assert.equal(host.selectMap(mapId), true);
    assert.notEqual(host.game.seed, oldSeed); assert.notEqual(host.game.round, oldRound);
  }
});

test('published physics poses and completed IDs reach guests without running client physics', async t => {
  const { host, guest } = await createRoom(t);
  guest.ready(true); await flush(); host.game.start();
  const item = host.game.items.find(item => item.type === 'stone');
  Object.assign(host.game.players[0], { x: item.x, z: item.z });
  host.game.advance(.05); host.publish(); await flush();
  const active = guest.snapshots.at(-1).claims.find(claim => claim.id === item.id);
  assert.equal(active.done, false); assert.ok(active.pose.y < 0); assert.equal(active.pose.q.length, 4);
  assert.deepEqual(guest.snapshots.at(-1), host.snapshots.at(-1));
  assert.equal(guest.game, undefined, 'guests receive authority, never a second physics world');
  host.game.advance(.5); host.game.advance(.5); host.publish(); await flush();
  const fresh = JSON.parse(JSON.stringify(guest.snapshots.at(-1)));
  assert.deepEqual(fresh.claims.find(claim => claim.id === item.id), { id: item.id, done: true });
  assert.equal(createMap(fresh.mapId, fresh.seed).items.length, fresh.total);
  assert.deepEqual(guest.snapshots.at(-1), host.snapshots.at(-1));
});
