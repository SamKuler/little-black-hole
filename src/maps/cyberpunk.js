import { createLayout, nearLine } from './layout.js';

const BOUNDS = 54;
const SPAWNS = [{ x: -22, z: -22 }, { x: 22, z: 22 }, { x: 22, z: -22 }, { x: -22, z: 22 }];
const ROADS = [-22, 0, 22];

function drawCity({ box }) {
  box('#171a31', 0, 0, 110, 110, -1.1, 2);
  box('#283149', 0, 0, 110, 110, -.12, .22);
  // Four neon districts: violet night market, cyan tech blocks, plum arcade, blue docks.
  for (const [x, z, color] of [[-25, -25, '#392e51'], [25, -25, '#263f50'], [-25, 25, '#432f4c'], [25, 25, '#29384e']]) box(color, x, z, 46, 46, .025, .04);
  for (const a of ROADS) {
    box('#465168', a, 0, 8, 102, .05, .05); box('#19243a', a, 0, 5.6, 102, .085, .025);
    box('#465168', 0, a, 102, 8, .052, .05); box('#19243a', 0, a, 102, 5.6, .087, .025);
    for (const side of [-1, 1]) {
      box('#55cbd1', a + side * 3.8, 0, .13, 102, .09, .035);
      box('#cc72b5', 0, a + side * 3.8, 102, .13, .092, .035);
    }
    for (let b = -48; b <= 48; b += 4) if (!nearLine(b, ROADS, 5)) {
      box('#6a88ae', a, b, .18, 1.8, .11, .015); box('#6a88ae', b, a, 1.8, .18, .112, .015);
    }
  }
  // Paired freight rails and glowing power conduits mark the eastern district.
  box('#202b3c', 40, 0, 9, 101, .05, .04);
  for (const x of [37, 38, 42, 43]) box('#85a3ad', x, 0, .17, 101, .09, .03);
  for (let z = -48; z <= 48; z += 2.7) box('#485f72', 40, z, 7, .26, .085, .02);
  for (const z of [-22, 0, 22]) box('#535069', 40, z, 10, 5.7, .12, .045);
  // A central digital plaza, arcade floor and loading-yard markings are recognizable landmarks.
  for (const [x, z, color] of [[-11, -11, '#664262'], [11, 11, '#306575'], [-11, 11, '#4d436a'], [11, -11, '#37546b']]) {
    box(color, x, z, 13, 13, .055, .045);
    for (let offset = -5; offset <= 5; offset += 2.5) box('#758098', x + offset, z, .06, 13, .084, .015);
  }
  for (const spawn of SPAWNS) {
    box('#52607b', spawn.x, spawn.z, 5, 5, .13, .035);
    box('#78d4d5', spawn.x, spawn.z, 3.1, 3.1, .155, .02);
    box('#29384d', spawn.x, spawn.z, 2.6, 2.6, .17, .02);
  }
  for (const z of [-39, -34, 34, 39]) for (const x of [9, 14, 28, 33]) {
    box('#dbad79', x, z, 3.5, .14, .09, .02); box('#dbad79', x - 1.7, z + 1.6, .14, 3.2, .09, .02);
  }
}

function create(seed) {
  const layout = createLayout(BOUNDS, seed, SPAWNS);
  const { scatter, integer, range } = layout;
  drawCity(layout);
  layout.starters(['neonCrate', 'neonCrate', 'stone'], ['terminal', 'terminal']);
  const offRoad = (x, z, radius) => !nearLine(x, ROADS, radius + 4.1) && !nearLine(z, ROADS, radius + 4.1) && Math.abs(x - 40) > radius + 4.6;
  scatter(integer(36, 44), ['cyberShop', 'cyberShop', 'cyberTower'], { valid: offRoad, colors: { cyberShop: ['#3d4d67', '#584363'], cyberTower: ['#394a64', '#504369'] } });
  scatter(integer(40, 48), ['hovercar'], {
    colors: { hovercar: ['#62c5cf', '#d986bd', '#ae9bdd'] },
    position: () => { const road = layout.pick(ROADS), at = range(-44, 44); return layout.random() < .5 ? { x: road + 1.5, z: at } : { x: at, z: road + 1.5 }; },
  });
  scatter(integer(130, 154), ['terminal', 'neonSign', 'neonSign'], {});
  scatter(integer(210, 242), ['neonCrate', 'neonCrate', 'stone'], {});
  layout.fillGaps(['neonCrate', 'stone']);
  return { placements: layout.placements, surfaces: layout.surfaces };
}

export const cyberpunkMap = {
  id: 'cyberpunk', name: '霓虹都市', description: '穿梭夜市与能量街区，把霓虹招牌和摩天楼收入囊中', bounds: BOUNDS,
  spawns: SPAWNS, sky: '#28334f', cameraOffset: [32, 44, 38],
  lighting: { skyLight: '#acb6ff', groundLight: '#54708f', ambientIntensity: 2.1, sunColor: '#c5d5ff', sunIntensity: 1.8, exposure: 1.08 },
  create,
};
