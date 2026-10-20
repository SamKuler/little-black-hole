import { createLayout, nearLine } from './layout.js';

const BOUNDS = 56;
const SPAWNS = [{ x: -24, z: -24 }, { x: 24, z: 24 }, { x: 24, z: -24 }, { x: -24, z: 24 }];
const ROADS = [-24, 0, 24];

function drawTown(layout) {
  const { box, surface } = layout;
  box('#b7cbbf', 0, 0, 114, 114, -1.1, 2);
  box('#a9c5a5', 0, 0, 114, 114, -.12, .22);
  // Four districts have different paving, planting, and a readable central boulevard.
  surface('#b8cca3', -26, -26, 44, 44);
  surface('#d1c6ae', 26, -26, 44, 44);
  surface('#a4c6b0', -26, 26, 44, 44);
  surface('#bac9c4', 26, 26, 44, 44);
  for (const a of ROADS) {
    box('#e6e2cf', a, 0, 8, 104, .055, .06); box('#929fa1', a, 0, 5.8, 104, .09, .02);
    box('#e6e2cf', 0, a, 104, 8, .057, .06); box('#929fa1', 0, a, 104, 5.8, .092, .02);
    for (let b = -49; b <= 49; b += 3.5) if (!nearLine(b, ROADS, 4.6)) {
      box('#e4e7d9', a, b, .13, 1.25, .11, .012); box('#e4e7d9', b, a, 1.25, .13, .112, .012);
    }
  }
  for (const x of ROADS) for (const z of ROADS) for (let k = -2; k <= 2; k++) {
    box('#f1eee1', x + k * .8, z + 3.4, .4, 1.3, .13, .012);
    box('#f1eee1', x + 3.4, z + k * .8, 1.3, .4, .132, .012);
  }
  // A long east-side canal and three timber bridges break up the street grid.
  box('#d6cbb1', 41, 0, 9, 106, .04, .04);
  box('#72a7ae', 41, 0, 6.2, 106, .065, .03);
  for (const z of [-24, 0, 24]) {
    box('#d3b58b', 41, z, 10, 6.1, .14, .08);
    for (let x = 37; x <= 45; x += 1) box('#b29273', x, z, .07, 6.1, .19, .015);
  }
  // Destination paving sits above district paving, below its decorative markings.
  surface('#8eb79b', -12, 12, 15, 15, .045);
  box('#d9d8bb', -12, 12, 6.4, 8.4, .06, .05);
  box('#78acb4', -12, 12, 4.8, 6.8, .09, .03);
  surface('#c4bc9e', -37, -35, 16, 18, .045);
  for (let x = -43; x <= -31; x += 4) box('#91b58b', x, -35, 2.3, 17, .055, .035);
  surface('#e1c7a9', 12, -12, 16, 15, .045);
  for (let x = 7; x <= 17; x += 2.5) box('#c9b497', x, -12, .07, 15, .06, .02);
  surface('#d4d9ce', 12, 12, 16, 15, .045);
  for (const spawn of SPAWNS) {
    box('#d9dfcb', spawn.x, spawn.z, 4.5, 4.5, .145, .035);
    box('#ece6d3', spawn.x, spawn.z, 2.6, 2.6, .17, .025);
  }
}

function create(seed) {
  const layout = createLayout(BOUNDS, seed, SPAWNS);
  const { add, scatter, integer, range } = layout;
  drawTown(layout);
  layout.starters(['stone', 'bush', 'cone'], ['bench', 'lamp']);
  const onLand = (x, z, radius) => (Math.abs(x - 41) > 3.7 + radius || nearLine(z, ROADS, 2)) && !(Math.abs(x + 12) < 3.5 + radius && Math.abs(z - 12) < 4.5 + radius);
  const offRoad = (x, z, radius) => !nearLine(x, ROADS, radius + 3.7) && !nearLine(z, ROADS, radius + 3.7) && onLand(x, z, radius);
  // Some district anchors are regular; smaller streets and lots fill differently every seed.
  for (const [x, z, type] of [[-12, -12, 'house'], [12, -12, 'shop'], [12, 12, 'tower'], [-36, 12, 'house'], [12, 36, 'tower'], [-12, -38, 'shop']]) add(type, x, z);
  scatter(integer(36, 44), ['house', 'house', 'shop', 'tower'], {
    valid: offRoad,
    colors: { house: ['#e4c8a6', '#c5d7cb', '#e1c3b7'], shop: ['#dcae9e', '#e4d7ae'], tower: ['#b8cdd8', '#c8c1d6'] },
  });
  scatter(integer(38, 48), ['car'], {
    valid: onLand, colors: { car: ['#e5b878', '#acc9c4', '#c07f7d'] },
    position: () => { const road = layout.pick(ROADS), at = range(-46, 46); return layout.random() < .5 ? { x: road + 1.6, z: at } : { x: at, z: road + 1.6 }; },
  });
  scatter(integer(102, 124), ['tree', 'tree', 'pine', 'bench', 'lamp'], { valid: onLand });
  scatter(integer(230, 270), ['stone', 'bush', 'bush', 'cone'], { valid: onLand });
  layout.fillGaps(['stone', 'bush', 'cone'], onLand);
  return { placements: layout.placements, surfaces: layout.surfaces };
}

export const townMap = {
  id: 'town', name: '悠闲小镇', bounds: BOUNDS, theme: 'light', preview: '/maps/town.jpg',
  spawns: SPAWNS, sky: '#e4edf0', cameraOffset: [32, 44, 38],
  fog: [82, 160],
  lighting: { ambientIntensity: 2.1, sunIntensity: 2.8, exposure: 1.08 },
  create,
};
