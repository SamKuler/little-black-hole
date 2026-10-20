import { createLayout, nearLine } from './layout.js';

const BOUNDS = 54;
const SPAWNS = [{ x: -22, z: -22 }, { x: 22, z: 22 }, { x: 22, z: -22 }, { x: -22, z: 22 }];
const ROADS = [-22, 0, 22];

function drawCity({ box, surface }) {
  box('#162137', 0, 0, 110, 110, -1.1, 2);
  box('#26364c', 0, 0, 110, 110, -.12, .22);
  for (const [x, z, color] of [[-25, -25, '#34405a'], [25, -25, '#2d4854'], [-25, 25, '#3c3e57'], [25, 25, '#2e4056']]) surface(color, x, z, 46, 46);
  for (const a of ROADS) {
    box('#536278', a, 0, 8, 102, .05, .05); box('#1c2a40', a, 0, 5.6, 102, .085, .025);
    box('#536278', 0, a, 102, 8, .052, .05); box('#1c2a40', 0, a, 102, 5.6, .087, .025);
    for (let b = -48; b <= 48; b += 4) if (!nearLine(b, ROADS, 5)) {
      box('#7e91a9', a, b, .18, 1.8, .11, .015); box('#7e91a9', b, a, 1.8, .18, .112, .015);
    }
  }
  // Light is concentrated around the market, with quiet roads between districts.
  for (const side of [-1, 1]) {
    box('#72d3d4', side * 3.8, -11, .1, 20, .09, .025, .7);
    box('#d894bc', 11, side * 3.8, 20, .1, .092, .025, .7);
  }
  box('#2c394a', 40, 0, 9, 101, .05, .04);
  for (const x of [38, 42]) box('#748a9c', x, 0, .17, 101, .09, .03);
  for (let z = -48; z <= 48; z += 3.5) box('#4c5d70', 40, z, 6, .2, .085, .02);
  for (const z of ROADS) box('#526077', 40, z, 10, 5.7, .12, .045);
  // Market paving must not share the underlying districts' top-face height.
  surface('#51506c', -11, -11, 14, 14, .045);
  surface('#3b6970', 11, 11, 14, 14, .045);
  for (const [x, z, color] of [[-11, -11, '#d894bc'], [11, 11, '#72d3d4']]) {
    for (const side of [-1, 1]) box(color, x + side * 6.8, z, .12, 13, .11, .02, .7);
    for (let offset = -5; offset <= 5; offset += 2.5) box('#68788e', x + offset, z, .06, 13, .084, .015);
  }
  for (const spawn of SPAWNS) {
    box('#52667e', spawn.x, spawn.z, 4.8, 4.8, .13, .035);
    box('#79a6b2', spawn.x, spawn.z, 3, 3, .155, .02);
    box('#293b51', spawn.x, spawn.z, 2.6, 2.6, .17, .02);
  }
  for (const z of [-39, -34, 34, 39]) for (const x of [9, 14, 28, 33]) {
    box('#bdac85', x, z, 3.5, .14, .09, .02); box('#bdac85', x - 1.7, z + 1.6, .14, 3.2, .09, .02);
  }
}

function create(seed) {
  const layout = createLayout(BOUNDS, seed, SPAWNS);
  const { scatter, integer, range } = layout;
  drawCity(layout);
  layout.starters(['neonCrate', 'neonCrate', 'stone'], ['terminal', 'terminal']);
  const offRoad = (x, z, radius) => !nearLine(x, ROADS, radius + 4.1) && !nearLine(z, ROADS, radius + 4.1) && Math.abs(x - 40) > radius + 4.6;
  scatter(integer(8, 12), ['cyberTower'], { valid: (x, z, radius) => offRoad(x, z, radius) && (Math.max(Math.abs(x), Math.abs(z)) > 26 || layout.random() < .2), colors: { cyberTower: ['#41536c', '#505571'] } });
  scatter(integer(24, 28), ['cyberShop'], { valid: (x, z, radius) => offRoad(x, z, radius) && (Math.max(Math.abs(x), Math.abs(z)) < 32 || layout.random() < .2), colors: { cyberShop: ['#576078', '#70576b'] } });
  scatter(integer(40, 48), ['hovercar'], {
    colors: { hovercar: ['#72b7c1', '#b28aa9', '#a89ac7'] },
    position: () => { const road = layout.pick(ROADS), at = range(-44, 44); return layout.random() < .5 ? { x: road + 1.5, z: at } : { x: at, z: road + 1.5 }; },
  });
  scatter(integer(34, 42), ['neonSign'], { valid: (x, z) => Math.max(Math.abs(x), Math.abs(z)) < 31 });
  scatter(integer(96, 112), ['terminal', 'terminal', 'neonCrate'], { valid: (x, z) => nearLine(x, ROADS, 6) || nearLine(z, ROADS, 6) });
  scatter(integer(210, 242), ['neonCrate', 'neonCrate', 'stone'], {});
  layout.fillGaps(['neonCrate', 'stone']);
  return { placements: layout.placements, surfaces: layout.surfaces };
}

export const cyberpunkMap = {
  id: 'cyberpunk', name: '霓虹都市', bounds: BOUNDS, theme: 'dark', preview: '/maps/cyberpunk.jpg',
  spawns: SPAWNS, sky: '#18263d', cameraOffset: [32, 44, 38], fog: [90, 170],
  lighting: { skyLight: '#c0d9ed', groundLight: '#718299', ambientIntensity: 1.7, sunColor: '#c9dff7', sunIntensity: 2, exposure: 1.04 },
  create,
};
