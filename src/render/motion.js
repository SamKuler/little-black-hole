import { clampPosition } from '../rules.js';

export function predictPosition(player, age, bounds) {
  const dt = Math.max(0, Math.min(age, .15));
  return { x: clampPosition(player.x + player.vx * dt, player.radius, bounds), z: clampPosition(player.z + player.vz * dt, player.radius, bounds) };
}
