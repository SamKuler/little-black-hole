import { Body, Box, ConvexPolyhedron, Cylinder, Quaternion, Vec3 } from 'cannon-es';

const Y_AXIS = new Vec3(0, 1, 0);
const hullCache = new WeakMap();

/** Shape-local topology for the perforated-ground narrow phase. */
export function getConvexHull(shape) {
  const convex = shape instanceof Box ? shape.convexPolyhedronRepresentation : shape;
  if (!convex?.vertices || !convex?.faces) throw new TypeError('The ground solver requires a convex collider');
  if (!hullCache.has(convex)) {
    const seen = new Set(), edges = [];
    for (const face of convex.faces) for (let i = 0; i < face.length; i++) {
      const a = face[i], b = face[(i + 1) % face.length];
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      if (!seen.has(key)) { seen.add(key); edges.push([a, b]); }
    }
    hullCache.set(convex, { convex, vertices: convex.vertices, faces: convex.faces, edges });
  }
  return hullCache.get(convex);
}

// The low-poly foliage/stone silhouette matches the renderer's icosahedron.
function ellipsoid(rx, ry, rz) {
  const t = (1 + Math.sqrt(5)) / 2, norm = Math.hypot(1, t);
  const points = [[-1,t,0],[1,t,0],[-1,-t,0],[1,-t,0],[0,-1,t],[0,1,t],[0,-1,-t],[0,1,-t],[t,0,-1],[t,0,1],[-t,0,-1],[-t,0,1]];
  const faces = [[0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],[1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],[3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],[4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1]];
  return new ConvexPolyhedron({ vertices: points.map(([x,y,z]) => new Vec3(x * rx / norm, y * ry / norm, z * rz / norm)), faces });
}

function cone(radius, height, segments = 10) {
  // A unique apex avoids the zero-length edges of Cylinder(0, radius, ...).
  const vertices = [new Vec3(0, height / 2, 0)];
  for (let i = 0; i < segments; i++) {
    const angle = i * Math.PI * 2 / segments;
    vertices.push(new Vec3(Math.sin(angle) * radius, -height / 2, Math.cos(angle) * radius));
  }
  const faces = [Array.from({ length: segments }, (_, i) => segments - i)];
  for (let i = 0; i < segments; i++) faces.push([0, i + 1, (i + 1) % segments + 1]);
  return new ConvexPolyhedron({ vertices, faces });
}

function proxyParts(item) {
  const parts = [];
  const add = (shape, x, y, z, weight = 1, rotationZ = 0, rotationY = 0) => {
    const orientation = new Quaternion(); orientation.setFromEuler(0, rotationY, rotationZ, 'XYZ');
    parts.push({ shape, position: new Vec3(x, y, z), orientation, weight });
  };
  const box = (x, y, z, w, h, d, weight = 1, rotationZ = 0) => add(new Box(new Vec3(w / 2, h / 2, d / 2)), x, y, z, weight, rotationZ);
  const cylinder = (x, y, z, radius, height, weight = 1, rotationZ = 0) => add(new Cylinder(radius, radius, height, 12), x, y, z, weight, rotationZ);
  const sphere = (x, y, z, rx, ry, rz, weight = 1) => add(ellipsoid(rx, ry, rz), x, y, z, weight);
  const taper = (x, y, z, radius, height, weight = 1) => add(cone(radius, height), x, y, z, weight);

  switch (item.model) {
    case 'stone': sphere(0, .298, 0, item.radius, .35, item.radius); break;
    case 'bush': sphere(0, .553, 0, item.radius, .65, item.radius); break;
    case 'cone':
      box(0, .08, 0, .55, .16, .55, 2); taper(0, .45, 0, .26, .8); break;
    case 'mushroom':
      cylinder(0, .2, 0, .09, .4); sphere(0, .52, 0, .44, .25, .44, 2); break;
    case 'log':
      cylinder(0, .34, 0, .34, 1.75, 5, Math.PI / 2); box(-.08, .66, 0, .85, .08, .22, .1); break;
    case 'boulder':
      sphere(0, 1.05, 0, 1.65, 1.05, 1.4, 5); sphere(.7, .55, .3, .8, .55, .65, 2);
      sphere(-.4, 1.83, .05, .75, .2, .65, .1); break;
    case 'tree':
      box(0, 1, 0, .32, 2, .32, 4); sphere(0, 2.35, 0, 1.15, 1.4, 1.15, 2);
      sphere(.4, 3, .1, .8, .8, .8); break;
    case 'pine':
      box(0, .8, 0, .3, 1.6, .3, 4); taper(0, 1.85, 0, 1.1, 2.5, 2); taper(0, 2.7, 0, .82, 1.8); break;
    case 'ancientTree':
      cylinder(0, 2.2, 0, .55, 4.4, 8); taper(0, .6, 0, 1.15, 1.2, 4);
      for (const side of [-1, 1]) box(side * .6, 3.7, 0, .34, 2.1, .34, 1, -side * .6);
      sphere(0, 5.3, 0, 2.8, 1.65, 2.8, 3); sphere(1.3, 6.25, .1, 1.6, 1.15, 1.6);
      sphere(-1.2, 5.8, -.55, 1.7, 1.3, 1.7); break;
    case 'bench':
      for (const x of [-.65, .65]) box(x, .3, 0, .12, .6, .55);
      box(0, .65, 0, 1.8, .16, .7, 2); box(0, 1, -.3, 1.8, .6, .12); break;
    case 'lamp':
      cylinder(0, 1.4, 0, .09, 2.8, 4); box(.25, 2.8, 0, .65, .12, .16);
      box(.5, 2.7, 0, .4, .14, .3); break;
    case 'neonCrate': box(0, .315, 0, .61, .63, .63); break;
    case 'terminal':
      box(0, .075, 0, 1.1, .15, 1.1, 3); box(0, .6, 0, .5, .9, .55, 2);
      box(0, 1.3, 0, 1.12, .7, .8, 3); break;
    case 'neonSign':
      box(0, .075, 0, .7, .15, .7, 4); cylinder(0, 1.4, 0, .09, 2.8, 2);
      box(0, 2.35, 0, 1.6, 1.65, .4, 3); break;
    case 'car': {
      const lift = item.hover ? .2 : 0;
      box(0, .65 + lift, 0, 1.35, .65, 2.64, 6);
      box(0, 1.1 + lift, -.15, 1.2, .5, 1.35, 2);
      for (const x of [-.68, .68]) for (const z of [-.8, .8]) {
        // Hovercars retain four small contact pads under their visible hover pods.
        // This keeps the rigid model at its authored ground-relative height.
        if (item.hover) cylinder(x, .2, z, .23, .4, .5);
        else cylinder(x, .29, z, .29, .16, .5, Math.PI / 2);
      }
      break;
    }
    case 'building': {
      const { width: w, depth: d, wallHeight: h, roof } = item.building;
      box(0, h / 2, 0, w, h, d, 12); box(0, h + .12, 0, w + .24, .25, d + .24);
      if (roof === 'gable') {
        // Four-sided pitched roof, including the chimney that clears last.
        const shape = cone(2.7, 1.8, 4);
        for (const vertex of shape.vertices) vertex.z *= .95;
        shape.computeNormals(); shape.computeEdges(); shape.updateBoundingSphereRadius();
        add(shape, 0, h + .75, 0, 2, 0, Math.PI / 4);
        box(.8, h + 1.1, -.6, .45, 1.5, .5, .3);
      } else if (roof === 'flat') box(.7, h + .5, -.5, 1.1, .6, .9, .5);
      else if (roof === 'awning') box(0, 2.25, d / 2 + .45, w + .2, .17, 1, .5);
      break;
    }
    default: throw new Error(`No rigid-body proxy for model: ${item.model}`);
  }
  return parts;
}

/**
 * A small compound convex body, centered on an approximate vertical mass center.
 * Surface trim is omitted; trunk/legs/wheels remain separate from upper masses.
 * No forces, world registration or sleep policy are applied here.
 */
export function createItemBody(item) {
  if (!(Number.isFinite(item.mass) && item.mass > 0)) throw new TypeError('Item mass must be positive');
  const definitions = proxyParts(item);
  const totalWeight = definitions.reduce((sum, part) => sum + part.weight, 0);
  const centerHeight = definitions.reduce((sum, part) => sum + part.weight * part.position.y, 0) / totalWeight;
  const body = new Body({ mass: item.mass, allowSleep: true });
  const parts = [], localVertices = [];
  const min = new Vec3(Infinity, Infinity, Infinity), max = new Vec3(-Infinity, -Infinity, -Infinity);
  let clearanceRadius = 0;
  for (const definition of definitions) {
    const { shape, orientation, position } = definition;
    const offset = new Vec3(position.x, position.y - centerHeight, position.z);
    body.addShape(shape, offset, orientation);
    const hull = getConvexHull(shape);
    parts.push({ shape, ...hull, offset, orientation });
    for (const vertex of hull.vertices) {
      const local = orientation.vmult(vertex); local.vadd(offset, local); localVertices.push(local);
      min.x = Math.min(min.x, local.x); min.y = Math.min(min.y, local.y); min.z = Math.min(min.z, local.z);
      max.x = Math.max(max.x, local.x); max.y = Math.max(max.y, local.y); max.z = Math.max(max.z, local.z);
      clearanceRadius = Math.max(clearanceRadius, Math.hypot(local.x, local.z));
    }
  }
  // Cannon's box inertia estimate is evaluated in body-local coordinates first.
  // Updating it after yaw would make inertia depend on the map's heading.
  body.updateMassProperties();
  body.position.set(item.x ?? 0, centerHeight, item.z ?? 0);
  body.quaternion.setFromAxisAngle(Y_AXIS, item.rotation ?? 0);
  body.previousPosition.copy(body.position); body.interpolatedPosition.copy(body.position);
  body.previousQuaternion.copy(body.quaternion); body.interpolatedQuaternion.copy(body.quaternion);
  body.updateInertiaWorld(true); body.aabbNeedsUpdate = true;
  const halfExtents = max.vsub(min); halfExtents.scale(.5, halfExtents);
  return { body, centerHeight, modelOffset: new Vec3(0, centerHeight, 0), clearanceRadius, localVertices, parts,
    bounds: { min, max, halfExtents }, topBound: max.y, bottomBound: min.y };
}

/** Exact highest point of the current rigid collision proxies, in world space. */
export function highestPoint({ body, localVertices }) {
  const q = body.quaternion;
  const r10 = 2 * (q.x * q.y + q.z * q.w), r11 = 1 - 2 * (q.x * q.x + q.z * q.z), r12 = 2 * (q.y * q.z - q.x * q.w);
  let highest = -Infinity;
  for (const vertex of localVertices) highest = Math.max(highest, body.position.y + r10 * vertex.x + r11 * vertex.y + r12 * vertex.z);
  return highest;
}
