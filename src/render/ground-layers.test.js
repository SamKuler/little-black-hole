import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createMap, MAPS } from '../maps/index.js';
import { MapScene } from './map-scene.js';

const EPSILON = 1e-6;

// Separating-axis test for positive-area overlap. Shared edges are harmless.
function overlaps(a, b) {
  for (const triangle of [a, b]) for (let i = 0; i < 3; i++) {
    const [x, z] = triangle[i], [nextX, nextZ] = triangle[(i + 1) % 3];
    const length = Math.hypot(nextX - x, nextZ - z);
    const nx = (z - nextZ) / length, nz = (nextX - x) / length;
    const first = a.map(([px, pz]) => px * nx + pz * nz);
    const second = b.map(([px, pz]) => px * nx + pz * nz);
    if (Math.min(Math.max(...first), Math.max(...second)) - Math.max(Math.min(...first), Math.min(...second)) <= EPSILON) return false;
  }
  return true;
}

function topTriangles(view) {
  const triangles = [];
  for (const mesh of view.root.children) {
    if (mesh.isInstancedMesh) continue;
    const positions = mesh.geometry.getAttribute('position'), normals = mesh.geometry.getAttribute('normal');
    // MapScene emits nonindexed, world-space geometry after material batching.
    assert.equal(mesh.geometry.index, null);
    for (let i = 0; i < positions.count; i += 3) {
      if (normals.getY(i) < .99) continue;
      const y = positions.getY(i);
      if ([1, 2].some(offset => Math.abs(positions.getY(i + offset) - y) > EPSILON)) continue;
      triangles.push({
        y, material: mesh.material,
        points: [0, 1, 2].map(offset => [positions.getX(i + offset), positions.getZ(i + offset)]),
      });
    }
  }
  return triangles;
}

test('ground overlap diagnostic ignores shared edges but catches coincident and partial faces', () => {
  const triangle = [[0, 0], [2, 0], [0, 2]];
  assert.equal(overlaps(triangle, triangle), true);
  assert.equal(overlaps(triangle, [[1, 0], [3, 0], [1, 2]]), true);
  assert.equal(overlaps(triangle, [[2, 0], [2, 2], [0, 2]]), false);
  assert.equal(overlaps(triangle, [[3, 0], [5, 0], [3, 2]]), false);
});

for (const mapId of Object.keys(MAPS)) test(`${mapId} has no overlapping coplanar ground faces with different materials`, () => {
  const view = new MapScene(new THREE.Scene(), { ...createMap(mapId, 42), items: [] });
  try {
    const triangles = topTriangles(view);
    assert.ok(triangles.length > 0);
    for (let i = 0; i < triangles.length; i++) for (let j = i + 1; j < triangles.length; j++) {
      const a = triangles[i], b = triangles[j];
      if (a.material === b.material || Math.abs(a.y - b.y) > EPSILON) continue;
      assert.equal(overlaps(a.points, b.points), false,
        `${mapId}: #${a.material.color.getHexString()} and #${b.material.color.getHexString()} compete at y=${a.y}`);
    }
  } finally { view.dispose(); }
});

const patches = {
  town: [[-18.2, 17.3, '8eb79b'], [-37.2, -35.3, 'c4bc9e'], [12.2, -12.3, 'e1c7a9'], [12.2, 12.3, 'd4d9ce']],
  cyberpunk: [[-11.2, -11.3, '51506c'], [11.2, 11.3, '3b6970']],
};
const markings = {
  town: [[-39, -35.3, '91b58b', 'c4bc9e'], [7, -12.3, 'c9b497', 'e1c7a9'], [-12, 12.3, '78acb4', '8eb79b']],
  cyberpunk: [[-16, -11.3, '68788e', '51506c'], [-17.8, -11.3, 'd894bc', '51506c'], [6, 11.3, '68788e', '3b6970']],
};

for (const [mapId, samples] of Object.entries(patches)) test(`${mapId} destination paving sits above its district and below decorative markings`, () => {
  const view = new MapScene(new THREE.Scene(), { ...createMap(mapId, 42), items: [] });
  try {
    view.root.updateMatrixWorld(true);
    const ray = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0);
    for (const [x, z, color] of samples) {
      ray.set(new THREE.Vector3(x, 1, z), down);
      const hits = ray.intersectObjects(view.root.children);
      const top = hits[0].point.y;
      assert.deepEqual([...new Set(hits.filter(hit => top - hit.point.y < EPSILON).map(hit => hit.object.material.color.getHexString()))], [color]);
      const district = hits.find(hit => hit.object.material.color.getHexString() !== color);
      assert.ok(top - district.point.y > .001, `${mapId}: destination must not compete with its underlying district`);
    }
    for (const [x, z, color, patch] of markings[mapId]) {
      ray.set(new THREE.Vector3(x, 1, z), down);
      const hits = ray.intersectObjects(view.root.children);
      assert.equal(hits[0].object.material.color.getHexString(), color);
      const paving = hits.find(hit => hit.object.material.color.getHexString() === patch);
      assert.ok(hits[0].point.y - paving.point.y > .001, `${mapId}: decorative markings must remain above destination paving`);
    }
  } finally { view.dispose(); }
});
