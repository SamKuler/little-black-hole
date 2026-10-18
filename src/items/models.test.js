import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ITEM_CATALOG } from './catalog.js';
import { createModel } from './models.js';

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
