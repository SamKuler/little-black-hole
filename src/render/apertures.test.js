import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ApertureMask, MAX_HOLES } from './apertures.js';

test('apertures retain exact input radii, support four mouths, and clear disconnected slots', () => {
  const mask = new ApertureMask(), circles = mask.uniforms.holeCircles.value;
  const holes = Array.from({ length: MAX_HOLES }, (_, i) => ({ x: i, z: -i, radius: .65 + i }));
  mask.setHoles(holes);
  assert.equal(mask.uniforms.holeCount.value, 4);
  assert.deepEqual(circles.map(circle => circle.toArray()), holes.map(({ x, z, radius }) => [x, z, radius]));
  mask.setHoles(holes.slice(1, 3));
  assert.equal(mask.uniforms.holeCircles.value, circles);
  assert.deepEqual(circles[0].toArray(), [1, -1, 1.65]);
  assert.deepEqual(circles[2].toArray(), [0, 0, 0]);
  mask.setHoles([]);
  assert.equal(mask.uniforms.holeCount.value, 0);
  for (const circle of circles) assert.deepEqual(circle.toArray(), [0, 0, 0]);
});

test('invalid inputs cannot silently leave visual holes out of sync with physics', () => {
  const mask = new ApertureMask(); mask.setHoles([{ x: 0, z: 0, radius: 1 }]);
  for (const hole of [{ x: NaN, z: 0, radius: 1 }, { x: 0, z: Infinity, radius: 1 }, { x: 0, z: 0, radius: 0 }, { x: 0, z: 0, radius: -1 }]) {
    assert.throws(() => mask.setHoles([hole]), TypeError);
  }
  assert.throws(() => mask.setHoles(Array.from({ length: 5 }, () => ({ x: 0, z: 0, radius: 1 }))), RangeError);
  assert.equal(mask.uniforms.holeCount.value, 1);
  assert.deepEqual(mask.uniforms.holeCircles.value[0].toArray(), [0, 0, 1]);
});

for (const [name, Material] of [['standard', THREE.MeshStandardMaterial], ['depth', THREE.MeshDepthMaterial], ['distanceRGBA', THREE.MeshDistanceMaterial]]) {
  test(`${name} shader discards the circle union using transformed world positions`, () => {
    const mask = new ApertureMask(), material = mask.apply(new Material());
    const shader = { ...THREE.ShaderLib[name], uniforms: {} };
    material.onBeforeCompile(shader);
    assert.match(shader.vertexShader, /vHoleWorldXZ = \(modelMatrix \* holeWorldPosition\).xz;/);
    assert.match(shader.vertexShader, /#ifdef USE_INSTANCING\s+holeWorldPosition = instanceMatrix \* holeWorldPosition;/);
    assert.match(shader.vertexShader, /#ifdef USE_BATCHING\s+holeWorldPosition = batchingMatrix \* holeWorldPosition;/);
    assert.ok(shader.vertexShader.indexOf('vec4 holeWorldPosition') > shader.vertexShader.indexOf('#include <project_vertex>'));
    assert.match(shader.fragmentShader, /uniform vec3 holeCircles\[4\];/);
    assert.match(shader.fragmentShader, /for \(int holeIndex = 0; holeIndex < 4; holeIndex\+\+\)/);
    assert.match(shader.fragmentShader, /if \(dot\(holeDelta, holeDelta\) < holeCircle.z \* holeCircle.z\) discard;/);
    assert.doesNotMatch(shader.fragmentShader, /holeViewRay|throughMouth/, 'ground and shadow masks keep their existing world-space clipping');
    assert.equal(shader.uniforms.holeCount, mask.uniforms.holeCount);
    assert.equal(shader.uniforms.holeCircles, mask.uniforms.holeCircles);
    const programKey = material.customProgramCacheKey(), version = material.version;
    mask.setHoles([{ x: 1, z: 2, radius: 3 }]);
    assert.equal(material.version, version, 'moving holes must not recompile shaders');
    assert.equal(material.customProgramCacheKey(), programKey);
    material.dispose();
  });
}

test('separate maps do not share mutable aperture state', () => {
  const first = new ApertureMask(), second = new ApertureMask();
  first.setHoles([{ x: 1, z: 2, radius: 3 }]);
  assert.equal(second.uniforms.holeCount.value, 0);
  assert.notEqual(first.uniforms.holeCircles, second.uniforms.holeCircles);
});
