import * as THREE from 'three';

// The mouth has no horizontal cap at ground height. Its depth-writing interior
// starts below the ground, so full-size objects remain visible while entering.
export function createHoleVisual(color = '#a68add') {
  const visual = new THREE.Group();
  const well = new THREE.Mesh(
    new THREE.CylinderGeometry(1, 1, 8, 96, 1, true),
    new THREE.MeshBasicMaterial({ color: '#171520', side: THREE.BackSide, fog: false }),
  );
  well.name = 'well'; well.position.y = -4; visual.add(well);
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(1, 96),
    new THREE.MeshBasicMaterial({ color: '#0d0c13', fog: false }),
  );
  floor.name = 'floor'; floor.rotation.x = -Math.PI / 2; floor.position.y = -8; visual.add(floor);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.025, .025, 8, 96),
    new THREE.MeshStandardMaterial({ color, roughness: .85 }),
  );
  ring.name = 'ring'; ring.rotation.x = -Math.PI / 2; ring.position.y = .08; visual.add(ring);
  const outerRing = new THREE.Mesh(
    new THREE.RingGeometry(1.06, 1.1, 96),
    new THREE.MeshBasicMaterial({ color: '#c2b0e4', transparent: true, opacity: .55, depthWrite: false, side: THREE.DoubleSide }),
  );
  outerRing.name = 'outerRing'; outerRing.rotation.x = -Math.PI / 2; outerRing.position.y = .08; visual.add(outerRing);
  return visual;
}

// Call after a map change and for each new visual. A map owns the shared mask;
// each visual owns its geometry/materials, so create rather than clone visuals.
export function setHoleApertureMask(visual, apertures) {
  apertures.apply(visual.getObjectByName('well').material, { well: true });
}

export function disposeHoleVisual(visual) {
  visual.removeFromParent();
  visual.traverse(mesh => {
    if (!mesh.isMesh) return;
    mesh.geometry.dispose(); mesh.material.dispose();
  });
}
