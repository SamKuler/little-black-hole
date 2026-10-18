import { ITEM_CATALOG } from '../items/catalog.js';

// All layout choices consume only this seeded generator, never wall-clock time.
export function seededRandom(seed) {
  let state = seed >>> 0;
  return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
}

export function createLayout(bounds, seed, spawns) {
  const random = seededRandom(seed), placements = [], surfaces = [];
  const range = (min, max) => min + random() * (max - min);
  const integer = (min, max) => Math.floor(range(min, max + 1));
  const pick = values => values[integer(0, values.length - 1)];
  // Decorative layers use shallow relief so roads and bridges never cover the hole.
  const box = (color, x, z, width, depth, y = .025, height = .04) => {
    const relief = y >= 0 ? 1 / 3 : 1;
    surfaces.push({ color, position: [x, y * relief, z], size: [width, height * relief, depth] });
  };
  const surface = (color, x, z, width, depth) => box(color, x, z, width, depth);
  const add = (type, x, z, options = {}) => {
    const radius = ITEM_CATALOG[type].radius;
    // The inset leaves every corner collectible even if its object is saved for last.
    if (Math.max(Math.abs(x), Math.abs(z)) + radius > bounds - 7) return false;
    if (spawns.some(spawn => Math.hypot(x - spawn.x, z - spawn.z) < radius + 1.65)) return false;
    if (placements.some(item => Math.hypot(item.x - x, item.z - z) < ITEM_CATALOG[item.type].radius + radius + .18)) return false;
    placements.push({ type, x: +x.toFixed(3), z: +z.toFixed(3), ...options });
    return true;
  };
  const scatter = (count, types, { area = bounds - 9, valid = () => true, colors, position } = {}) => {
    let placed = 0;
    for (let attempt = 0; placed < count && attempt < count * 1000; attempt++) {
      const type = pick(types);
      const point = position ? position(random, range) : { x: range(-area, area), z: range(-area, area) };
      const radius = ITEM_CATALOG[type].radius;
      if (spawns.some(spawn => Math.hypot(point.x - spawn.x, point.z - spawn.z) < 11.2 + radius)) continue;
      if (!valid(point.x, point.z, radius)) continue;
      const color = colors?.[type] ? pick(colors[type]) : undefined;
      const rotation = ['house', 'shop', 'tower', 'cabin', 'cyberShop', 'cyberTower'].includes(type)
        ? integer(0, 3) * Math.PI / 2 : type === 'car' || type === 'hovercar' ? (random() < .5 ? 0 : Math.PI / 2) : undefined;
      if (add(type, point.x, point.z, { ...(color ? { color } : {}), ...(rotation === undefined ? {} : { rotation }) })) placed++;
    }
    if (placed !== count) throw new Error(`地图空间不足：${types.join('/')}，${placed}/${count}`);
  };
  const fillGaps = (types, valid = () => true) => {
    // Keep every 16-unit neighborhood active, including outer districts.
    for (let x = -40; x <= 40; x += 16) for (let z = -40; z <= 40; z += 16) {
      const present = placements.filter(item => Math.abs(item.x - x) < 8 && Math.abs(item.z - z) < 8).length;
      if (present < 6) scatter(6 - present, types, { valid, position: () => ({ x: range(x - 7.9, x + 7.9), z: range(z - 7.9, z + 7.9) }) });
    }
  };
  const starters = (smallTypes, mediumTypes) => {
    // Identical mass and spacing in each private pocket; visual choices may differ.
    // 24 small objects and 6 medium objects bridge every player into the tree tier.
    for (const spawn of spawns) {
      for (let ring = 0; ring < 3; ring++) for (let i = 0; i < 8; i++) {
        const angle = i * Math.PI / 4 + ring * Math.PI / 8;
        const radius = 2.7 + ring * 2.35;
        if (!add(smallTypes[(i + ring) % smallTypes.length], spawn.x + Math.cos(angle) * radius, spawn.z + Math.sin(angle) * radius)) throw new Error('出生点小物品布局冲突');
      }
      for (let i = 0; i < 6; i++) {
        const angle = i * Math.PI / 3 + Math.PI / 12;
        if (!add(mediumTypes[i % mediumTypes.length], spawn.x + Math.cos(angle) * 9.6, spawn.z + Math.sin(angle) * 9.6)) throw new Error('出生点成长物品布局冲突');
      }
    }
  };
  return { random, range, integer, pick, placements, surfaces, box, surface, add, scatter, starters, fillGaps };
}

export function nearLine(value, lines, distance) { return lines.some(line => Math.abs(value - line) < distance); }
