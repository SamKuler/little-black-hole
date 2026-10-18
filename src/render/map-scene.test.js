import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createMap } from '../maps/index.js';
import { MapScene } from './map-scene.js';

test('all town objects render through batches and release their resources on map changes', () => {
  const scene = new THREE.Scene(), map = createMap('town', 42), view = new MapScene(scene, map);
  assert.equal(view.parts.size, 212); assert.ok(view.root.children.length < 130);
  for (const item of map.items) assert.ok(view.parts.get(item.id).length > 0);
  const item = map.items[0]; view.pose(item, { x: 2, y: -1, z: 3, rx: .2, rz: .1 }); view.flush();
  const part = view.parts.get(item.id)[0], matrix = new THREE.Matrix4(); part.batch.getMatrixAt(part.index, matrix);
  assert.equal(matrix.elements[13], -1);
  view.hide(item); view.flush(); part.batch.getMatrixAt(part.index, matrix); assert.equal(matrix.elements[0], 0);
  let released = 0; view.root.traverse(mesh => { if (mesh.isMesh) mesh.geometry.addEventListener('dispose', () => released++); });
  const geometries = view.root.children.length; view.dispose(); assert.equal(scene.children.length, 0); assert.equal(released, geometries);
});

test('a rotated car tips toward the mouth in world space', () => {
  const scene = new THREE.Scene(), map = createMap('town', 42), view = new MapScene(scene, map);
  const item = { ...map.items.find(item => item.type === 'car'), rotation: Math.PI / 2 };
  view.pose(item, { x: 0, y: -.3, z: 0, rx: 0, rz: .2 }); view.flush();
  const part = view.parts.get(item.id)[0], matrix = new THREE.Matrix4(); part.batch.getMatrixAt(part.index, matrix);
  const up = new THREE.Vector3(0, 1, 0).transformDirection(matrix);
  assert.ok(up.x < 0); assert.ok(Math.abs(up.z) < 1e-6); view.dispose();
});
