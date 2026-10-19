const clamp = value => Math.max(0, Math.min(1, value));

export function restingPose(item) {
  const angle = (item.rotation ?? 0) / 2;
  return { x: item.x, y: 0, z: item.z, q: [0, Math.sin(angle), 0, Math.cos(angle)] };
}

// Render between two authoritative poses; never invent a pull toward the
// owner, an angular force, a scale change, or a client-side completion time.
export function interpolatePose(item, previous, current, fraction) {
  const a = previous?.pose ?? restingPose(item), b = current?.pose ?? a;
  const t = clamp(fraction);
  const sign = a.q.reduce((dot, value, i) => dot + value * b.q[i], 0) < 0 ? -1 : 1;
  const q = a.q.map((value, i) => value + (sign * b.q[i] - value) * t);
  const length = Math.hypot(...q) || 1;
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t, q: q.map(value => value / length) };
}

export function interpolateHole(previous, current, fraction) {
  const a = previous ?? current, t = clamp(fraction);
  return { x: a.x + (current.x - a.x) * t, z: a.z + (current.z - a.z) * t, radius: a.radius + (current.radius - a.radius) * t };
}
