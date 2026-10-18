import { townMap } from './town.js';
import { instantiateItem } from '../items/catalog.js';

export const MAPS = { [townMap.id]: townMap };
export const DEFAULT_MAP = townMap.id;

export function createMap(id, seed, maps = MAPS, catalog) {
  const definition = maps[id];
  if (!definition) throw new Error(`未知地图：${id}`);
  const { placements, surfaces } = definition.create(seed);
  return { ...definition, surfaces, items: placements.map((item, index) => instantiateItem(item, index, seed, catalog)) };
}
