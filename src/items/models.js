import * as THREE from 'three';

const geometries = {
  box: new THREE.BoxGeometry(1, 1, 1),
  sphere: new THREE.IcosahedronGeometry(1, 0),
  cylinder: new THREE.CylinderGeometry(1, 1, 1, 10),
  cone: new THREE.ConeGeometry(1, 1, 10),
  roof: new THREE.CylinderGeometry(0, 2.7, 1.8, 4),
};

// A builder receives one item definition; maps never participate in model drawing.
export const MODEL_BUILDERS = {
  stone({ shape }, item) { shape('sphere', item.color, 0, .23, 0, item.radius, .35, item.radius); },
  bush({ shape }, item) { shape('sphere', item.color, 0, .48, 0, item.radius, .65, item.radius); },
  cone({ shape, box }, item) {
    box('#f4e9cf', 0, .08, 0, .55, .16, .55); shape('cone', item.color, 0, .45, 0, .26, .8, .26);
    shape('cylinder', '#fff0d6', 0, .45, 0, .16, .16, .16);
  },
  mushroom({ shape }, item) {
    shape('cylinder', '#f4e9cf', 0, .2, 0, .09, .4, .09);
    shape('sphere', item.color, 0, .52, 0, .44, .25, .44);
    for (const [x, z] of [[-.16, .13], [.18, .1], [0, -.19]]) {
      shape('sphere', '#f4e9cf', x, .69, z, .07, .04, .07);
    }
  },
  log({ shape, box }, item) {
    shape('cylinder', item.color, 0, .35, 0, .34, 1.7, .34).rotation.z = Math.PI / 2;
    for (const x of [-.86, .86]) {
      shape('cylinder', '#cbb48b', x, .35, 0, .29, .03, .29).rotation.z = Math.PI / 2;
    }
    box('#6e9d89', -.08, .66, 0, .85, .08, .22);
  },
  boulder({ shape }, item) {
    shape('sphere', item.color, 0, 1.05, 0, 1.65, 1.05, 1.4);
    shape('sphere', item.color, .7, .55, .3, .8, .55, .65);
    shape('sphere', '#6e9d89', -.4, 1.83, .05, .75, .2, .65);
  },
  tree({ shape, box }, item) {
    box('#a58b6f', 0, 1, 0, .32, 2, .32);
    shape('sphere', item.color, 0, 2.35, 0, 1.15, 1.4, 1.15);
    shape('sphere', '#8ab696', .4, 3, .1, .8, .8, .8);
  },
  pine({ shape, box }, item) {
    box('#a58b6f', 0, .8, 0, .3, 1.6, .3);
    shape('cone', item.color, 0, 1.85, 0, 1.1, 2.5, 1.1);
    shape('cone', '#85b29a', 0, 2.7, 0, .82, 1.8, .82);
  },
  ancientTree({ shape, box }, item) {
    shape('cylinder', '#846747', 0, 2.2, 0, .55, 4.4, .55);
    shape('cone', '#846747', 0, .6, 0, 1.15, 1.2, 1.15);
    for (const side of [-1, 1]) {
      box('#846747', side * .6, 3.7, 0, .34, 2.1, .34).rotation.z = -side * .6;
    }
    shape('sphere', item.color, 0, 5.3, 0, 2.8, 1.65, 2.8);
    shape('sphere', '#78a989', 1.3, 6.25, .1, 1.6, 1.15, 1.6);
    shape('sphere', item.color, -1.2, 5.8, -.55, 1.7, 1.3, 1.7);
  },
  bench({ box }, item) {
    for (const k of [-.65, .65]) box('#788e88', k, .3, 0, .12, .6, .55);
    box(item.color, 0, .65, 0, 1.8, .16, .7); box(item.color, 0, 1, -.3, 1.8, .6, .12);
  },
  lamp({ shape, box }, item) {
    shape('cylinder', item.color, 0, 1.4, 0, .09, 2.8, .09);
    box(item.color, .25, 2.8, 0, .65, .12, .16); box('#fff0cc', .5, 2.7, 0, .4, .14, .3);
  },
  neonCrate({ box, glow }, item) {
    box(item.color, 0, .29, 0, .6, .58, .6);
    glow(item.accent, 0, .59, 0, .61, .05, .1);
    for (const x of [-.21, .21]) glow(item.accent, x, .3, .306, .055, .48, .025);
    glow(item.accent, 0, .3, .306, .44, .055, .025);
  },
  terminal({ box, glow }, item) {
    box(item.color, 0, .075, 0, 1.1, .15, 1.1);
    box(item.color, 0, .6, 0, .5, .9, .55);
    box(item.color, 0, 1.3, 0, 1.12, .7, .7);
    glow(item.accent, 0, 1.34, .365, 1, .48, .03);
    box(item.color, -.14, 1.4, .385, .52, .055, .015);
    box(item.color, -.22, 1.26, .385, .36, .055, .015);
    glow('#ee63d8', 0, .83, .29, .34, .06, .06);
  },
  neonSign({ shape, box, glow }, item) {
    box(item.color, 0, .075, 0, .7, .15, .7);
    shape('cylinder', item.color, 0, 1.4, 0, .09, 2.8, .09);
    box(item.color, 0, 2.35, 0, 1.6, 1.65, .3);
    for (const x of [-.76, .76]) glow(item.accent, x, 2.35, .17, .06, 1.65, .05);
    for (const y of [1.6, 3.1]) glow(item.accent, 0, y, .17, 1.5, .06, .05);
    glow('#4ff4e8', -.22, 2.35, .17, .12, .95, .05);
    for (const y of [2, 2.35, 2.7]) glow('#4ff4e8', .1, y, .17, .52, .09, .05);
  },
  car({ shape, box, glow }, item) {
    const lift = item.hover ? .2 : 0;
    const glass = item.glassColor ?? '#5f7d88', frame = item.frameColor ?? '#64818a', light = item.lightColor ?? '#fff0cc';
    box(item.color, 0, .65 + lift, 0, 1.35, .65, 2.6); box(item.color, 0, 1.1 + lift, -.15, 1.2, .5, 1.35);
    box(glass, 0, 1.15 + lift, .54, 1.05, .38, .03); box(glass, 0, 1.15 + lift, -.84, 1.05, .38, .03);
    for (const k of [-1, 1]) {
      box(frame, k * .61, 1.14 + lift, -.15, .025, .33, 1.1);
      for (const j of [-.8, .8]) {
        if (item.hover) shape('cylinder', light, k * .67, .38, j, .23, .12, .23);
        else shape('cylinder', '#3e4d54', k * .68, .4, j, .29, .16, .29).rotation.z = Math.PI / 2;
      }
      (item.hover ? glow : box)(light, k * .43, .7 + lift, 1.31, .28, .16, .03);
      if (item.hover) glow(light, k * .68, .69, -.15, .05, .07, 2.25);
    }
  },
  building({ shape, box, glow }, item) {
    const { width: w, depth: d, wallHeight: h, roof, style } = item.building;
    const windowBox = style === 'neon' ? glow : box;
    const trim = item.trimColor ?? '#eee9dd', glass = item.glassColor ?? '#70959e';
    box(item.color, 0, h / 2, 0, w, h, d); box(trim, 0, h + .12, 0, w + .24, .25, d + .24);
    if (roof === 'gable') {
      const top = shape('roof', item.roofColor ?? '#b67e73', 0, h + .75, 0, 1, 1, .95); top.rotation.y = Math.PI / 4;
      box(item.trimColor ?? '#eadfcd', .8, h + 1.1, -.6, .45, 1.5, .5);
    } else if (roof === 'flat') {
      box(item.trimColor ?? '#b9c6c4', .7, h + .5, -.5, 1.1, .6, .9);
    } else if (roof === 'awning') {
      box('#f4dec0', 0, 2.2, d / 2 + .45, w + .2, .15, 1);
      for (let i = 0; i < 7; i++) box(i % 2 ? '#f3e2cb' : '#ca8c7e', -1.5 + i * .5, 2.25, d / 2 + .45, .25, .17, 1);
    }
    const rows = roof === 'flat' ? Math.floor(h / 1.65) : 1;
    for (let row = 0; row < rows; row++) for (const col of [-1, 1]) {
      windowBox(glass, col * w * .27, 1.7 + row * 1.55, d / 2 + .02, .7, .85, .04);
      box(item.trimColor ?? '#e8e2d2', col * w * .27, 1.28 + row * 1.55, d / 2 + .08, .9, .1, .18);
      windowBox(item.glassColor ?? '#7899a0', w / 2 + .02, 1.7 + row * 1.55, col * d * .26, .04, .85, .7);
    }
    box(item.doorColor ?? '#6f8b8c', 0, .8, d / 2 + .03, .65, 1.6, .05);
    if (style === 'timber') {
      for (const x of [-1, 1]) box('#846747', x * (w / 2 - .08), h / 2, d / 2 + .035, .16, h, .1);
      for (const y of [.35, .75, 1.15, 1.55, 1.95, 2.35]) box('#846747', 0, y, -d / 2 - .025, w, .05, .05);
    } else if (style === 'neon') {
      for (const x of [-1, 1]) glow(item.accent, x * (w / 2 - .08), h / 2, d / 2 + .05, .1, h, .06);
      glow(item.accent, 0, h + .15, d / 2 + .15, w + .1, .12, .08);
      glow(item.accent, w / 2 + .15, h + .15, 0, .08, .12, d + .1);
      box(glass, -.55, h + .44, -.5, .14, .38, .14);
    }
  },
};

export function createModel(item, material) {
  const group = new THREE.Group();
  const shape = (kind, color, x, y, z, sx, sy, sz, emission = 0) => {
    const mesh = new THREE.Mesh(geometries[kind], material(color, true, emission));
    mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz); group.add(mesh); return mesh;
  };
  const box = (...args) => shape('box', ...args);
  const glow = (...args) => shape('box', ...args, 1.3);
  const builder = MODEL_BUILDERS[item.model];
  if (!builder) throw new Error(`物品模型未注册：${item.model}`);
  builder({ shape, box, glow }, item); return group;
}
