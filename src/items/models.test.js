import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ITEM_CATALOG } from './catalog.js';
import { createModel } from './models.js';
import { fitsHole, START_RADIUS } from '../rules.js';

const themedContracts = {
  mushroom: [.45, 2, .8], log: [1, 6, .72], boulder: [1.8, 16, 2.1],
  cabin: [2.7, 38, 4.7], ancientTree: [3.4, 65, 7.4],
  neonCrate: [.45, 2, .65], terminal: [.85, 4, 1.7], neonSign: [1.1, 8, 3.2],
  hovercar: [1.65, 16, 1.6], cyberShop: [2.7, 38, 3.7], cyberTower: [3.6, 70, 10.2],
};

test('every model fits the catalog footprint and height used by swallowing and falling', () => {
  const material = new THREE.MeshBasicMaterial(), vertex = new THREE.Vector3();
  for (const [type, definition] of Object.entries(ITEM_CATALOG)) {
    const model = createModel(definition, () => material); model.updateMatrixWorld(true);
    model.traverse(mesh => {
      if (!mesh.isMesh) return;
      const position = mesh.geometry.getAttribute('position');
      for (let i = 0; i < position.count; i++) {
        vertex.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
        assert.ok(Math.hypot(vertex.x, vertex.z) <= definition.radius + 1e-6, `${type} footprint exceeds ${definition.radius}`);
        assert.ok(vertex.y <= definition.height + 1e-6, `${type} height exceeds ${definition.height}`);
      }
    });
  }
  material.dispose();
});

test('forest and cyberpunk items retain their progression contracts', () => {
  for (const [type, expected] of Object.entries(themedContracts)) {
    const { radius, mass, height } = ITEM_CATALOG[type];
    assert.deepEqual([radius, mass, height], expected, `${type} progression changed`);
  }
  for (const type of ['mushroom', 'neonCrate']) {
    assert.ok(fitsHole(START_RADIUS, ITEM_CATALOG[type]), `${type} must be edible at spawn`);
  }
});

test('new themed models use a small reusable material palette', () => {
  for (const type of Object.keys(themedContracts)) {
    const materials = new Map();
    const model = createModel(ITEM_CATALOG[type], color => {
      if (!materials.has(color)) materials.set(color, new THREE.MeshBasicMaterial({ color }));
      return materials.get(color);
    });
    assert.ok(model.children.length > 0, `${type} model must be visible`);
    assert.ok(materials.size <= 6, `${type} uses too many draw batches`);
    for (const material of materials.values()) material.dispose();
  }
});

test('themed objects have distinct geometry as well as different colors', () => {
  const material = new THREE.MeshBasicMaterial();
  const signature = type => createModel(ITEM_CATALOG[type], () => material).children.map(mesh => ({
    geometry: mesh.geometry.type,
    position: mesh.position.toArray(),
    scale: mesh.scale.toArray(),
    rotation: mesh.rotation.toArray(),
  }));
  for (const [themed, original] of [
    ['mushroom', 'stone'], ['log', 'bench'], ['boulder', 'stone'],
    ['cabin', 'house'], ['ancientTree', 'tree'], ['neonCrate', 'stone'],
    ['terminal', 'cone'], ['neonSign', 'lamp'], ['hovercar', 'car'],
    ['cyberShop', 'shop'], ['cyberTower', 'tower'],
  ]) {
    assert.notDeepEqual(signature(themed), signature(original), `${themed} should have its own silhouette`);
  }
  material.dispose();
});

test('cyberpunk buildings apply their neon palette to every model part', () => {
  const material = new THREE.MeshBasicMaterial();
  for (const type of ['cyberShop', 'cyberTower']) {
    const item = ITEM_CATALOG[type], colors = new Set();
    createModel(item, color => { colors.add(color); return material; });
    assert.deepEqual(colors, new Set([item.color, item.trimColor, item.glassColor, item.accent]));
  }
  material.dispose();
});
