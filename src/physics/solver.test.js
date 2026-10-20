import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Body, Box, ContactEquation, FrictionEquation, Plane, Vec3, World } from 'cannon-es';
import { GroundSolver, coupleContactFriction } from './solver.js';
import { installPerforatedGround } from './ground.js';

function fixture({ dt = 1 / 60, mass = 1, normal = [0, 1, 0], lever = [0, 0, 0],
  velocity = [10, 0, 2], gravity = [0, -9.81, 0], angle = 0, bias = 0,
  fixedRotation = false, iterations = 18, stiffness = 1e12 } = {}) {
  const ground = new Body({ mass: 0 });
  const body = new Body({ mass, shape: new Box(new Vec3(.5, .5, .5)), fixedRotation, allowSleep: true });
  body.velocity.set(...velocity); body.force.set(...gravity); body.force.scale(mass, body.force);
  const contact = new ContactEquation(ground, body);
  contact.ni.set(...normal); contact.ri.set(...lever); contact.rj.set(...lever);
  contact.positionBias = bias;
  contact.setSpookParams(stiffness, 4, dt);
  const tangents = [new FrictionEquation(ground, body, 1e6), new FrictionEquation(ground, body, 1e6)];
  const t1 = new Vec3(), t2 = new Vec3();
  contact.ni.tangents(t1, t2); t1.normalize(); t2.normalize();
  tangents[0].t.copy(t1.scale(Math.cos(angle)).vadd(t2.scale(Math.sin(angle))));
  tangents[1].t.copy(t1.scale(-Math.sin(angle)).vadd(t2.scale(Math.cos(angle))));
  for (const tangent of tangents) {
    tangent.ri.copy(contact.ri); tangent.rj.copy(contact.rj);
    tangent.setSpookParams(stiffness, 4, dt);
  }
  coupleContactFriction(contact, tangents, .45);
  const solver = new GroundSolver(); solver.iterations = iterations;
  // Cannon's world deliberately inserts friction before normals.
  for (const equation of [...tangents, contact]) solver.addEquation(equation);
  const world = { bodies: [ground, body] };
  return { ground, body, contact, tangents, solver, dt, world,
    solve() { solver.solve(dt, world); },
    friction() { return tangents[0].t.scale(tangents[0].contactImpulse).vadd(tangents[1].t.scale(tangents[1].contactImpulse)); },
  };
}
function close(a, b, tolerance = 1e-9) { assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`); }
function closeVector(a, b, tolerance = 1e-9) { a.toArray().forEach((value, i) => close(value, b.toArray()[i], tolerance)); }

test('friction uses physical normal impulse and converts multiplier back to force across time steps', () => {
  for (const dt of [1 / 30, 1 / 60, 1 / 120, 1 / 960]) for (const mass of [.1, 1, 1000]) {
    const f = fixture({ dt, mass }); f.solve();
    const expected = 9.81 * dt / (1 / mass + f.contact.eps);
    close(f.contact.contactImpulse, expected, 1e-8);
    close(f.contact.multiplier, expected / dt, 1e-6);
    close(f.friction().length(), .45 * expected, 1e-8);
    assert.ok([...f.body.velocity.toArray(), ...f.body.angularVelocity.toArray()].every(Number.isFinite));
  }
});

test('fast oblique sliding is opposed in its own direction, not clamped to a square or 45 degrees', () => {
  const f = fixture({ velocity: [10, 0, 2], fixedRotation: true }); f.solve();
  const friction = f.friction(), budget = .45 * f.contact.contactImpulse;
  closeVector(friction, new Vec3(-10, 0, -2).scale(budget / Math.hypot(10, 2)));
});

test('off-center friction and normal load are basis-invariant for short and long solves', () => {
  for (const iterations of [1, 18, 100]) {
    const base = fixture({ lever: [.5, -.5, .5], iterations }); base.solve();
    for (const angle of [.17, Math.PI / 4, Math.PI / 2, Math.PI]) {
      const rotated = fixture({ lever: [.5, -.5, .5], angle, iterations }); rotated.solve();
      closeVector(rotated.friction(), base.friction());
      closeVector(rotated.body.velocity, base.body.velocity);
      closeVector(rotated.body.angularVelocity, base.body.angularVelocity);
      close(rotated.contact.contactImpulse, base.contact.contactImpulse);
    }
  }
});

test('unsaturated friction converges to the SPOOK velocity constraint without a minimum force', () => {
  const f = fixture({ velocity: [.01, 0, -.02] }); f.solve();
  const expected = new Vec3(-.01, 0, .02).scale(f.tangents[0].b / (1 + f.tangents[0].eps));
  closeVector(f.friction(), expected, 1e-7);
  assert.ok(f.friction().length() < .45 * f.contact.contactImpulse);
});

test('an unloaded wall cannot suspend a falling body, even while repairing overlap', () => {
  const f = fixture({ normal: [1, 0, 0], velocity: [0, -3, 0], bias: 1 }); f.solve();
  close(f.contact.contactImpulse, 0); closeVector(f.friction(), new Vec3());
  closeVector(f.body.velocity, new Vec3(0, -3, 0));
  assert.ok(f.body.position.x > 0, 'overlap still receives a positional correction');
  close(f.body.position.y, 0);
});

test('unilateral contacts cannot pull a separating body or give it friction', () => {
  const f = fixture({ normal: [1, 0, 0], velocity: [2, -3, 1] }); f.solve();
  close(f.contact.contactImpulse, 0); closeVector(f.friction(), new Vec3());
  closeVector(f.body.velocity, new Vec3(2, -3, 1));
});

test('reused contact and tangent equations clear normal load, basis and pair references', () => {
  const f = fixture(); f.solve(); assert.ok(f.contact.contactImpulse > 0);
  const next = new ContactEquation(f.ground, f.body);
  next.ni.set(1, 0, 0); next.setSpookParams(1e12, 4, f.dt);
  f.body.velocity.set(0, -3, 0); f.body.angularVelocity.setZero();
  next.ni.tangents(f.tangents[0].t, f.tangents[1].t);
  coupleContactFriction(next, f.tangents, .2);
  f.solver.removeAllEquations();
  for (const equation of [...f.tangents, next]) f.solver.addEquation(equation);
  f.solve();
  close(next.contactImpulse, 0); closeVector(f.friction(), new Vec3());
  assert.ok(f.tangents.every(tangent => tangent.normalContact === next));
  assert.equal(f.tangents[0].otherTangent, f.tangents[1]);
  assert.equal(f.tangents[1].otherTangent, f.tangents[0]);
  closeVector(f.body.velocity, new Vec3(0, -3, 0));
});

test('split position repair changes pose but not physical velocities, multipliers or friction budgets', () => {
  const base = fixture({ lever: [.5, -.5, .5] }); base.solve();
  const repaired = fixture({ lever: [.5, -.5, .5], bias: .4 });
  repaired.body.aabbNeedsUpdate = false; repaired.solve();
  closeVector(repaired.body.velocity, base.body.velocity);
  closeVector(repaired.body.angularVelocity, base.body.angularVelocity);
  closeVector(repaired.friction(), base.friction());
  close(repaired.contact.multiplier, base.contact.multiplier);
  close(repaired.contact.contactImpulse, base.contact.contactImpulse);
  assert.ok(repaired.body.position.y > 0);
  assert.ok(Math.abs(repaired.body.quaternion.x) + Math.abs(repaired.body.quaternion.z) > 0);
  close(Math.hypot(...repaired.body.quaternion.toArray()), 1);
  assert.equal(repaired.body.aabbNeedsUpdate, true);
  closeVector(repaired.ground.position, new Vec3());
  closeVector(repaired.ground.velocity, new Vec3());
});

test('zero-bias normal constraints participate in repair without gaining physical impulse', () => {
  const f = fixture({ normal: [0, 1, 0], velocity: [0, 0, 0], gravity: [0, 0, 0], bias: .4 });
  const ceiling = new ContactEquation(f.ground, f.body); ceiling.ni.set(0, -1, 0);
  ceiling.positionBias = 0; ceiling.setSpookParams(1e12, 4, f.dt);
  f.solver.addEquation(ceiling); f.solve();
  assert.ok(f.body.position.y < 1e-8, 'the zero-bias opposing surface constrains correction');
  closeVector(f.body.velocity, new Vec3()); close(f.contact.contactImpulse, 0); close(ceiling.contactImpulse, 0);
});

test('meaningful positional recovery delays sleep while numerical residue does not', () => {
  for (const [bias, expectedState] of [[.4, Body.AWAKE], [1e-6, Body.SLEEPY]]) {
    const f = fixture({ velocity: [0, 0, 0], gravity: [0, 0, 0], bias });
    f.body.sleepState = Body.SLEEPY; f.solve();
    assert.equal(f.body.sleepState, expectedState);
  }
});

test('normal impulses and friction remain bounded and finite with production stiffness and many substeps', () => {
  for (const dt of [1 / 60, 1 / 240, 1 / 960]) {
    const f = fixture({ dt, mass: 200, stiffness: 1e7, lever: [.5, -.5, .5], bias: .1 }); f.solve();
    assert.ok(f.contact.contactImpulse >= 0 && Number.isFinite(f.contact.contactImpulse));
    assert.ok(f.friction().length() <= .45 * f.contact.contactImpulse + 1e-9);
    assert.ok([...f.body.position.toArray(), ...f.body.quaternion.toArray(), ...f.body.velocity.toArray(), ...f.body.angularVelocity.toArray()].every(Number.isFinite));
  }
});

test('stationary contacts do not add kinetic energy across varied off-center impacts', () => {
  let seed = 737;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32 * 2 - 1);
  for (let i = 0; i < 100; i++) {
    const f = fixture({ gravity: [0, 0, 0], lever: [random() * .5, -.5, random() * .5],
      velocity: [random() * 10, -Math.abs(random()) * 10, random() * 10] });
    f.body.angularVelocity.set(random() * 5, random() * 5, random() * 5);
    // Unit-mass unit cube, with principal inertia 1/6 on each axis.
    const energy = () => f.body.velocity.lengthSquared() / 2 + f.body.angularVelocity.lengthSquared() / 12;
    const before = energy(); f.solve();
    assert.ok(energy() <= before + 1e-8, 'friction/contact impulses cannot power the body');
  }
});

test('integrated sliding decelerates by mu*g for axial and oblique motion at several step sizes', () => {
  for (const dt of [1 / 60, 1 / 120, 1 / 240]) for (const velocity of [[5, 0, 0], [3, 0, 4]]) {
    const world = new World({ gravity: new Vec3(0, -10, 0) });
    world.solver = new GroundSolver(); world.solver.iterations = 18;
    world.defaultContactMaterial.friction = .4;
    const ground = new Body({ mass: 0, shape: new Plane() });
    ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0); world.addBody(ground);
    const body = new Body({ mass: 1, shape: new Box(new Vec3(.2, .2, .2)),
      position: new Vec3(0, .2, 0), fixedRotation: true, linearDamping: 0, angularDamping: 0 });
    body.velocity.set(...velocity); world.addBody(body);
    installPerforatedGround(world, () => []);
    for (let i = 0; i < Math.round(.5 / dt); i++) world.step(dt);
    // speed = 5 - (mu=.4) * (g=10) * (elapsed=.5) = 3.
    close(Math.hypot(body.velocity.x, body.velocity.z), 3, 1e-4);
    close(body.velocity.x, velocity[0] * .6, 1e-4);
    close(body.velocity.z, velocity[2] * .6, 1e-4);
  }
});
