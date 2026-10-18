import { fitsHole } from '../rules.js';

// Dimensions describe the rigid model in world units; radius is its ground footprint.
export const ITEM_CATALOG = {
  stone: { name: '石子', model: 'stone', radius: .4, mass: 2, height: .6, color: '#ccd1c2' },
  cone: { name: '路锥', model: 'cone', radius: .4, mass: 2, height: .9, color: '#e99c64' },
  bush: { name: '灌木', model: 'bush', radius: .4, mass: 2, height: 1.13, color: '#6fa185' },
  tree: { name: '树木', model: 'tree', radius: 1.2, mass: 9, height: 3.8, color: '#78a989' },
  pine: { name: '松树', model: 'pine', radius: 1.15, mass: 9, height: 3.6, color: '#6e9d89' },
  bench: { name: '长椅', model: 'bench', radius: 1, mass: 6, height: 1.3, color: '#c39b75' },
  lamp: { name: '路灯', model: 'lamp', radius: .73, mass: 3, height: 2.9, color: '#647d80' },
  car: { name: '汽车', model: 'car', radius: 1.65, mass: 16, height: 1.4, color: '#e5b878' },
  house: { name: '房屋', model: 'building', radius: 2.7, mass: 38, height: 5.55, color: '#e4c8a6', building: { width: 3.5, depth: 3.3, wallHeight: 3.6, roof: 'gable' } },
  shop: { name: '商店', model: 'building', radius: 3.2, mass: 38, height: 3.5, color: '#dcae9e', building: { width: 3.5, depth: 3.3, wallHeight: 3.2, roof: 'awning' } },
  tower: { name: '大楼', model: 'building', radius: 3.6, mass: 70, height: 9.5, color: '#c8c1d6', building: { width: 4.8, depth: 4.6, wallHeight: 8.7, roof: 'flat' } },
};

export function instantiateItem(placement, id, seed, catalog = ITEM_CATALOG) {
  const definition = catalog[placement.type];
  if (!definition) throw new Error(`地图使用了未知物品：${placement.type}`);
  const variation = ((Math.imul(seed ^ (id + 1), 1597334677) >>> 0) % 1000) / 1000;
  return { ...definition, ...placement, id, rotation: placement.rotation ?? (definition.model === 'car' ? (variation > .5 ? Math.PI / 2 : 0) : variation * .14 - .07) };
}

export function availableItemNames(items, radius) {
  const types = new Map(items.filter(item => fitsHole(radius, item)).map(item => [item.type, item]));
  return [...types.values()].sort((a, b) => b.radius - a.radius).slice(0, 3).map(item => item.name).join('、');
}
