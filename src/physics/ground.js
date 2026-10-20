import { ContactEquation, Vec3 } from 'cannon-es';
import { getConvexHull } from './shapes.js';
import { coupleContactFriction } from './solver.js';
import { exposedOpeningIntersections, sectionInOpenings } from './aperture.js';

// A finite slab matters: once a prop clears its underside, a moving mouth
// cannot tow it around underground. The decorative terrain layers are flat.
export const GROUND_THICKNESS = .25;
const SKIN = .004;

export function inOpening(x, z, holes, margin = 0) {
  return holes.some(hole => (x - hole.x) ** 2 + (z - hole.z) ** 2 < (hole.radius - margin) ** 2);
}

function intersections(a, b, hole) {
  const dx = b.x - a.x, dz = b.z - a.z, x = a.x - hole.x, z = a.z - hole.z;
  const aa = dx * dx + dz * dz;
  if (aa < 1e-12) return [];
  const bb = 2 * (x * dx + z * dz), cc = x * x + z * z - hole.radius ** 2;
  const discriminant = bb * bb - 4 * aa * cc;
  if (discriminant < 0) return [];
  const root = Math.sqrt(discriminant);
  return [(-bb - root) / (2 * aa), (-bb + root) / (2 * aa)].filter(t => t > 0 && t < 1);
}

// Public pure manifold builder so circular aperture, rim, and bridging behavior
// are testable without a renderer. Contacts are on the actual convex proxy,
// not at an object's center. Edge/circle intersections retain rim supports.
export function groundContacts(vertices, edges, holes, faces = [], bodyMaxY) {
  const minY = Math.min(...vertices.map(point => point.y)), maxY = Math.max(...vertices.map(point => point.y));
  if (maxY < -GROUND_THICKNESS - SKIN || minY > SKIN) return [];
  const minX = Math.min(...vertices.map(point => point.x)), maxX = Math.max(...vertices.map(point => point.x));
  const minZ = Math.min(...vertices.map(point => point.z)), maxZ = Math.max(...vertices.map(point => point.z));
  // A remote mouth cannot affect this convex shape's support. This is
  // especially important for four-player maps with hundreds of props.
  holes = holes.filter(hole => Math.hypot(Math.max(minX - hole.x, 0, hole.x - maxX), Math.max(minZ - hole.z, 0, hole.z - maxZ)) <= hole.radius + GROUND_THICKNESS + SKIN);
  // A circle and this projected hull are convex. If one mouth contains every
  // vertex, it contains the whole part; no rim manifold needs to be built.
  if (holes.some(hole => vertices.every(point => inOpening(point.x, point.z, [hole], SKIN)))) return [];
  // Only the portion intersecting the finite slab can collide with terrain.
  // A tilted tower's buried base can project outside the circle while its
  // entire ground-level cross-section fits. Using the original bottom there
  // creates a phantom shelf several metres underneath an empty opening.
  if (holes.length && minY < -GROUND_THICKNESS) {
    const lower = -GROUND_THICKNESS - SKIN, upper = SKIN;
    const section = vertices.filter(point => point.y >= lower && point.y <= upper);
    for (const [i, j] of edges) {
      const a = vertices[i], b = vertices[j], dy = b.y - a.y;
      if (Math.abs(dy) < 1e-9) continue;
      for (const y of [lower, upper]) {
        const t = (y - a.y) / dy;
        if (t > 0 && t < 1) section.push(new Vec3(a.x + (b.x - a.x) * t, y, a.z + (b.z - a.z) * t));
      }
    }
    // The union test checks complete edges and possible enclosed solid
    // islands, not merely whether each vertex falls in some opening.
    if (sectionInOpenings(section, holes, SKIN)) return [];
  }
  // A compound body must escape on one side of the slab. Classifying wheels,
  // chassis and roof independently can pin them with opposing constraints.
  const submerged = (bodyMaxY ?? maxY) < -GROUND_THICKNESS / 2;
  const candidates = vertices.map(point => ({ point, rim: false }));
  const supportEdges = new Set();
  const exposedIntersections = holes.length > 1 ? exposedOpeningIntersections(holes) : [];
  for (const face of faces) {
    const a = vertices[face[0]], b = vertices[face[1]], c = vertices[face[2]];
    const normal = b.vsub(a).cross(c.vsub(a)); normal.normalize();
    if (submerged ? normal.y < .05 : normal.y > -.05) continue;
    const center = new Vec3();
    for (let i = 0; i < face.length; i++) {
      center.vadd(vertices[face[i]], center);
      const u = face[i], v = face[(i + 1) % face.length];
      supportEdges.add(u < v ? `${u}:${v}` : `${v}:${u}`);
    }
    center.scale(1 / face.length, center);
    candidates.push({ point: center });
    // Exposed rim points inside a large face preserve support even when the
    // union of several mouths covers every corner and perimeter edge.
    // With one convex circle, corners and edge intersections already bound
    // the supported portion. Exact exposed circle-circle vertices preserve
    // tiny solid islands that neither face centers nor angular samples hit.
    if (holes.length > 1) {
      const addRimPoint = (x, z) => {
        const y = a.y - (normal.x * (x - a.x) + normal.z * (z - a.z)) / normal.y;
        if (y > SKIN || inOpening(x, z, holes, SKIN)) return;
        const point = new Vec3(x, y, z);
        const inside = face.every((id, index) => {
          const start = vertices[id], end = vertices[face[(index + 1) % face.length]];
          return end.vsub(start).cross(point.vsub(start)).dot(normal) >= -1e-7;
        });
        if (inside) candidates.push({ point, rim: true });
      };
      for (const point of exposedIntersections) addRimPoint(point.x, point.z);
      for (const hole of holes) for (let i = 0; i < 24; i++) {
        const angle = i * Math.PI / 12;
        addRimPoint(hole.x + Math.cos(angle) * hole.radius, hole.z + Math.sin(angle) * hole.radius);
      }
    }
  }
  for (const [i, j] of edges) {
    const a = vertices[i], b = vertices[j], dy = b.y - a.y;
    const pointAt = t => new Vec3(a.x + (b.x - a.x) * t, a.y + dy * t, a.z + (b.z - a.z) * t);
    for (const hole of holes) for (const t of intersections(a, b, hole)) {
      const point = pointAt(t);
      // A boundary covered by another opening is not solid ground.
      const support = faces.length ? supportEdges.has(i < j ? `${i}:${j}` : `${j}:${i}`) : Math.abs(dy) < 1e-9;
      if (!inOpening(point.x, point.z, holes, SKIN)) candidates.push({ point, rim: support, side: !support, boundary: true });
    }
    if (Math.abs(dy) > 1e-9) for (const y of [-SKIN, -GROUND_THICKNESS / 2, -GROUND_THICKNESS + SKIN]) {
      const t = (y - a.y) / dy;
      if (t > 0 && t < 1) candidates.push({ point: pointAt(t), side: true });
    }
  }
  const contacts = [], used = new Set();
  for (const { point: p, rim, side, boundary } of candidates) {
    if (p.y > SKIN || (!rim && !boundary && inOpening(p.x, p.z, holes))) continue;
    let normal = new Vec3(0, 1, 0), depth = -p.y, wall;
    // The slab's underside pushes downward rather than teleporting a nearly
    // swallowed object back above ground when its opening moves away.
    if (submerged) {
      if (p.y < -GROUND_THICKNESS) continue;
      normal.y = -1; depth = p.y + GROUND_THICKNESS;
    }
    // At the top lip a lower edge can support weight. Below the lip, the
    // same circle intersection is a vertical wall, not an upward shelf.
    const lip = rim && p.y >= -SKIN;
    const wallOnly = side || (rim && !lip);
    if (!lip && p.y >= -GROUND_THICKNESS) for (const hole of holes) {
      const dx = hole.x - p.x, dz = hole.z - p.z, distance = Math.hypot(dx, dz);
      const radialDepth = distance - hole.radius;
      if (radialDepth >= -SKIN && radialDepth < (wallOnly && !wall ? GROUND_THICKNESS : depth) && distance > 1e-9) {
        const qx = hole.x - dx / distance * hole.radius, qz = hole.z - dz / distance * hole.radius;
        if (!inOpening(qx, qz, holes.filter(other => other !== hole), SKIN)) {
          normal = new Vec3(dx / distance, 0, dz / distance); depth = Math.max(0, radialDepth); wall = hole;
        }
      }
    }
    // An intersection on a vertical hull edge is a wall sample, not an
    // artificial shelf halfway up a prop. Top/bottom faces provide support.
    if (wallOnly && normal.y !== 0) continue;
    const key = `${p.x.toFixed(4)},${p.y.toFixed(4)},${p.z.toFixed(4)},${normal.y}`;
    if (used.has(key)) continue;
    used.add(key);
    contacts.push({ point: p, normal, depth: Math.max(0, depth), wall });
  }
  // A bottom already below the slab is not a shelf. When a real wall contact
  // can resolve the overlap, let that clipped cross-section push/turn the
  // shape instead of simultaneously lifting its buried bottom. If a hole
  // disappears or jumps away, retain one-sided recovery to escape restored
  // solid terrain rather than leaving the compound body embedded forever.
  return contacts.some(contact => contact.wall)
    ? contacts.filter(contact => contact.normal.y !== 1 || contact.point.y >= -GROUND_THICKNESS)
    : contacts;
}

function movingContactB(dt) {
  this.contactImpulse = 0;
  this.positionBias = this.a * Math.max(0, this.penetration - .001);
  // The perforated plane itself is static. Only an exposed circle wall has
  // boundary velocity; translating the shared plane would drag every prop.
  // Penetration correction is solved separately, without manufacturing a
  // physical normal load that friction could use to lock an overlap in place.
  return ContactEquation.prototype.computeB.call(this, dt) - this.a * this.penetration + this.b * this.wallSpeed;
}

export function installPerforatedGround(world, getHoles) {
  const narrowphase = world.narrowphase;
  // cannon-es exposes planeConvex as the dispatch target for boxes, convex
  // hulls and cylinders. Keep integration, inertia and the constraint solver;
  // replace only contact generation for this horizontal perforated slab.
  narrowphase.planeConvex = function (planeShape, convexShape, planePosition, convexPosition, planeQuat, convexQuat, planeBody, convexBody, si, sj, justTest) {
    const hull = getConvexHull(convexShape);
    const vertices = hull.vertices.map(vertex => convexQuat.vmult(vertex).vadd(convexPosition));
    const contacts = groundContacts(vertices, hull.edges, getHoles(), hull.faces, convexBody.aabb.upperBound.y);
    if (justTest) return contacts.length ? true : undefined;
    for (const { point, normal, depth, wall } of contacts) {
      const contact = this.createContactEquation(planeBody, convexBody, planeShape, convexShape, si, sj);
      contact.ni.copy(normal);
      contact.computeB = movingContactB;
      // Reset even on static contacts: cannon reuses equations from a pool.
      contact.wallSpeed = wall ? (wall.vx ?? 0) * normal.x + (wall.vz ?? 0) * normal.z - (wall.vr ?? 0) : 0;
      // Limit positional error correction when a moving aperture restores
      // support through a partly inserted body. Resolve over several fixed
      // steps instead of converting a deep overlap into an explosive launch.
      contact.penetration = Math.min(depth, 2.1 * this.world.dt);
      point.vadd(normal.scale(contact.penetration), contact.ri); contact.ri.vsub(planeBody.position, contact.ri);
      point.vsub(convexBody.position, contact.rj);
      this.result.push(contact);
      const first = this.frictionResult.length;
      this.createFrictionEquationsFromContact(contact, this.frictionResult);
      const matA = contact.si.material || planeBody.material, matB = contact.sj.material || convexBody.material;
      const coefficient = matA && matB && matA.friction >= 0 && matB.friction >= 0
        ? matA.friction * matB.friction : this.currentContactMaterial.friction;
      coupleContactFriction(contact, this.frictionResult.slice(first), coefficient);
    }
  };
}
