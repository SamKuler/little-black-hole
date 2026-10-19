import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createMap, MAPS } from '../maps/index.js';
import { MapScene } from './map-scene.js';

for (const mapId of Object.keys(MAPS)) test(`${mapId} renders through bounded batches and releases resources on map changes`, () => {
  const scene = new THREE.Scene(), map = createMap(mapId, 42), view = new MapScene(scene, map);
  assert.equal(view.parts.size, map.items.length);
  assert.ok(view.root.children.length < 200, `${mapId}: ${view.root.children.length} draw batches`);
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

test('organic ground polygons preserve world dimensions and face upward after batching', () => {
  const map = { surfaces: [{ color: '#719f83', position: [4, .04, -2], size: [12, .001, 8], points: [[-.5, -.5], [.5, -.5], [.5, .5], [-.5, .5]] }], items: [] };
  const view = new MapScene(new THREE.Scene(), map), geometry = view.root.children[0].geometry;
  geometry.computeBoundingBox();
  assert.ok(Math.abs(geometry.boundingBox.min.x + 2) < 1e-6);
  assert.ok(Math.abs(geometry.boundingBox.max.x - 10) < 1e-6);
  assert.ok(Math.abs(geometry.boundingBox.min.z + 6) < 1e-6);
  assert.ok(Math.abs(geometry.boundingBox.max.z - 2) < 1e-6);
  const normals = geometry.getAttribute('normal');
  for (let i = 0; i < normals.count; i++) assert.ok(normals.getY(i) > .99);
  view.dispose();
});

test('night lights use cached emissive materials that are released with the map', () => {
  const view = new MapScene(new THREE.Scene(), createMap('cyberpunk', 42));
  const glowing = [...view.materials.values()].filter(material => material.emissiveIntensity > 0);
  assert.ok(glowing.length > 0);
  const color = '#4ff4e8', normal = view.material(color), lit = view.material(color, true, 1.3);
  assert.notEqual(normal, lit); assert.equal(lit, view.material(color, true, 1.3));
  let disposed = 0;
  for (const material of view.materials.values()) material.addEventListener('dispose', () => disposed++);
  const count = view.materials.size; view.dispose(); assert.equal(disposed, count);
});
