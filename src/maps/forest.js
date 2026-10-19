import { createLayout, nearPath } from './layout.js';

const BOUNDS = 58;
const SPAWNS = [{ x: -25, z: -25 }, { x: 25, z: 25 }, { x: 25, z: -25 }, { x: -25, z: 25 }];
const streamX = z => 7 * Math.sin(z / 16);
const RIVER = Array.from({ length: 37 }, (_, i) => { const z = -58 + i * 116 / 36; return [streamX(z), z]; });
const TRAILS = [-25, 0, 25].map(z => [[-54, z - 2], [-40, z + 1], [-25, z], [-12, z - 3], [streamX(z), z], [14, z + 3], [25, z], [40, z - 2], [54, z + 1]]);
TRAILS.push([[-28, -54], [-25, -25], [-31, -10], [-25, 25], [-30, 54]], [[30, -54], [25, -25], [32, 6], [25, 25], [28, 54]]);
const GROVES = [[-42, -40], [-10, -39], [40, -39], [-42, 0], [-10, 10], [39, 0], [-41, 40], [10, 40], [42, 40]];

function drawForest(layout) {
  const { box, clearing, path } = layout;
  box('#718d71', 0, 0, 118, 118, -1.1, 2);
  box('#91ad7c', 0, 0, 118, 118, -.12, .22);
  for (const [x, z] of GROVES) {
    clearing('#73976e', x, z, 29, 25, .012);
    clearing('#7fa376', x + 2, z - 2, 20, 19, .016);
  }
  for (const spawn of SPAWNS) clearing('#abb985', spawn.x, spawn.z, 29, 26, .02);
  for (const trail of TRAILS) path('#c3b28c', trail, 3.2, .028);
  path('#b7b99a', RIVER, 10, .036);
  path('#579eaa', RIVER, 6.8, .042);
  path('#78b9b7', RIVER.map(([x, z]) => [x - .8, z]), 2.1, .043);
  for (const z of [-25, 0, 25]) {
    box('#bfa077', streamX(z), z, 12, 4.5, .145, .065);
    for (let x = -5; x <= 5; x++) box('#987e59', streamX(z) + x, z, .07, 4.5, .18, .015);
  }
  for (const [x, z] of [[-39, 8], [13, 39], [38, 11]]) {
    clearing('#c1bda0', x, z, 12, 10, .045);
    clearing('#629fa1', x, z, 8.4, 7.2, .049);
    clearing('#7bb7b0', x - .8, z - .6, 5.4, 4.6, .05);
  }
  clearing('#b3b894', -13, 12, 14, 17, .025);
  clearing('#afbd84', 38, -12, 16, 18, .025);
  clearing('#bec694', -13, -40, 19, 13, .025);
}

function create(seed) {
  const layout = createLayout(BOUNDS, seed, SPAWNS);
  const { scatter, integer, pick, range, random } = layout;
  drawForest(layout);
  layout.starters(['mushroom', 'stone', 'bush'], ['log', 'log']);
  const ponds = [[-39, 8], [13, 39], [38, 11]];
  const onLand = (x, z, radius) => (!nearPath(x, z, RIVER, 4.4 + radius) || [-25, 0, 25].some(at => Math.abs(z - at) < 1.5)) && ponds.every(([px, pz]) => Math.hypot((x - px) / 5.5, (z - pz) / 4.7) > 1 + radius / 4.7);
  const offTrail = (x, z, radius) => onLand(x, z, radius) && TRAILS.every(trail => !nearPath(x, z, trail, radius + 2));
  const inGrove = () => {
    const [x, z] = pick(GROVES), angle = range(0, Math.PI * 2), radius = Math.sqrt(random()) * 13;
    return { x: x + Math.cos(angle) * radius, z: z + Math.sin(angle) * radius };
  };
  scatter(integer(12, 17), ['cabin'], { valid: (x, z, radius) => offTrail(x, z, radius) && TRAILS.some(trail => nearPath(x, z, trail, 10)) });
  scatter(integer(12, 17), ['ancientTree'], { valid: offTrail, position: inGrove });
  scatter(integer(36, 48), ['boulder'], { valid: onLand });
  scatter(integer(172, 198), ['tree', 'pine', 'pine', 'log'], { valid: offTrail, position: inGrove, colors: { tree: ['#649266', '#91a965'], pine: ['#43785e', '#568a71'] } });
  scatter(integer(288, 328), ['mushroom', 'mushroom', 'bush', 'stone'], { valid: onLand });
  layout.fillGaps(['mushroom', 'bush', 'stone'], onLand);
  return { placements: layout.placements, surfaces: layout.surfaces };
}

export const forestMap = {
  id: 'forest', name: '秘境森林', bounds: BOUNDS, theme: 'light', preview: '/maps/forest.jpg',
  spawns: SPAWNS, sky: '#d8e3d6', cameraOffset: [32, 44, 38], fog: [86, 165],
  lighting: { skyLight: '#fff5de', groundLight: '#648573', ambientIntensity: 1.9, sunColor: '#fff0cf', sunIntensity: 2.7, exposure: 1.05 },
  create,
};
