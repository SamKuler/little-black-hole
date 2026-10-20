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
  const box = (color, x, z, width, depth, y = .025, height = .04, emission = 0) => {
    const relief = y >= 0 ? 1 / 3 : 1;
    surfaces.push({ color, position: [x, y * relief, z], size: [width, height * relief, depth], emission });
  };
  // Overlays need a distinct height from their district base to avoid depth ties.
  const surface = (color, x, z, width, depth, y = .025) => box(color, x, z, width, depth, y);
  const polygon = (color, points, y = .025) => {
    const xs = points.map(point => point[0]), zs = points.map(point => point[1]);
    const width = Math.max(...xs) - Math.min(...xs), depth = Math.max(...zs) - Math.min(...zs);
    const x = (Math.min(...xs) + Math.max(...xs)) / 2, z = (Math.min(...zs) + Math.max(...zs)) / 2;
    surfaces.push({ color, position: [x, y, z], size: [width, .001, depth], points: points.map(([px, pz]) => [(px - x) / width, (pz - z) / depth]) });
  };
  const path = (color, points, width, y = .025) => {
    const left = [], right = [];
    points.forEach(([x, z], i) => {
      const previous = points[Math.max(0, i - 1)], next = points[Math.min(points.length - 1, i + 1)];
      const dx = next[0] - previous[0], dz = next[1] - previous[1], length = Math.hypot(dx, dz);
      left.push([x - dz / length * width / 2, z + dx / length * width / 2]);
      right.push([x + dz / length * width / 2, z - dx / length * width / 2]);
    });
    polygon(color, [...left, ...right.reverse()], y);
  };
  const clearing = (color, x, z, width, depth, y = .025) => polygon(color, Array.from({ length: 14 }, (_, i) => {
    const angle = i / 14 * Math.PI * 2, edge = 1 + .08 * Math.sin(i * 2.4);
    return [x + Math.cos(angle) * width / 2 * edge, z + Math.sin(angle) * depth / 2 * edge];
  }), y);
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
  return { random, range, integer, pick, placements, surfaces, box, surface, polygon, path, clearing, add, scatter, starters, fillGaps };
}

export function nearLine(value, lines, distance) { return lines.some(line => Math.abs(value - line) < distance); }

export function nearPath(x, z, points, distance) {
  return points.slice(1).some(([bx, bz], i) => {
    const [ax, az] = points[i], dx = bx - ax, dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    return Math.hypot(x - ax - t * dx, z - az - t * dz) < distance;
  });
}
