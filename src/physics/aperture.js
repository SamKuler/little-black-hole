const EPSILON = 1e-10;

const cross = (a, b, c) => (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
const distanceSquared = (a, b) => (a.x - b.x) ** 2 + (a.z - b.z) ** 2;

function projectedHull(points) {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.z - b.z);
  const unique = sorted.filter((point, i) => !i || distanceSquared(point, sorted[i - 1]) > EPSILON ** 2);
  if (unique.length < 3) return unique;
  const half = points => {
    const result = [];
    for (const point of points) {
      while (result.length > 1 && cross(result.at(-2), result.at(-1), point) <= EPSILON) result.pop();
      result.push(point);
    }
    result.pop();
    return result;
  };
  return [...half(unique), ...half([...unique].reverse())];
}

function coveredSegment(a, b, circles) {
  const dx = b.x - a.x, dz = b.z - a.z, lengthSquared = dx * dx + dz * dz;
  const intervals = [];
  for (const circle of circles) {
    const x = a.x - circle.x, z = a.z - circle.z;
    const projection = -(x * dx + z * dz) / lengthSquared;
    const discriminant = circle.radius ** 2 - (x * x + z * z - projection ** 2 * lengthSquared);
    if (discriminant < 0) continue;
    const span = Math.sqrt(discriminant / lengthSquared);
    const from = Math.max(0, projection - span), to = Math.min(1, projection + span);
    if (to >= from) intervals.push([from, to]);
  }
  intervals.sort((a, b) => a[0] - b[0]);
  let covered = 0;
  for (const [from, to] of intervals) {
    if (from > covered + EPSILON) return false;
    covered = Math.max(covered, to);
    if (covered >= 1 - EPSILON) return true;
  }
  return false;
}

function circleIntersections(a, b) {
  const dx = b.x - a.x, dz = b.z - a.z, distance = Math.hypot(dx, dz);
  if (distance < EPSILON || distance > a.radius + b.radius + EPSILON || distance < Math.abs(a.radius - b.radius) - EPSILON) return [];
  const along = (a.radius ** 2 - b.radius ** 2 + distance ** 2) / (2 * distance);
  const heightSquared = a.radius ** 2 - along ** 2;
  if (heightSquared < -EPSILON) return [];
  const height = Math.sqrt(Math.max(0, heightSquared));
  const x = a.x + dx * along / distance, z = a.z + dz * along / distance;
  return [-1, 1].map(sign => ({ x: x - sign * dz * height / distance, z: z + sign * dx * height / distance }));
}

/** Exact vertices of exposed disk-union boundaries, including solid islands. */
export function exposedOpeningIntersections(circles) {
  const result = [];
  for (let i = 0; i < circles.length; i++) for (let j = i + 1; j < circles.length; j++) {
    for (const point of circleIntersections(circles[i], circles[j])) {
      if (circles.some((circle, k) => k !== i && k !== j && distanceSquared(point, circle) < circle.radius ** 2 - EPSILON)) continue;
      if (!result.some(other => distanceSquared(point, other) <= EPSILON ** 2)) result.push(point);
    }
  }
  return result;
}

/** Whether a convex slab section is completely covered by circular openings. */
export function sectionInOpenings(points, holes, margin = 0) {
  if (!points.length || !holes.length) return false;
  const circles = holes.map(hole => ({ x: hole.x, z: hole.z, radius: hole.radius - margin })).filter(circle => circle.radius > 0);
  // A disk is convex, so this common case needs neither a hull nor topology.
  if (circles.some(circle => points.every(point => distanceSquared(point, circle) < circle.radius ** 2))) return true;
  const hull = projectedHull(points);
  if (hull.length === 1) return circles.some(circle => distanceSquared(hull[0], circle) <= circle.radius ** 2);
  if (hull.length === 2) return coveredSegment(hull[0], hull[1], circles);
  if (!hull.every((point, i) => coveredSegment(point, hull[(i + 1) % hull.length], circles))) return false;

  // Covered polygon edges alone can surround a solid island. Every bounded
  // uncovered component of a finite disk union has an exposed circle-circle
  // vertex. Include polygon-boundary vertices: three inner intersections can
  // themselves form a triangle with covered edges but an uncovered center.
  return !exposedOpeningIntersections(circles).some(point => hull.every((vertex, k) => cross(vertex, hull[(k + 1) % hull.length], point) >= -EPSILON));
}
