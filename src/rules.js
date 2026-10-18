export const START_RADIUS = 1.2;
export const LEVELS = [
  { radius: 1.2, name: '小小胃口' },
  { radius: 1.8, name: '有点能吃' },
  { radius: 2.8, name: '清道夫' },
  { radius: 4.2, name: '大胃王' },
  { radius: 5.8, name: '世界收藏家' },
];
export function radiusForMass(mass) { return Math.sqrt(START_RADIUS ** 2 + mass * 0.035); }
export function levelForRadius(radius) { return LEVELS.findLastIndex(level => radius >= level.radius); }
export function fitsHole(radius, item) { return item.radius <= radius * .88; }
export function canSwallow(hole, item) {
  return fitsHole(hole.radius, item) && Math.hypot(item.x - hole.x, item.z - hole.z) + item.radius <= hole.radius * .98;
}
export function clampPosition(value, radius, bounds) { return Math.max(-bounds + radius, Math.min(bounds - radius, value)); }
