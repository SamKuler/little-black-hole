function createPlacements(seed) {
  const items = [];
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const add = (type, x, z, color) => items.push({ type, x, z, ...(color ? { color } : {}) });
  const colors = ['#e4c8a6', '#c8c1d6', '#c5d7cb', '#dcae9e', '#b8cdd8', '#e4d7ae'];
  const blocks = [-23, -7.5, 7.5, 23];
  let count = 0;
  for (const x of blocks) for (const z of blocks) {
    if (x === 7.5 && z === 7.5) continue;
    const type = Math.abs(x) === 23 && count % 2 === 0 ? 'tower' : count % 3 === 0 ? 'shop' : 'house';
    add(type, x, z, colors[count++ % colors.length]);
    if (type !== 'tower') add('house', x + (x > 0 ? 3.7 : -3.7), z + (z > 0 ? 2 : -2), colors[count % colors.length]);
  }
  for (let i = 0; i < 48; i++) {
    const x = blocks[i % 4] + (i % 2 ? 4.8 : -4.8);
    const z = blocks[Math.floor(i / 4) % 4] + ((i * 3) % 5 - 2) * 2;
    if (Math.abs(x) < 29.5 && Math.abs(z) < 29.5) add(i % 3 ? 'tree' : 'pine', x, z);
  }
  for (let i = 0; i < 20; i++) {
    const road = [-15, 0, 15][i % 3], at = -26 + Math.floor(i / 3) * 8;
    add('car', i % 2 ? road + 1.6 : at, i % 2 ? at : road + 1.6, ['#e5b878', '#c07f7d', '#acc9c4', '#d1cee1', '#e6ddc2'][i % 5]);
  }
  for (let i = 0; i < 100; i++) {
    let x, z;
    if (i < 28) {
      const angle = i * 2.39996, r = 2.2 + Math.sqrt(i / 28) * 8.5;
      x = 7.5 + Math.cos(angle) * r; z = 7.5 + Math.sin(angle) * r;
    } else {
      const road = [-15, 0, 15][i % 3], at = random() * 56 - 28;
      x = i % 2 ? road + (i % 4 < 2 ? 3.2 : -3.2) : at;
      z = i % 2 ? at : road + (i % 4 < 2 ? 3.2 : -3.2);
    }
    add(i % 4 === 0 ? 'cone' : i % 3 === 0 ? 'bush' : 'stone', x, z);
  }
  for (let i = 0; i < 18; i++) {
    const road = [-15, 0, 15][i % 3], at = -25 + Math.floor(i / 3) * 10;
    add(i % 2 ? 'lamp' : 'bench', road + 3.6, at);
  }
  return items;
}

function createSurfaces() {
  const surfaces = [];
  const box = (color, x, y, z, width, height, depth) => surfaces.push({ color, position: [x, y, z], size: [width, height, depth] });
  box('#c3d4d2', 0, -1.1, 0, 82, 2, 82);
  box('#a9c5b7', 0, -.12, 0, 82, .22, 82);
  for (const x of [-15, 0, 15]) {
    box('#e0e4d9', x, -.005, 0, 7.4, .06, 64); box('#9baeb4', x, .03, 0, 5.8, .02, 64);
  }
  for (const z of [-15, 0, 15]) {
    box('#e0e4d9', 0, 0, z, 64, .06, 7.4); box('#9baeb4', 0, .032, z, 64, .02, 5.8);
  }
  for (const a of [-15, 0, 15]) for (let b = -29; b <= 29; b += 3) {
    if ([-15, 0, 15].every(c => Math.abs(b - c) > 4)) {
      box('#dce1d4', a, .055, b, .11, .012, 1.1); box('#dce1d4', b, .057, a, 1.1, .012, .11);
    }
  }
  for (const x of [-15, 0, 15]) for (const z of [-15, 0, 15]) for (let k = -2; k <= 2; k++) {
    box('#eef0e5', x + k * .7, .065, z + 3.1, .35, .012, 1.2); box('#eef0e5', x + 3.1, .066, z + k * .7, 1.2, .012, .35);
  }
  box('#d9dfd1', 7.4, .03, 7.4, 7.4, .07, 7.4);
  for (let x = 4.5; x <= 10.5; x += 1.5) for (let z = 4.5; z <= 10.5; z += 1.5) box('#c7d0c4', x, .071, z, .025, .012, 1.45);
  return surfaces;
}

export const townMap = {
  id: 'town', name: '悠闲小镇', bounds: 40,
  spawns: [{ x: 5, z: 5 }, { x: 10, z: 5 }, { x: 5, z: 10 }, { x: 10, z: 10 }],
  sky: '#e4edf0', cameraOffset: [32, 44, 38],
  create(seed) { return { placements: createPlacements(seed), surfaces: createSurfaces() }; },
};
