import * as THREE from 'three';

export const MAX_HOLES = 4;
const bindings = new WeakMap();

// One mutable uniform set is shared by every ground layer and shadow pass.
// Moving a mouth only changes uniforms, never geometry or shader programs.
export class ApertureMask {
  constructor() {
    this.uniforms = {
      holeCount: { value: 0 },
      holeCircles: { value: Array.from({ length: MAX_HOLES }, () => new THREE.Vector3()) },
    };
  }

  setHoles(holes) {
    if (holes.length > MAX_HOLES) throw new RangeError(`At most ${MAX_HOLES} holes can be rendered`);
    for (const hole of holes) {
      if (![hole.x, hole.z, hole.radius].every(Number.isFinite) || hole.radius <= 0) {
        throw new TypeError('A hole needs finite x/z coordinates and a positive radius');
      }
    }
    this.uniforms.holeCount.value = holes.length;
    for (let i = 0; i < MAX_HOLES; i++) {
      const hole = holes[i];
      this.uniforms.holeCircles.value[i].set(hole?.x ?? 0, hole?.z ?? 0, hole?.radius ?? 0);
    }
  }

  apply(material, { well = false, interior = false } = {}) {
    interior ||= well;
    const kind = well ? 'well' : interior ? 'interior' : 'ground';
    let binding = bindings.get(material);
    const changedProgram = !binding || binding.kind !== kind;
    if (!binding) {
      binding = { compiledUniforms: new Set() };
      bindings.set(material, binding);
    }
    binding.mask = this; binding.kind = kind;
    // Three can reuse a material's program without calling onBeforeCompile,
    // even after needsUpdate. Rebind already-compiled uniforms on map changes.
    for (const uniforms of binding.compiledUniforms) Object.assign(uniforms, this.uniforms);
    material.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, binding.mask.uniforms);
      binding.compiledUniforms.add(shader.uniforms);
      const originVarying = well ? 'varying vec3 vHoleOriginAndRadius;' : '';
      const interiorVarying = interior ? 'varying vec3 vHoleWorldPosition;' : '';
      shader.vertexShader = `varying vec2 vHoleWorldXZ;\n${originVarying}\n${interiorVarying}\n${shader.vertexShader}`;
      shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', `
        #include <project_vertex>
        vec4 holeWorldPosition = vec4(transformed, 1.0);
        #ifdef USE_BATCHING
          holeWorldPosition = batchingMatrix * holeWorldPosition;
        #endif
        #ifdef USE_INSTANCING
          holeWorldPosition = instanceMatrix * holeWorldPosition;
        #endif
        vHoleWorldXZ = (modelMatrix * holeWorldPosition).xz;
        ${interior ? 'vHoleWorldPosition = (modelMatrix * holeWorldPosition).xyz;' : ''}
        ${well ? 'vHoleOriginAndRadius = vec3(modelMatrix[3].xz, length(modelMatrix[0].xyz));' : ''}
      `);
      shader.fragmentShader = `
        uniform int holeCount;
        uniform vec3 holeCircles[${MAX_HOLES}];
        varying vec2 vHoleWorldXZ;
        ${originVarying}
        ${interiorVarying}
        ${shader.fragmentShader}
      `;
      shader.fragmentShader = shader.fragmentShader.replace('#include <clipping_planes_fragment>', `
        #include <clipping_planes_fragment>
        ${interior ? `
          // A recessed shaft is visible only through a ground-level mouth.
          // Finite map sides cannot otherwise hide its lower walls and floor.
          // Orthographic rays are parallel, not cameraPosition - fragment.
          vec3 holeViewRay = isOrthographic
            ? vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2])
            : cameraPosition - vHoleWorldPosition;
          if (holeViewRay.y <= 0.0) discard;
          vec2 holeEntryXZ = vHoleWorldPosition.xz
            - holeViewRay.xz * (vHoleWorldPosition.y / holeViewRay.y);
          bool throughMouth = false;
          for (int holeIndex = 0; holeIndex < ${MAX_HOLES}; holeIndex++) {
            if (holeIndex >= holeCount) break;
            vec3 holeCircle = holeCircles[holeIndex];
            vec2 entryDelta = holeEntryXZ - holeCircle.xy;
            if (dot(entryDelta, entryDelta) < holeCircle.z * holeCircle.z) throughMouth = true;
          }
          if (!throughMouth) discard;
        ` : ''}
        ${!interior || well ? `
        for (int holeIndex = 0; holeIndex < ${MAX_HOLES}; holeIndex++) {
          if (holeIndex >= holeCount) break;
          vec3 holeCircle = holeCircles[holeIndex];
          ${well ? `
            // Keep this shaft's own wall, but remove internal walls where two
            // mouths overlap. The radius check handles concentric mouths too.
            if (distance(holeCircle, vHoleOriginAndRadius) < 0.00001) continue;
          ` : ''}
          vec2 holeDelta = vHoleWorldXZ - holeCircle.xy;
          if (dot(holeDelta, holeDelta) < holeCircle.z * holeCircle.z) discard;
        }
        ` : ''}
      `);
    };
    material.customProgramCacheKey = () => `circular-apertures-v2-${MAX_HOLES}-${kind}`;
    if (changedProgram) material.needsUpdate = true;
    return material;
  }
}
