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

  apply(material, { well = false } = {}) {
    let binding = bindings.get(material);
    const changedProgram = !binding || binding.well !== well;
    if (!binding) {
      binding = { compiledUniforms: new Set() };
      bindings.set(material, binding);
    }
    binding.mask = this; binding.well = well;
    // Three can reuse a material's program without calling onBeforeCompile,
    // even after needsUpdate. Rebind already-compiled uniforms on map changes.
    for (const uniforms of binding.compiledUniforms) Object.assign(uniforms, this.uniforms);
    material.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, binding.mask.uniforms);
      binding.compiledUniforms.add(shader.uniforms);
      const originVarying = well ? 'varying vec3 vHoleOriginAndRadius;' : '';
      shader.vertexShader = `varying vec2 vHoleWorldXZ;\n${originVarying}\n${shader.vertexShader}`;
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
        ${well ? 'vHoleOriginAndRadius = vec3(modelMatrix[3].xz, length(modelMatrix[0].xyz));' : ''}
      `);
      shader.fragmentShader = `
        uniform int holeCount;
        uniform vec3 holeCircles[${MAX_HOLES}];
        varying vec2 vHoleWorldXZ;
        ${originVarying}
        ${shader.fragmentShader}
      `;
      shader.fragmentShader = shader.fragmentShader.replace('#include <clipping_planes_fragment>', `
        #include <clipping_planes_fragment>
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
      `);
    };
    material.customProgramCacheKey = () => `circular-apertures-v1-${MAX_HOLES}-${well ? 'well' : 'ground'}`;
    if (changedProgram) material.needsUpdate = true;
    return material;
  }
}
