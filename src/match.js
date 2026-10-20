import { START_RADIUS, radiusForMass, clampPosition } from './rules.js';
import { createMap, DEFAULT_MAP } from './maps/index.js';
import { HolePhysics, PHYSICS_STEP, MAX_CATCHUP } from './physics/world.js';

export const ROUND_SECONDS = 120;
export const MAX_PLAYERS = 4;
export const PLAYER_COLORS = ['#a68add', '#e59c77', '#62adad', '#d8ae55'];
export const modeName = mode => ({ free: '自由漫游', timed: '限时挑战', race: '好友竞赛', coop: '合作清空' })[mode];
export const cleanName = name => String(name || '小小黑洞').trim().slice(0, 12) || '小小黑洞';

export class Match {
  constructor(mode = 'free', seed = Date.now() >>> 0, mapId = DEFAULT_MAP) {
    this.mode = mode;
    this.seed = seed;
    this.round = crypto.randomUUID();
    this.phase = 'lobby';
    this.elapsed = 0;
    this.players = [];
    this.mapId = mapId;
    this.map = createMap(mapId, seed);
    this.items = this.map.items;
    this.claims = [];
    this.physics = new HolePhysics(this.items);
    this.physicsAccumulator = 0;
    this.movementAccumulator = 0;
    this.eaten = 0;
  }
  addPlayer(id, name) {
    if (this.phase !== 'lobby' || this.players.length >= MAX_PLAYERS || this.players.some(player => player.id === id)) return false;
    const index = this.players.length;
    const spawn = this.map.spawns[index % this.map.spawns.length];
    this.players.push({ id, name: cleanName(name), color: PLAYER_COLORS[index], x: spawn.x, z: spawn.z, radius: START_RADIUS, mass: 0, eaten: 0, online: true, ready: index === 0, input: { x: 0, z: 0 }, inputAt: 0 });
    return true;
  }
  removePlayer(id) {
    if (this.phase === 'lobby') this.players = this.players.filter(player => player.id !== id);
    else {
      const player = this.players.find(player => player.id === id);
      if (player) { player.online = false; player.input = { x: 0, z: 0 }; }
    }
  }
  setReady(id, ready) {
    const player = this.players.find(player => player.id === id);
    if (player && this.phase === 'lobby') player.ready = Boolean(ready);
  }
  start() {
    if (this.phase !== 'lobby' || !this.players.length || this.players.some(player => !player.ready)) return false;
    this.phase = 'playing';
    return true;
  }
  setInput(id, input) {
    const player = this.players.find(player => player.id === id);
    if (this.phase !== 'playing' || !player || !player.online || !input || !Number.isFinite(input.x) || !Number.isFinite(input.z)) return;
    const scale = Math.max(1, Math.hypot(input.x, input.z));
    player.input = { x: input.x / scale, z: input.z / scale };
    player.inputAt = this.elapsed;
  }
  setPaused(id, paused) {
    if (id !== this.players[0]?.id || !['playing', 'paused'].includes(this.phase)) return false;
    this.phase = paused ? 'paused' : 'playing';
    for (const player of this.players) player.input = { x: 0, z: 0 };
    return true;
  }
  advance(dt) {
    if (this.phase !== 'playing' || !Number.isFinite(dt) || dt <= 0) return;
    const timed = this.mode === 'timed' || this.mode === 'race';
    const next = Math.min(this.elapsed + dt, timed ? ROUND_SECONDS : Infinity);
    this.movementAccumulator = Math.min(this.movementAccumulator + Math.min(next - this.elapsed, .1), MAX_CATCHUP);
    this.physicsAccumulator = Math.min(this.physicsAccumulator + next - this.elapsed, MAX_CATCHUP);
    this.elapsed = next;
    for (const player of this.players) {
      if (this.elapsed - player.inputAt > .5) player.input = { x: 0, z: 0 };
    }
    while (this.physicsAccumulator + 1e-10 >= PHYSICS_STEP) {
      const movementTime = Math.min(PHYSICS_STEP, this.movementAccumulator);
      this.movementAccumulator -= movementTime;
      for (const player of this.players) {
        const speed = (6.5 + player.radius * .4) * movementTime;
        player.x = clampPosition(player.x + player.input.x * speed, player.radius, this.map.bounds);
        player.z = clampPosition(player.z + player.input.z * speed, player.radius, this.map.bounds);
      }
      // The host alone integrates rigid bodies and awards completed crossings.
      for (const completed of this.physics.step(this.players)) {
        const player = this.players.find(player => player.id === completed.owner);
        if (!player) continue;
        player.mass += this.items[completed.id].mass;
        player.radius = radiusForMass(player.mass);
        player.eaten++; this.eaten++;
      }
      if (this.mode === 'coop') {
        const teamRadius = radiusForMass(this.players.reduce((mass, player) => mass + player.mass, 0));
        for (const player of this.players) player.radius = teamRadius;
      }
      this.physicsAccumulator -= PHYSICS_STEP;
    }
    this.claims = this.physics.snapshot();
    if ((timed && this.elapsed >= ROUND_SECONDS) || this.eaten === this.items.length) {
      this.phase = 'finished';
      for (const player of this.players) player.input = { x: 0, z: 0 };
      return;
    }
  }
  snapshot() {
    return {
      round: this.round, mode: this.mode, mapId: this.mapId, seed: this.seed, phase: this.phase, elapsed: this.elapsed,
      eaten: this.eaten, total: this.items.length,
      players: this.players.map(({ input, inputAt, ...player }) => ({ ...player, vx: this.phase === 'playing' ? input.x * (6.5 + player.radius * .4) : 0, vz: this.phase === 'playing' ? input.z * (6.5 + player.radius * .4) : 0 })),
      // Untouched props are reconstructed from the map seed; only touched
      // poses and completed IDs are sent. Never share mutable quaternion arrays.
      claims: this.claims.map(claim => claim.done && !claim.pose ? { id: claim.id, done: true } : { ...claim, ...(claim.pose && { pose: { ...claim.pose, q: [...claim.pose.q] } }) }),
    };
  }
}

export function standings(players) {
  return [...players].sort((a, b) => b.mass - a.mass || b.eaten - a.eaten);
}
