import { createLayout, nearLine } from './layout.js';

const BOUNDS = 58;
const SPAWNS = [{ x: -25, z: -25 }, { x: 25, z: 25 }, { x: 25, z: -25 }, { x: -25, z: 25 }];
const streamX = z => 7 * Math.sin(z / 16);

function drawForest({ box, surface }) {
  box('#94ad8f', 0, 0, 118, 118, -1.1, 2);
  box('#6e9b79', 0, 0, 118, 118, -.12, .22);
  // Overlapping shallow oval patches soften the forest floor without a city grid.
  for (const [x, z, width, depth, color] of [[-28, -28, 38, 34, '#81a77f'], [29, 30, 36, 32, '#628c72'], [30, -28, 32, 36, '#92ac81'], [-30, 28, 34, 32, '#759b76']]) {
    for (let strip = -4; strip <= 4; strip++) {
      const chord = Math.sqrt(1 - (strip / 5) ** 2);
      surface(color, x, z + strip * depth / 10, width * chord, depth / 10 + .03);
    }
  }
  // A winding river separates pine woods and golden clearings. Bridges stay walkable.
  for (let z = -54; z <= 54; z += 4) {
    box('#b3b69b', streamX(z), z, 9.5, 4.1, .035, .04);
    box('#77b5b5', streamX(z), z, 6.7, 4.1, .065, .025);
    box('#9bcebd', streamX(z) - 1.6, z, .15, 2.2, .083, .012);
  }
  for (const z of [-25, 0, 25]) {
    box('#b5a386', 0, z, 104, 4.6, .095, .035);
    box('#c8b294', streamX(z), z, 12, 5.3, .125, .06);
    for (let x = -5; x <= 5; x += 1) box('#997f63', streamX(z) + x, z, .08, 5.3, .16, .015);
  }
  // The trail loops connect all four equal starting glades to the center.
  for (const x of [-25, 25]) box('#b4a387', x, 0, 4.6, 104, .09, .035);
  for (const spawn of SPAWNS) {
    box('#9fb98b', spawn.x, spawn.z, 19, 19, .08, .025);
    box('#c5b999', spawn.x, spawn.z, 4.6, 4.6, .105, .02);
  }
  // Rocky campsite, berry garden, and an open north meadow give route landmarks.
  surface('#b0b59b', -13, 12, 13, 16);
  surface('#a6b785', 38, -12, 14, 16);
  surface('#9db88c', -13, -40, 18, 12);
  for (let x = 33; x < 44; x += 3) box('#819c6b', x, -12, 1.1, 14, .055, .03);
  for (const [x, z] of [[-39, 8], [13, 39], [38, 11]]) {
    box('#a9b89c', x, z, 9.8, 8.8, .05, .03);
    box('#82b6b4', x, z, 7.5, 6.5, .07, .025);
  }
}

function create(seed) {
  const layout = createLayout(BOUNDS, seed, SPAWNS);
  const { scatter, integer } = layout;
  drawForest(layout);
  layout.starters(['mushroom', 'stone', 'bush'], ['log', 'log']);
  const ponds = [[-39, 8], [13, 39], [38, 11]];
  const onLand = (x, z, radius) => (Math.abs(x - streamX(z)) > 4.5 + radius || nearLine(z, [-25, 0, 25], 1.7)) && ponds.every(([px, pz]) => Math.abs(x - px) > 4.8 + radius || Math.abs(z - pz) > 4.3 + radius);
  const offTrail = (x, z, radius) => onLand(x, z, radius) && !nearLine(x, [-25, 25], radius + 2.5) && !nearLine(z, [-25, 0, 25], radius + 2.5);
  scatter(integer(12, 17), ['cabin'], { valid: offTrail });
  scatter(integer(12, 17), ['ancientTree'], { valid: offTrail });
  scatter(integer(36, 48), ['boulder'], { valid: onLand });
  scatter(integer(172, 198), ['tree', 'pine', 'pine', 'log'], { valid: onLand, colors: { tree: ['#78a989', '#a0b36e'], pine: ['#568a71', '#6e9d89'] } });
  scatter(integer(288, 328), ['mushroom', 'mushroom', 'bush', 'stone'], { valid: onLand });
  layout.fillGaps(['mushroom', 'bush', 'stone'], onLand);
  return { placements: layout.placements, surfaces: layout.surfaces };
}

export const forestMap = {
  id: 'forest', name: '秘境森林', description: '沿溪流穿过蘑菇林、营地和古树，找寻林间宝藏', bounds: BOUNDS,
  spawns: SPAWNS, sky: '#d9e8de', cameraOffset: [32, 44, 38],
  create,
};
