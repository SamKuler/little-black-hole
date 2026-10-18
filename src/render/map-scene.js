import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createModel } from '../items/models.js';

function mergeByMaterial(root) {
  root.updateMatrixWorld(true);
  const byMaterial = new Map();
  root.traverse(child => {
    if (!child.isMesh) return;
    const geometry = child.geometry.index ? child.geometry.toNonIndexed() : child.geometry.clone();
    geometry.applyMatrix4(child.matrixWorld);
    if (!byMaterial.has(child.material)) byMaterial.set(child.material, []);
    byMaterial.get(child.material).push(geometry);
  });
  return [...byMaterial].map(([material, sources]) => {
    const geometry = mergeGeometries(sources); sources.forEach(source => source.dispose());
    return { material, geometry };
  });
}

export class MapScene {
  constructor(scene, map) {
    this.scene = scene; this.root = new THREE.Group(); this.parts = new Map(); this.batches = []; this.materials = new Map(); this.dirty = new Set();
    this.transform = new THREE.Object3D();
    this.lean = new THREE.Quaternion(); this.heading = new THREE.Quaternion(); this.euler = new THREE.Euler();
    this.up = new THREE.Vector3(0, 1, 0);
    const clipPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), .015);
    this.material = (color, clip = true) => {
      const key = `${color}:${clip}`;
      if (!this.materials.has(key)) this.materials.set(key, new THREE.MeshStandardMaterial({ color, roughness: .85, clippingPlanes: clip ? [clipPlane] : [] }));
      return this.materials.get(key);
    };
    const ground = new THREE.Group(), boxGeometry = new THREE.BoxGeometry(1, 1, 1);
    for (const surface of map.surfaces) {
      const mesh = new THREE.Mesh(boxGeometry, this.material(surface.color, false)); mesh.position.fromArray(surface.position); mesh.scale.fromArray(surface.size); ground.add(mesh);
    }
    for (const part of mergeByMaterial(ground)) {
      const mesh = new THREE.Mesh(part.geometry, part.material); mesh.receiveShadow = true; this.root.add(mesh);
    }
    boxGeometry.dispose();
    const prototypes = new Map();
    for (const item of map.items) {
      const { id, x, z, rotation, ...prototype } = item;
      const key = JSON.stringify(prototype);
      if (!prototypes.has(key)) prototypes.set(key, { item, members: [] });
      prototypes.get(key).members.push(item);
    }
    for (const { item, members } of prototypes.values()) {
      for (const part of mergeByMaterial(createModel(item, this.material))) {
        const batch = new THREE.InstancedMesh(part.geometry, part.material, members.length);
        batch.instanceMatrix.setUsage(THREE.DynamicDrawUsage); batch.castShadow = true; batch.receiveShadow = true; batch.frustumCulled = false;
        members.forEach((member, index) => {
          if (!this.parts.has(member.id)) this.parts.set(member.id, []);
          this.parts.get(member.id).push({ batch, index });
          this.transform.position.set(member.x, 0, member.z); this.transform.rotation.set(0, member.rotation, 0); this.transform.scale.setScalar(1); this.transform.updateMatrix(); batch.setMatrixAt(index, this.transform.matrix);
        });
        this.batches.push(batch); this.root.add(batch);
      }
    }
    scene.add(this.root);
  }
  pose(item, pose) {
    this.transform.position.set(pose.x, pose.y, pose.z);
    this.lean.setFromEuler(this.euler.set(pose.rx, 0, pose.rz)); this.heading.setFromAxisAngle(this.up, item.rotation);
    this.transform.quaternion.copy(this.lean).multiply(this.heading);
    this.transform.scale.setScalar(1); this.transform.updateMatrix();
    for (const { batch, index } of this.parts.get(item.id)) { batch.setMatrixAt(index, this.transform.matrix); this.dirty.add(batch); }
  }
  hide(item) {
    this.transform.scale.setScalar(0); this.transform.updateMatrix();
    for (const { batch, index } of this.parts.get(item.id)) { batch.setMatrixAt(index, this.transform.matrix); this.dirty.add(batch); }
  }
  flush() { for (const batch of this.dirty) batch.instanceMatrix.needsUpdate = true; this.dirty.clear(); }
  dispose() {
    this.scene.remove(this.root); this.root.traverse(mesh => { if (mesh.isMesh) { mesh.geometry.dispose(); if (mesh.isInstancedMesh) mesh.dispose(); } });
    for (const material of this.materials.values()) material.dispose();
  }
}
