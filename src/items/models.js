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
  bench({ box }, item) {
    for (const k of [-.65, .65]) box('#788e88', k, .3, 0, .12, .6, .55);
    box(item.color, 0, .65, 0, 1.8, .16, .7); box(item.color, 0, 1, -.3, 1.8, .6, .12);
  },
  lamp({ shape, box }, item) {
    shape('cylinder', item.color, 0, 1.4, 0, .09, 2.8, .09);
    box(item.color, .25, 2.8, 0, .65, .12, .16); box('#fff0cc', .5, 2.7, 0, .4, .14, .3);
  },
  car({ shape, box }, item) {
    box(item.color, 0, .65, 0, 1.35, .65, 2.6); box(item.color, 0, 1.1, -.15, 1.2, .5, 1.35);
    box('#5f7d88', 0, 1.15, .54, 1.05, .38, .03); box('#5f7d88', 0, 1.15, -.84, 1.05, .38, .03);
    for (const k of [-1, 1]) {
      box('#64818a', k * .61, 1.14, -.15, .025, .33, 1.1);
      for (const j of [-.8, .8]) shape('cylinder', '#3e4d54', k * .68, .4, j, .29, .16, .29).rotation.z = Math.PI / 2;
      box('#fff0cc', k * .43, .7, 1.31, .28, .16, .03);
    }
  },
  building({ shape, box }, item) {
    const { width: w, depth: d, wallHeight: h, roof } = item.building;
    box(item.color, 0, h / 2, 0, w, h, d); box('#eee9dd', 0, h + .12, 0, w + .24, .25, d + .24);
    if (roof === 'gable') {
      const top = shape('roof', '#b67e73', 0, h + .75, 0, 1, 1, .95); top.rotation.y = Math.PI / 4;
      box('#eadfcd', .8, h + 1.1, -.6, .45, 1.5, .5);
    } else if (roof === 'flat') {
      box('#b9c6c4', .7, h + .5, -.5, 1.1, .6, .9);
    } else if (roof === 'awning') {
      box('#f4dec0', 0, 2.2, d / 2 + .45, w + .2, .15, 1);
      for (let i = 0; i < 7; i++) box(i % 2 ? '#f3e2cb' : '#ca8c7e', -1.5 + i * .5, 2.25, d / 2 + .45, .25, .17, 1);
    }
    const rows = roof === 'flat' ? Math.floor(h / 1.65) : 1;
    for (let row = 0; row < rows; row++) for (const col of [-1, 1]) {
      box('#70959e', col * w * .27, 1.7 + row * 1.55, d / 2 + .02, .7, .85, .04);
      box('#e8e2d2', col * w * .27, 1.28 + row * 1.55, d / 2 + .08, .9, .1, .18);
      box('#7899a0', w / 2 + .02, 1.7 + row * 1.55, col * d * .26, .04, .85, .7);
    }
    box('#6f8b8c', 0, .8, d / 2 + .03, .65, 1.6, .05);
  },
};

export function createModel(item, material) {
  const group = new THREE.Group();
  const shape = (kind, color, x, y, z, sx, sy, sz) => {
    const mesh = new THREE.Mesh(geometries[kind], material(color));
    mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz); group.add(mesh); return mesh;
  };
  const box = (...args) => shape('box', ...args);
  const builder = MODEL_BUILDERS[item.model];
  if (!builder) throw new Error(`物品模型未注册：${item.model}`);
  builder({ shape, box }, item); return group;
}
