import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createMap, MAPS } from '../maps/index.js';
import { clampPosition, START_RADIUS } from '../rules.js';
import { MapScene } from './map-scene.js';
import { createHoleVisual, disposeHoleVisual } from './hole-visual.js';

const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

// Independent geometric reference for the shader's ray/plane intersection.
// Raycaster does not execute fragment shaders: these are not GPU pixel tests.
function entryFromRay(point, camera) {
  const screen = point.clone().project(camera), ray = new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2(screen.x, screen.y), camera);
  return ray.ray.intersectPlane(groundPlane, new THREE.Vector3());
}

function entryFromShaderMath(point, camera) {
  const e = camera.matrixWorldInverse.elements;
  const ray = camera.isOrthographicCamera
    ? new THREE.Vector3(e[2], e[6], e[10])
    : camera.getWorldPosition(new THREE.Vector3()).sub(point);
  if (ray.y <= 0) return null;
  return point.clone().addScaledVector(ray, -point.y / ray.y);
}

function throughMouth(entry, holes) {
  return entry !== null && holes.some(hole => (entry.x - hole.x) ** 2 + (entry.z - hole.z) ** 2 < hole.radius ** 2);
}

function aim(camera, target, offset) {
  camera.position.copy(target).add(offset); camera.lookAt(target); camera.updateMatrixWorld(true);
  return camera;
}

for (const mapId of Object.keys(MAPS)) test(`${mapId} edge rays expose the unmasked lower well but miss the ground-level mouth`, () => {
  const map = createMap(mapId, 42), view = new MapScene(new THREE.Scene(), { ...map, items: [] });
  const visual = createHoleVisual(), r = START_RADIUS, span = 15 + r * 1.35;
  const camera = new THREE.OrthographicCamera(-span * 16 / 9, span * 16 / 9, span, -span, .1, 180);
  const offset = new THREE.Vector3(...map.cameraOffset);
  try {
    for (const [xSide, zSide] of [[1, 0], [0, 1], [1, 1]]) {
      const hole = { x: clampPosition(xSide * 1000, r, map.bounds), z: clampPosition(zSide * 1000, r, map.bounds), radius: r };
      const target = new THREE.Vector3(hole.x, 0, hole.z);
      assert.ok(Math.abs(hole.x) + r <= map.bounds && Math.abs(hole.z) + r <= map.bounds);
      visual.position.copy(target); visual.scale.set(r, 1, r); visual.updateMatrixWorld(true);
      view.root.updateMatrixWorld(true); aim(camera, target, offset);
      const horizontalLength = Math.hypot(offset.x, offset.z);
      const points = [
        new THREE.Vector3(hole.x, -8, hole.z),
        new THREE.Vector3(hole.x - r * offset.x / horizontalLength, -7, hole.z - r * offset.z / horizontalLength),
      ];
      for (const [i, point] of points.entries()) {
        const screen = point.clone().project(camera), ray = new THREE.Raycaster();
        assert.ok(Math.abs(screen.x) < 1 && Math.abs(screen.y) < 1 && Math.abs(screen.z) < 1, 'leak is inside the playing viewport');
        ray.setFromCamera(new THREE.Vector2(screen.x, screen.y), camera);
        const hit = ray.intersectObject(visual)[0];
        assert.equal(hit.object.name, i === 0 ? 'floor' : 'well');
        assert.ok(hit.point.y < -2.1, 'shaft extends below the finite terrain base');
        assert.equal(ray.intersectObject(view.root).length, 0, 'finite map cannot occlude this lower shaft ray');
        const entry = entryFromShaderMath(hit.point, camera);
        assert.ok(entry.distanceTo(entryFromRay(hit.point, camera)) < 1e-8);
        assert.equal(throughMouth(entry, [hole]), false, 'interior visibility must reject the exposed lower frame');
      }
      // Real depth through the mouth remains visible; do not flatten/cap it.
      const screen = target.clone().project(camera), ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2(screen.x, screen.y), camera);
      const hit = ray.intersectObject(visual)[0];
      assert.equal(hit.object.name, 'well');
      assert.equal(throughMouth(entryFromShaderMath(hit.point, camera), [hole]), true);
    }
  } finally { view.dispose(); disposeHoleVisual(visual); }
});

test('entrance projection follows camera orientation, not screen size or orthographic camera distance', () => {
  for (const perspective of [false, true]) for (const offset of [[32, 44, 38], [-32, 44, -38], [0, 44, 0]]) {
    const camera = perspective ? new THREE.PerspectiveCamera(50, 16 / 9, .1, 180) : new THREE.OrthographicCamera(-30, 30, 22, -22, .1, 180);
    const entries = [];
    for (const scale of [1, 2]) {
      aim(camera, new THREE.Vector3(10, 0, -5), new THREE.Vector3(...offset).multiplyScalar(scale));
      camera.zoom = scale; camera.updateProjectionMatrix();
      for (const [i, point] of [[8, -1, -4], [12, -8, -6], [0, -.25, 0]].entries()) {
        const p = new THREE.Vector3(...point), entry = entryFromShaderMath(p, camera);
        assert.ok(entry.distanceTo(entryFromRay(p, camera)) < 1e-8);
        if (scale === 1) entries.push(entry);
        else if (!perspective) assert.ok(entry.distanceTo(entries[i]) < 1e-8);
      }
    }
  }
});

test('a grown mouth retains its recessed backdrop behind the opening', () => {
  const visual = createHoleVisual(), hole = { x: 20, z: 15, radius: 12 };
  visual.position.set(hole.x, 0, hole.z); visual.scale.set(hole.radius, 1, hole.radius); visual.updateMatrixWorld(true);
  const camera = aim(new THREE.OrthographicCamera(-50, 50, 40, -40, .1, 180),
    new THREE.Vector3(hole.x, 0, hole.z), new THREE.Vector3(32, 44, 38));
  const point = new THREE.Vector3(hole.x, -8, hole.z), screen = point.clone().project(camera), ray = new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2(screen.x, screen.y), camera);
  const hit = ray.intersectObject(visual)[0];
  assert.equal(hit.object.name, 'floor');
  assert.equal(throughMouth(entryFromShaderMath(hit.point, camera), [hole]), true);
  disposeHoleVisual(visual);
});

test('entrance visibility uses the moving and growing hole union rather than a single shaft footprint', () => {
  const entry = new THREE.Vector3(1.5, 0, 0), first = { x: 0, z: 0, radius: 1 };
  assert.equal(throughMouth(entry, [first]), false);
  assert.equal(throughMouth(entry, [first, { x: 1, z: 0, radius: 1 }]), true);
  assert.equal(throughMouth(entry, [{ ...first, radius: 2 }]), true);
  assert.equal(throughMouth(entry, [{ ...first, x: 4 }]), false);
  assert.equal(throughMouth(entry, []), false);
});
