import { Body, Broadphase, Plane, Vec3, World } from 'cannon-es';
import { createItemBody } from './shapes.js';
import { GROUND_THICKNESS, installPerforatedGround, inOpening } from './ground.js';

export const PHYSICS_STEP = 1 / 60;
export const MAX_CATCHUP = .5;

// Props interact with the ground/rim, not with one another. This deliberately
// avoids an O(n²) broadphase and unstable piles in the densely populated maps.
class GroundBroadphase extends Broadphase {
  collisionPairs(world, pairsA, pairsB) {
    const ground = world.bodies[0];
    for (let i = 1; i < world.bodies.length; i++) {
      const body = world.bodies[i];
      if (body.sleepState !== Body.SLEEPING) { pairsA.push(ground); pairsB.push(body); }
    }
  }
}

export class HolePhysics {
  constructor(items) {
    this.items = items;
    this.records = new Map();
    this.holes = [];
    this.turn = 0;
    this.world = new World({ gravity: new Vec3(0, -22, 0), allowSleep: true });
    this.world.broadphase = new GroundBroadphase();
    this.world.solver.iterations = 18;
    this.world.solver.tolerance = 1e-7;
    Object.assign(this.world.defaultContactMaterial, {
      friction: .45, restitution: 0, contactEquationStiffness: 1e7,
      contactEquationRelaxation: 4, frictionEquationStiffness: 1e7,
    });
    const ground = new Body({ mass: 0, shape: new Plane() });
    ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    this.world.addBody(ground);
    installPerforatedGround(this.world, () => this.holes);
  }
  activate(id) {
    if (this.records.has(id)) return this.records.get(id);
    const proxy = createItemBody(this.items[id]);
    const record = { ...proxy, id, owner: null, done: false, pose: this.pose(proxy) };
    proxy.body.linearDamping = .08; proxy.body.angularDamping = .15;
    proxy.body.sleepSpeedLimit = .08; proxy.body.sleepTimeLimit = .5;
    this.records.set(id, record); this.world.addBody(proxy.body);
    return record;
  }
  pose({ body, modelOffset }) {
    const origin = body.position.vsub(body.quaternion.vmult(modelOffset));
    return { x: origin.x, y: origin.y, z: origin.z, q: body.quaternion.toArray() };
  }
  verticalBounds(record) {
    let min = Infinity, max = -Infinity;
    const point = new Vec3();
    for (const vertex of record.localVertices) {
      record.body.quaternion.vmult(vertex, point);
      const y = point.y + record.body.position.y;
      min = Math.min(min, y); max = Math.max(max, y);
    }
    return { min, max };
  }
  step(players) {
    const previous = this.holes;
    this.holes = players.filter(player => player.online).map(({ id, x, z, radius }) => ({ id, x, z, radius }));
    const changed = this.holes.length !== previous.length || this.holes.some((hole, i) => !previous[i] || hole.id !== previous[i].id || hole.x !== previous[i].x || hole.z !== previous[i].z || hole.radius !== previous[i].radius);
    // Unaffected props never enter the solver. A sleeping moved prop is woken
    // when a mouth changes nearby, including when its support returns.
    for (const item of this.items) {
      const existing = this.records.get(item.id);
      if (existing?.done) continue;
      const x = existing?.body.position.x ?? item.x, z = existing?.body.position.z ?? item.z;
      const reach = existing?.body.boundingRadius ?? item.radius;
      const nearby = this.holes.some(hole => Math.hypot(x - hole.x, z - hole.z) < hole.radius + reach);
      if (!existing && nearby) this.activate(item.id);
      else if (existing && changed && (nearby || previous.some(hole => Math.hypot(x - hole.x, z - hole.z) < hole.radius + reach))) existing.body.wakeUp();
    }
    this.world.step(PHYSICS_STEP);
    const completed = [];
    for (const record of this.records.values()) {
      if (record.done) continue;
      const bounds = this.verticalBounds(record), body = record.body;
      record.pose = this.pose(record);
      if (bounds.min > -.025) record.owner = null;
      if (!record.owner && bounds.min < -.04) {
        const candidates = this.holes.filter(hole => inOpening(body.position.x, body.position.z, [hole]));
        const order = id => (this.holes.findIndex(hole => hole.id === id) + this.turn) % Math.max(1, this.holes.length);
        candidates.sort((a, b) => Math.hypot(a.x - body.position.x, a.z - body.position.z) - Math.hypot(b.x - body.position.x, b.z - body.position.z) || order(a.id) - order(b.id));
        record.owner = candidates[0]?.id ?? null;
      }
      // Geometric clearance, never a timer: roofs/canopies must clear too.
      // Include omitted decorative trim using the catalog's conservative
      // full-model envelope, so a simplified collider cannot score too early.
      const item = this.items[record.id], q = body.quaternion;
      const upY = 1 - 2 * (q.x * q.x + q.z * q.z);
      const visibleTop = record.pose.y + Math.max(0, item.height * upY) + item.radius * Math.sqrt(Math.max(0, 1 - upY * upY));
      if (record.owner && Math.max(bounds.max, visibleTop) < -GROUND_THICKNESS - .06) {
        record.done = true;
        record.completedAt = this.world.time;
        this.world.removeBody(body);
        completed.push({ id: record.id, owner: record.owner });
      }
    }
    this.turn++;
    return completed;
  }
  snapshot() {
    return [...this.records.values()].map(record => record.done && this.world.time - record.completedAt > .25
      ? { id: record.id, done: true }
      : { id: record.id, owner: record.owner, done: record.done, pose: { ...record.pose, q: [...record.pose.q] } });
  }
}
