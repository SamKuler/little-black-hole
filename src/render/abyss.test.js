import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ABYSS_FADE_DEPTH, applyAbyssFade } from './abyss.js';
import { ApertureMask } from './apertures.js';
import { createHoleVisual, disposeHoleVisual, setHoleApertureMask } from './hole-visual.js';
import { MapScene } from './map-scene.js';
import { ITEM_CATALOG } from '../items/catalog.js';
import { HolePhysics } from '../physics/world.js';
import { interpolatePose } from '../fall.js';

function compile(material, type = 'standard') {
  const shader = { ...THREE.ShaderLib[type], uniforms: {} };
  material.onBeforeCompile(shader);
  return shader;
}

// CPU reference to the shader's smoothstep, not a GPU pixel test.
function lightAt(y) {
  const t = Math.max(0, Math.min(1, -y / ABYSS_FADE_DEPTH));
  return 1 - t * t * (3 - 2 * t);
}

function worldHeights(view, id) {
  const heights = [], matrix = new THREE.Matrix4(), vertex = new THREE.Vector3();
  view.root.updateMatrixWorld(true);
  for (const { batch, index } of view.parts.get(id)) {
    batch.getMatrixAt(index, matrix);
    const positions = batch.geometry.getAttribute('position');
    for (let i = 0; i < positions.count; i++) {
      vertex.fromBufferAttribute(positions, i).applyMatrix4(matrix).applyMatrix4(batch.matrixWorld);
      heights.push(vertex.y);
    }
  }
  return heights;
}

test('abyss attenuation is smooth, affects only submerged fragments, and reaches exact black', () => {
  assert.equal(lightAt(10), 1); assert.equal(lightAt(0), 1);
  assert.ok(lightAt(-.01) > .99);
  assert.equal(lightAt(-ABYSS_FADE_DEPTH / 2), .5);
  assert.equal(lightAt(-ABYSS_FADE_DEPTH), 0); assert.equal(lightAt(-8), 0);
  for (let i = 1; i <= 100; i++) assert.ok(lightAt(-i * .003) <= lightAt(-(i - 1) * .003));
  assert.ok(Math.abs(lightAt(-.00001) - 1) < 1e-7, 'no sudden brightness step at the lip');
  assert.ok(lightAt(-ABYSS_FADE_DEPTH + .00001) < 1e-7, 'no brightness step at removal depth');
});

test('final-output attenuation includes neon, tone mapping, fog and dithering without changing opacity or shadows', () => {
  const material = applyAbyssFade(new THREE.MeshStandardMaterial({ color: '#72d3d4', emissive: '#72d3d4', emissiveIntensity: 12, dithering: true }));
  const shader = compile(material), fade = shader.fragmentShader.indexOf('float abyssLight');
  for (const chunk of ['opaque_fragment', 'tonemapping_fragment', 'colorspace_fragment', 'fog_fragment', 'dithering_fragment']) {
    assert.ok(shader.fragmentShader.indexOf(`#include <${chunk}>`) < fade, `${chunk} must not brighten already-faded output`);
  }
  assert.match(shader.fragmentShader, /float abyssLight = 1.0 - smoothstep\(0.0, 0.30, -vAbyssWorldY\);/);
  assert.match(shader.fragmentShader, /gl_FragColor.rgb \*= abyssLight;/);
  assert.doesNotMatch(shader.fragmentShader.slice(fade), /discard|gl_FragColor.a|gl_FragDepth/);
  assert.equal(material.emissiveIntensity, 12);
  assert.equal(material.opacity, 1); assert.equal(material.transparent, false);
  assert.equal(material.depthWrite, true); assert.equal(material.depthTest, true);
  assert.match(shader.vertexShader, /abyssWorldPosition = batchingMatrix \* abyssWorldPosition;/);
  assert.match(shader.vertexShader, /abyssWorldPosition = instanceMatrix \* abyssWorldPosition;/);
  assert.match(shader.vertexShader, /vAbyssWorldY = \(modelMatrix \* abyssWorldPosition\).y;/);
  assert.doesNotMatch(shader.vertexShader, /smoothstep/, 'darkness is per fragment, not interpolated vertex colors');
  material.dispose();
});

test('a tilted falling instance darkens progressively while its shared-material neighbor stays lit', () => {
  const items = [0, 1].map(id => ({ ...ITEM_CATALOG.neonCrate, type: 'neonCrate', id, x: id * 3, z: 0, rotation: 0 }));
  const view = new MapScene(new THREE.Scene(), { surfaces: [], items });
  try {
    const first = view.parts.get(0)[0], second = view.parts.get(1)[0];
    assert.equal(first.batch, second.batch);
    const material = first.batch.material, color = material.color.getHex(), emission = material.emissiveIntensity;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(.4, .2, .3)).toArray();
    const pose = interpolatePose(items[0], { pose: { x: 0, y: -.2, z: 0, q } }, { pose: { x: 0, y: -.6, z: 0, q } }, .5);
    view.pose(items[0], pose); view.flush();
    const falling = worldHeights(view, 0).map(lightAt), resting = worldHeights(view, 1).map(lightAt);
    assert.ok(falling.some(light => light === 1), 'above-ground parts keep their original lighting');
    assert.ok(falling.some(light => light === 0), 'deep parts blend into the black interior');
    assert.ok(falling.some(light => light > .05 && light < .95), 'partial entry is not a whole-object switch');
    assert.ok(resting.every(light => light === 1));
    assert.equal(material.color.getHex(), color); assert.equal(material.emissiveIntensity, emission);
    for (const batch of view.batches) {
      assert.equal(batch.castShadow, true); assert.equal(batch.receiveShadow, true);
      assert.equal(batch.customDepthMaterial, undefined, 'shadow geometry keeps the stock material');
      assert.equal(batch.customDistanceMaterial, undefined);
    }
  } finally { view.dispose(); }
});

test('well fade survives map rebinding and meets an indistinguishable black backdrop at every hole size', () => {
  const visual = createHoleVisual(), well = visual.getObjectByName('well'), floor = visual.getObjectByName('floor');
  try {
    setHoleApertureMask(visual, new ApertureMask());
    const firstShader = compile(well.material, 'basic'), version = well.material.version, key = well.material.customProgramCacheKey();
    for (const radius of [.65, 1.2, 8, 24]) {
      const mask = new ApertureMask(); mask.setHoles([{ x: 4, z: 3, radius }]);
      setHoleApertureMask(visual, mask);
      const shader = compile(well.material, 'basic');
      assert.equal((shader.fragmentShader.match(/float abyssLight/g) ?? []).length, 1, 'do not stack fade hooks on map changes');
      assert.match(shader.fragmentShader, /smoothstep\(0.0, 0.30, -vHoleWorldPosition.y\)/);
      assert.match(shader.fragmentShader, /if \(!throughMouth\) discard;/);
      assert.match(shader.fragmentShader, /if \(distance\(holeCircle, vHoleOriginAndRadius\) < 0.00001\) continue;/);
      assert.equal(firstShader.uniforms.holeCircles, mask.uniforms.holeCircles);
      assert.equal(well.material.version, version); assert.equal(well.material.customProgramCacheKey(), key);
      visual.scale.set(radius, 1, radius); visual.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(well);
      assert.equal(bounds.min.y, -8); assert.equal(bounds.max.y, 0, 'hole growth must not stretch the extinction depth');
      assert.equal(lightAt(bounds.min.y), 0);
    }
    assert.equal(floor.material.color.getHex(), 0);
    assert.equal(floor.material.fog, false); assert.equal(floor.material.toneMapped, false);
    assert.equal(floor.material.depthWrite, true); assert.equal(floor.material.opacity, 1);
    assert.equal(floor.position.y, -8, 'retain real depth instead of moving a cap over the mouth');
    assert.equal(well.material.fog, false); assert.equal(well.material.toneMapped, false);
  } finally { disposeHoleVisual(visual); }
});

test('every model is already black at its unchanged authoritative completion pose', () => {
  for (const [type, definition] of Object.entries(ITEM_CATALOG)) {
    const item = { ...definition, type, id: 0, x: 0, z: 0, rotation: 0 };
    const view = new MapScene(new THREE.Scene(), { surfaces: [], items: [item] });
    try {
      for (const rotation of [[0, 0, 0], [.4, .8, -.6], [Math.PI, 0, 0]]) {
        const sim = new HolePhysics([item]), record = sim.activate(0);
        record.body.quaternion.setFromEuler(...rotation);
        record.body.position.copy(record.body.quaternion.vmult(record.modelOffset));
        record.body.updateInertiaWorld(true); record.body.aabbNeedsUpdate = true;
        for (let step = 0; step < 180 && !record.done; step++) sim.step([{ id: 'host', x: 0, z: 0, radius: 20, online: true }]);
        assert.equal(record.done, true, `${type}: unobstructed item completes normally`);
        view.pose(item, record.pose); view.flush();
        assert.ok(worldHeights(view, 0).every(y => y < -ABYSS_FADE_DEPTH && lightAt(y) === 0), `${type}/${rotation}: no bright fragment may pop at completion`);
        const matrix = new THREE.Matrix4(), scale = new THREE.Vector3();
        view.parts.get(0)[0].batch.getMatrixAt(0, matrix);
        matrix.decompose(new THREE.Vector3(), new THREE.Quaternion(), scale);
        assert.ok(scale.distanceTo(new THREE.Vector3(1, 1, 1)) < 1e-6, 'falling never shrinks the model');
      }
    } finally { view.dispose(); }
  }
});
