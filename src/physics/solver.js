import { Body, GSSolver } from 'cannon-es';

// Adapted from cannon-es 0.20 GSSolver, Copyright (c) 2015 cannon.js Authors.
// Its MIT license is reproduced in public/THIRD_PARTY_NOTICES.txt.
// Keep cannon's SPOOK equations/integration, but solve normals before paired
// Coulomb friction. All accumulated lambdas are impulses, not forces.
export class GroundSolver extends GSSolver {
  constructor() {
    super();
    this.lambda = []; this.rhs = []; this.inverseC = [];
    this.positionLambda = []; this.positionEquations = [];
  }
  solve(dt, world) {
    const equations = this.equations, count = equations.length;
    if (!count) return 0;
    equations.sort((a, b) => Number(!!a.normalContact) - Number(!!b.normalContact));
    const { lambda, rhs, inverseC, positionEquations } = this;
    lambda.length = rhs.length = inverseC.length = count;
    positionEquations.length = 0;
    let hasPositionError = false;
    for (const body of world.bodies) {
      body.updateSolveMassProperties();
      body.vlambda.setZero(); body.wlambda.setZero();
    }
    for (let i = 0; i < count; i++) {
      const equation = equations[i];
      equation.solverIndex = i;
      equation.contactImpulse = lambda[i] = 0;
      rhs[i] = equation.computeB(dt);
      inverseC[i] = 1 / equation.computeC();
      if (!equation.normalContact && Number.isFinite(equation.positionBias)) {
        positionEquations.push(i);
        hasPositionError ||= equation.positionBias > 0;
      }
    }
    let iteration = 0;
    for (; iteration < this.iterations; iteration++) {
      let error = 0;
      for (let i = 0; i < count; i++) {
        const equation = equations[i], previous = lambda[i];
        if (equation.normalContact) {
          if (!equation.lastTangent) continue;
          const other = equation.otherTangent, j = other.solverIndex;
          // A common step and simultaneous residuals make this update
          // independent of the arbitrary tangent basis, including off-center
          // rotational contacts. The trace bounds the largest eigenvalue of
          // the positive 2x2 effective-mass matrix, so the step is stable.
          const step = 1 / (1 / inverseC[i] + 1 / inverseC[j]);
          let nextI = previous + step * (rhs[i] - equation.computeGWlambda() - equation.eps * previous);
          let nextJ = lambda[j] + step * (rhs[j] - other.computeGWlambda() - other.eps * lambda[j]);
          const limit = equation.frictionCoefficient * Math.max(0, equation.normalContact.contactImpulse);
          const length = Math.hypot(nextI, nextJ);
          if (length > limit) {
            const scale = limit / length;
            nextI *= scale; nextJ *= scale;
          }
          const deltaI = nextI - previous, deltaJ = nextJ - lambda[j];
          lambda[i] = equation.contactImpulse = nextI;
          lambda[j] = other.contactImpulse = nextJ;
          equation.addToWlambda(deltaI); other.addToWlambda(deltaJ);
          error += Math.abs(deltaI) + Math.abs(deltaJ);
        } else {
          const delta = inverseC[i] * (rhs[i] - equation.computeGWlambda() - equation.eps * previous);
          lambda[i] = Math.max(equation.minForce, Math.min(equation.maxForce, previous + delta));
          const applied = lambda[i] - previous;
          equation.addToWlambda(applied);
          equation.contactImpulse = lambda[i];
          error += Math.abs(applied);
        }
      }
      if (error * error < this.tolerance * this.tolerance) break;
    }
    for (const body of world.bodies) {
      body.vlambda.vmul(body.linearFactor, body.vlambda);
      body.velocity.vadd(body.vlambda, body.velocity);
      body.wlambda.vmul(body.angularFactor, body.wlambda);
      body.angularVelocity.vadd(body.wlambda, body.angularVelocity);
    }
    for (let i = 0; i < count; i++) equations[i].multiplier = lambda[i] / dt;
    if (hasPositionError) this.correctPositions(dt, world);
    return iteration;
  }
  correctPositions(dt, world) {
    // Split impulses: repair overlap using pseudo velocities, without kinetic
    // energy, gravity, wall velocity, or a friction budget. This is a bounded
    // linearized position pass, not a full NGS geometry rebuild.
    // Principle: https://box2d.org/posts/2024/02/solver2d/#nonlinear-gauss-seidel-ngs
    const { equations, positionEquations, positionLambda, inverseC } = this;
    positionLambda.length = equations.length;
    for (const i of positionEquations) positionLambda[i] = 0;
    for (const body of world.bodies) {
      body.vlambda.setZero(); body.wlambda.setZero();
    }
    for (let iteration = 0; iteration < this.iterations; iteration++) {
      let error = 0;
      for (const i of positionEquations) {
        const equation = equations[i], previous = positionLambda[i];
        const delta = inverseC[i] * (equation.positionBias - equation.computeGWlambda() - equation.eps * previous);
        const next = Math.max(0, Math.min(equation.maxForce, previous + delta));
        positionLambda[i] = next;
        equation.addToWlambda(next - previous);
        error += Math.abs(next - previous);
      }
      if (error * error < this.tolerance * this.tolerance) break;
    }
    for (const body of world.bodies) {
      if (body.type !== Body.DYNAMIC || body.sleepState === Body.SLEEPING) continue;
      body.vlambda.vmul(body.linearFactor, body.vlambda);
      body.position.addScaledVector(dt, body.vlambda, body.position);
      body.quaternion.integrate(body.wlambda, dt, body.angularFactor, body.quaternion);
      body.quaternion.normalize();
      body.updateInertiaWorld(); body.aabbNeedsUpdate = true;
      // A quiet velocity must not put a still-recovering body to sleep. Ignore
      // microscopic numerical residue so a settled body can sleep normally.
      const angularSquared = (body.wlambda.x * body.angularFactor.x) ** 2
        + (body.wlambda.y * body.angularFactor.y) ** 2 + (body.wlambda.z * body.angularFactor.z) ** 2;
      const movementSquared = dt * dt * (body.vlambda.lengthSquared() + angularSquared * body.boundingRadius ** 2);
      if (movementSquared > 1e-10) body.wakeUp();
    }
  }
}

export function coupleContactFriction(contact, tangents, coefficient) {
  contact.contactImpulse = 0;
  for (let i = 0; i < tangents.length; i++) {
    const tangent = tangents[i];
    // Vec3.tangents() returns orthogonal but not necessarily unit vectors.
    tangent.t.normalize();
    tangent.normalContact = contact;
    tangent.otherTangent = tangents[1 - i];
    tangent.lastTangent = i === 1;
    tangent.frictionCoefficient = coefficient;
    tangent.contactImpulse = 0;
  }
}
