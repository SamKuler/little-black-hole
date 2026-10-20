// The full visible envelope clears y=-.31 before authoritative completion.
// Reach black slightly earlier, without delaying scoring or inventing motion.
export const ABYSS_FADE_DEPTH = .3;

export function fadeAbyssFragment(shader, worldY) {
  // Fade the final displayed RGB, not just diffuse light. Emission, exposure,
  // sky fog and dithering must not reveal a bright object or the shaft bottom.
  // Alpha/depth remain opaque: this is darkness, not transparent geometry.
  shader.fragmentShader = shader.fragmentShader.replace('#include <dithering_fragment>', `
    #include <dithering_fragment>
    float abyssLight = 1.0 - smoothstep(0.0, ${ABYSS_FADE_DEPTH.toFixed(2)}, -${worldY});
    gl_FragColor.rgb *= abyssLight;
  `);
}

// Item materials are shared by instanced props. World-space fragment height
// keeps a resting neighbor bright and a tilted roof visible above the mouth.
export function applyAbyssFade(material) {
  material.onBeforeCompile = shader => {
    shader.vertexShader = `varying float vAbyssWorldY;\n${shader.vertexShader}`;
    shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', `
      #include <project_vertex>
      vec4 abyssWorldPosition = vec4(transformed, 1.0);
      #ifdef USE_BATCHING
        abyssWorldPosition = batchingMatrix * abyssWorldPosition;
      #endif
      #ifdef USE_INSTANCING
        abyssWorldPosition = instanceMatrix * abyssWorldPosition;
      #endif
      vAbyssWorldY = (modelMatrix * abyssWorldPosition).y;
    `);
    shader.fragmentShader = `varying float vAbyssWorldY;\n${shader.fragmentShader}`;
    fadeAbyssFragment(shader, 'vAbyssWorldY');
  };
  material.customProgramCacheKey = () => 'abyss-prop-v1';
  material.needsUpdate = true;
  return material;
}
