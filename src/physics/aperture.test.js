import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sectionInOpenings } from './aperture.js';

test('two overlapping mouths cover a convex section even when neither covers it alone', () => {
  const points = [-.713, .359].flatMap(x => [-.5, .5].map(z => ({ x, z })));
  const holes = [-.35, .35].map(x => ({ x, z: 0, radius: .75 }));
  assert.ok(holes.every(hole => !sectionInOpenings(points, [hole], .004)));
  assert.equal(sectionInOpenings(points, holes, .004), true);
});

test('three exposed circle intersections on a polygon boundary retain its enclosed solid island', () => {
  const holes = [
    { x: 1, z: 0, radius: .9 },
    { x: -.5, z: Math.sqrt(3) / 2, radius: .9 },
    { x: -.5, z: -Math.sqrt(3) / 2, radius: .9 },
  ];
  const extent = .5 - Math.sqrt(.9 ** 2 - .75);
  const points = [{ x: -extent, z: 0 }, { x: extent / 2, z: extent * Math.sqrt(3) / 2 }, { x: extent / 2, z: -extent * Math.sqrt(3) / 2 }];
  for (let i = 0; i < points.length; i++) {
    assert.equal(sectionInOpenings([points[i], points[(i + 1) % points.length]], holes), true, 'each chord is covered');
  }
  assert.equal(sectionInOpenings([{ x: 0, z: 0 }], holes), false);
  assert.equal(sectionInOpenings(points, holes), false, 'boundary vertices count when detecting a solid island');
});

test('four mouths with covered edges do not erase the solid island at their center', () => {
  const points = [-1, 1].flatMap(x => [-1, 1].map(z => ({ x, z })));
  const holes = points.map(point => ({ ...point, radius: 1.1 }));
  assert.equal(sectionInOpenings(points, holes), false);
  assert.equal(sectionInOpenings(points, [...holes, { x: 0, z: 0, radius: .8 }]), true, 'a fifth covering disk removes the island');
});

test('coincident circles, tangent intervals, and degenerate sections remain finite', () => {
  const line = [{ x: -1, z: 0 }, { x: 0, z: 0 }, { x: 1, z: 0 }];
  const holes = [-.5, .5].map(x => ({ x, z: 0, radius: .5 }));
  assert.equal(sectionInOpenings(line, holes), true);
  assert.equal(sectionInOpenings(line, holes, .001), false, 'a real gap cannot be bridged by sampling');
  assert.equal(sectionInOpenings([{ x: 0, z: 0 }], [{ x: 0, z: 0, radius: 1 }, { x: 0, z: 0, radius: 1 }]), true);
  assert.equal(sectionInOpenings([], holes), false);
});
