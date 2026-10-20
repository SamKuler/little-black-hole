import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ApertureMask } from './apertures.js';
import { createHoleVisual, disposeHoleVisual, setHoleApertureMask } from './hole-visual.js';

test('hole has an open, recessed well rather than a cap hiding entering objects', () => {
  const visual = createHoleVisual(), well = visual.getObjectByName('well'), floor = visual.getObjectByName('floor');
  visual.updateMatrixWorld(true);
  assert.equal(well.geometry.parameters.openEnded, true);
  assert.equal(well.material.side, THREE.BackSide);
  assert.equal(new THREE.Box3().setFromObject(well).max.y, 0);
  assert.ok(new THREE.Box3().setFromObject(floor).max.y < -7.99);
  const ray = new THREE.Raycaster(new THREE.Vector3(0, 10, 0), new THREE.Vector3(0, -1, 0));
  const hits = ray.intersectObject(visual);
  assert.ok(hits.length > 0);
  assert.ok(hits.every(hit => hit.point.y < -7.99), 'no horizontal surface may cover the mouth');
  assert.equal(visual.children[2], visual.getObjectByName('ring'));
  assert.equal(visual.children[3], visual.getObjectByName('outerRing'));
  const rim = visual.getObjectByName('ring').geometry.parameters;
  assert.ok(Math.abs(rim.radius - rim.tube - 1) < 1e-12, 'the colored rim stays outside the physical aperture');
  disposeHoleVisual(visual);
});

test('overlapping and concentric mouths remove internal well walls through the shared mask', () => {
  const visual = createHoleVisual(), mask = new ApertureMask();
  setHoleApertureMask(visual, mask);
  const material = visual.getObjectByName('well').material;
  const shader = { ...THREE.ShaderLib.basic, uniforms: {} };
  material.onBeforeCompile(shader);
  assert.equal(shader.uniforms.holeCircles, mask.uniforms.holeCircles);
  assert.match(shader.vertexShader, /vHoleOriginAndRadius = vec3\(modelMatrix\[3\].xz, length\(modelMatrix\[0\].xyz\)\);/);
  assert.match(shader.fragmentShader, /if \(distance\(holeCircle, vHoleOriginAndRadius\) < 0.00001\) continue;/);
  assert.match(shader.fragmentShader, /if \(dot\(holeDelta, holeDelta\) < holeCircle.z \* holeCircle.z\) discard;/);
  const nextMapMask = new ApertureMask(), version = material.version;
  setHoleApertureMask(visual, nextMapMask);
  assert.equal(material.version, version, 'changing maps should reuse the same shader program');
  assert.equal(shader.uniforms.holeCircles, nextMapMask.uniforms.holeCircles);
  nextMapMask.setHoles([{ x: 9, z: 3, radius: 2 }]);
  assert.equal(shader.uniforms.holeCount.value, 1);
  assert.deepEqual(shader.uniforms.holeCircles.value[0].toArray(), [9, 3, 2]);
  disposeHoleVisual(visual);
});

test('each visual owns and releases its well and ring resources', () => {
  const scene = new THREE.Scene(), first = createHoleVisual(), second = createHoleVisual('#ffaa00');
  scene.add(first, second);
  let geometries = 0, materials = 0;
  for (let i = 0; i < first.children.length; i++) {
    const mesh = first.children[i];
    assert.notEqual(mesh.material, second.children[i].material);
    assert.notEqual(mesh.geometry, second.children[i].geometry);
    mesh.geometry.addEventListener('dispose', () => geometries++);
    mesh.material.addEventListener('dispose', () => materials++);
  }
  disposeHoleVisual(first);
  assert.equal(scene.children.length, 1); assert.equal(scene.children[0], second);
  assert.equal(geometries, 4); assert.equal(materials, 4);
  disposeHoleVisual(second);
});

test('both recessed surfaces require a camera ray through a mouth, without masking the rim or floor as ground', () => {
  const visual = createHoleVisual(), mask = new ApertureMask();
  setHoleApertureMask(visual, mask);
  const programs = new Set();
  for (const name of ['well', 'floor']) {
    const material = visual.getObjectByName(name).material;
    const shader = { ...THREE.ShaderLib.basic, uniforms: {} };
    material.onBeforeCompile(shader);
    assert.match(shader.vertexShader, /vHoleWorldPosition = \(modelMatrix \* holeWorldPosition\).xyz;/);
    assert.match(shader.fragmentShader, /vec3 holeViewRay = isOrthographic\s+\? vec3\(viewMatrix\[0\]\[2\], viewMatrix\[1\]\[2\], viewMatrix\[2\]\[2\]\)\s+: cameraPosition - vHoleWorldPosition;/);
    assert.match(shader.fragmentShader, /if \(holeViewRay.y <= 0.0\) discard;/);
    assert.match(shader.fragmentShader, /vec2 holeEntryXZ = vHoleWorldPosition.xz\s+- holeViewRay.xz \* \(vHoleWorldPosition.y \/ holeViewRay.y\);/);
    assert.match(shader.fragmentShader, /if \(dot\(entryDelta, entryDelta\) < holeCircle.z \* holeCircle.z\) throughMouth = true;/);
    assert.match(shader.fragmentShader, /if \(!throughMouth\) discard;/);
    if (name === 'floor') assert.doesNotMatch(shader.fragmentShader, /vec2 holeDelta/);
    programs.add(material.customProgramCacheKey());
    const nextMask = new ApertureMask(), version = material.version;
    setHoleApertureMask(visual, nextMask);
    assert.equal(material.version, version, 'rebinding a map does not rebuild interior programs');
    assert.equal(shader.uniforms.holeCircles, nextMask.uniforms.holeCircles);
    nextMask.setHoles([{ x: 2, z: 3, radius: 4 }]);
    assert.equal(shader.uniforms.holeCount.value, 1);
    assert.deepEqual(shader.uniforms.holeCircles.value[0].toArray(), [2, 3, 4]);
  }
  assert.equal(programs.size, 2, 'floor visibility and well overlap removal need distinct programs');
  for (const name of ['ring', 'outerRing']) {
    assert.equal(visual.getObjectByName(name).material.onBeforeCompile, THREE.Material.prototype.onBeforeCompile);
  }
  disposeHoleVisual(visual);
});
