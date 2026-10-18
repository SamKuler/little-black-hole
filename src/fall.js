const GRAVITY = 22;
const RELEASE_DELAY = .1;
export function fallDuration(item) { return RELEASE_DELAY + Math.sqrt(2 * (item.height + item.radius) / GRAVITY); }

export function fallPose(item, claim, elapsed, owner, reduceMotion = false) {
  const age = Math.max(0, elapsed - claim.at);
  const u = Math.min(1, age / .28), pull = u * u * (3 - 2 * u);
  const dx = item.x - claim.x, dz = item.z - claim.z, length = Math.hypot(dx, dz) || 1;
  const angle = reduceMotion ? 0 : Math.min(.3, Math.hypot(dx, dz) * .12 + .08) * pull;
  return {
    x: owner.x + dx * (1 - pull), z: owner.z + dz * (1 - pull),
    y: -.5 * GRAVITY * Math.max(0, age - RELEASE_DELAY) ** 2,
    rx: -dz / length * angle, rz: dx / length * angle,
  };
}
