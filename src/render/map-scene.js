import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createModel } from '../items/models.js';
import { ApertureMask } from './apertures.js';

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
    this.apertures = new ApertureMask();
    this.depthMaterial = this.apertures.apply(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }));
    this.distanceMaterial = this.apertures.apply(new THREE.MeshDistanceMaterial());
    this.material = (color, item = true, emission = 0) => {
      const key = `${color}:${item}:${emission}`;
      if (!this.materials.has(key)) {
        const material = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: emission, roughness: .85 });
        if (!item) this.apertures.apply(material);
        this.materials.set(key, material);
      }
      return this.materials.get(key);
    };
    const ground = new THREE.Group(), boxGeometry = new THREE.BoxGeometry(1, 1, 1);
    for (const surface of map.surfaces) {
      const geometry = surface.points
        ? new THREE.ShapeGeometry(new THREE.Shape(surface.points.map(([x, z]) => new THREE.Vector2(x, -z)))).rotateX(-Math.PI / 2)
        : boxGeometry;
      const mesh = new THREE.Mesh(geometry, this.material(surface.color, false, surface.emission));
      mesh.position.fromArray(surface.position); mesh.scale.set(surface.size[0], surface.points ? 1 : surface.size[1], surface.size[2]); ground.add(mesh);
    }
    for (const part of mergeByMaterial(ground)) {
      const mesh = new THREE.Mesh(part.geometry, part.material); mesh.receiveShadow = true;
      mesh.customDepthMaterial = this.depthMaterial; mesh.customDistanceMaterial = this.distanceMaterial;
      this.root.add(mesh);
    }
    ground.traverse(mesh => { if (mesh.isMesh && mesh.geometry !== boxGeometry) mesh.geometry.dispose(); });
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
  setHoles(holes) { this.apertures.setHoles(holes); }
  pose(item, pose) {
    this.transform.position.set(pose.x, pose.y, pose.z);
    if (pose.q) this.transform.quaternion.fromArray(pose.q);
    else {
      this.lean.setFromEuler(this.euler.set(pose.rx ?? 0, 0, pose.rz ?? 0)); this.heading.setFromAxisAngle(this.up, item.rotation);
      this.transform.quaternion.copy(this.lean).multiply(this.heading);
    }
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
    this.depthMaterial.dispose(); this.distanceMaterial.dispose();
  }
}
