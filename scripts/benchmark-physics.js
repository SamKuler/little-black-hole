#!/usr/bin/env node
// Reproducible local timing diagnostic, not a CI performance assertion.
// Usage: node scripts/benchmark-physics.js [one-hole|four-starting-holes|four-large-holes]
// Each selected scenario runs exactly five simulated seconds at the configured fixed rate.
import { performance } from 'node:perf_hooks';
import { Body } from 'cannon-es';
import { createMap } from '../src/maps/index.js';
import { HolePhysics, PHYSICS_STEP } from '../src/physics/world.js';

const MAP_ID = 'town';
const SEED = 42;
const SIMULATED_SECONDS = 5;
const STEP_COUNT = Math.round(SIMULATED_SECONDS / PHYSICS_STEP);
const PATH_RADIUS = 8;
const definitions = [
  { name: 'one-hole', radius: 1.2, centers: map => map.spawns.slice(0, 1) },
  { name: 'four-starting-holes', radius: 1.2, centers: map => map.spawns },
  // Four moving large mouths cover populated central districts and encounter
  // many props, including tall buildings and their broad swept footprints.
  { name: 'four-large-holes', radius: 8, centers: () => [
    { x: -12, z: -12 }, { x: 12, z: -12 }, { x: -12, z: 12 }, { x: 12, z: 12 },
  ] },
];
const requested = process.argv.slice(2);
const selected = requested.length ? definitions.filter(scenario => requested.includes(scenario.name)) : definitions;
if (requested.some(name => !definitions.some(scenario => scenario.name === name))) {
  console.error(`Unknown scenario. Choose: ${definitions.map(scenario => scenario.name).join(', ')}`);
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({
    diagnostic: 'Physics-only timings; no pass/fail threshold', node: process.version,
    map: MAP_ID, seed: SEED, simulatedSeconds: SIMULATED_SECONDS, fixedStep: PHYSICS_STEP,
    path: '8-unit circles at 1 radian/second; hole radius stays fixed',
    timingScope: 'HolePhysics.step, including on-demand collider creation; excludes map construction and metric collection',
    cpuScope: 'Process user+system CPU includes V8 worker threads and metric collection; it may exceed wall time',
  }));
  for (const scenario of selected) console.log(JSON.stringify(run(scenario)));
}

function run(scenario) {
  const map = createMap(MAP_ID, SEED);
  const physics = new HolePhysics(map.items);
  const centers = scenario.centers(map).map(center => ({ ...center }));
  const holes = centers.map((center, index) => ({ ...center, id: `benchmark-${index}`, online: true, radius: scenario.radius }));
  const samples = [];
  let peakAwake = 0, peakTouched = 0, peakContacts = 0, peakBodies = 0, scored = 0;
  const cpuStart = process.cpuUsage();
  const start = performance.now();
  for (let step = 0; step < STEP_COUNT; step++) {
    const time = step * PHYSICS_STEP;
    for (let index = 0; index < holes.length; index++) {
      holes[index].x = centers[index].x + Math.sin(time) * PATH_RADIUS;
      holes[index].z = centers[index].z + Math.cos(time) * PATH_RADIUS;
    }
    const before = performance.now();
    const completed = physics.step(holes);
    samples.push(performance.now() - before);
    scored += completed.length;
    let awake = 0;
    for (const body of physics.world.bodies) {
      if (body.type === Body.DYNAMIC && body.sleepState !== Body.SLEEPING) awake++;
    }
    peakAwake = Math.max(peakAwake, awake);
    peakBodies = Math.max(peakBodies, physics.world.bodies.length - 1);
    peakTouched = Math.max(peakTouched, physics.records.size);
    peakContacts = Math.max(peakContacts, physics.world.contacts.length);
  }
  const wallMs = performance.now() - start;
  const cpu = process.cpuUsage(cpuStart);
  const sorted = [...samples].sort((a, b) => a - b);
  const physicsMs = samples.reduce((sum, elapsed) => sum + elapsed, 0);
  const round = value => Number(value.toFixed(3));
  return {
    scenario: scenario.name, holeCount: holes.length, holeRadius: scenario.radius,
    itemCount: map.items.length, simulatedSeconds: STEP_COUNT * PHYSICS_STEP, steps: STEP_COUNT,
    averageStepMs: round(physicsMs / samples.length),
    p95StepMs: round(sorted[Math.ceil(sorted.length * .95) - 1]), maxStepMs: round(sorted.at(-1)),
    physicsTotalMs: round(physicsMs), wallTotalMs: round(wallMs), cpuTotalMs: round((cpu.user + cpu.system) / 1000),
    peakAwake, peakTouched, peakContacts, peakBodies, scored,
  };
}
