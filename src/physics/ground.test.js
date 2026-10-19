import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Box, Vec3 } from 'cannon-es';
import { GROUND_THICKNESS, groundContacts, inOpening } from './ground.js';
import { getConvexHull } from './shapes.js';

function box(halfExtents, position) {
  const hull = getConvexHull(new Box(new Vec3(...halfExtents)));
  return { vertices: hull.vertices.map(vertex => vertex.vadd(new Vec3(...position))), edges: hull.edges, faces: hull.faces };
}

test('a prop wholly inside a circular aperture has no artificial ground supports', () => {
  const { vertices, edges, faces } = box([.3, .5, .3], [0, .499, 0]);
  assert.equal(groundContacts(vertices, edges, [{ x: 0, z: 0, radius: 1 }], faces).length, 0);
});

test('overlapping openings remove contacts on internal circle boundaries', () => {
  const holes = [{ x: -.6, z: 0, radius: 1 }, { x: .6, z: 0, radius: 1 }];
  const { vertices, edges, faces } = box([1.5, .5, .1], [0, .499, 0]);
  assert.ok(vertices.every(vertex => inOpening(vertex.x, vertex.z, holes)));
  assert.equal(groundContacts(vertices, edges, holes, faces).length, 0);
});

test('a concentric larger mouth removes the smaller mouth rim as support', () => {
  const { vertices, edges, faces } = box([1.2, .5, .2], [0, .499, 0]);
  const holes = [{ x: 0, z: 0, radius: .8 }, { x: 0, z: 0, radius: 2 }];
  assert.equal(groundContacts(vertices, edges, holes, faces).length, 0);
});

test('an edge crossing the solid gap between separate holes keeps exposed rim supports', () => {
  const vertices = [new Vec3(-1.5, -.002, 0), new Vec3(1.5, -.002, 0)];
  const holes = [{ x: -1, z: 0, radius: .75 }, { x: 1, z: 0, radius: .75 }];
  assert.ok(vertices.every(vertex => inOpening(vertex.x, vertex.z, holes)));
  const contacts = groundContacts(vertices, [[0, 1]], holes);
  assert.equal(contacts.length, 2);
  assert.ok(contacts.some(contact => Math.abs(contact.point.x + .25) < 1e-9));
  assert.ok(contacts.some(contact => Math.abs(contact.point.x - .25) < 1e-9));
  for (const contact of contacts) {
    assert.equal(contact.normal.y, 1);
    assert.ok(Math.abs(contact.depth - .002) < 1e-9);
  }
});

test('an oversized bridge retains support on both sides of a mouth', () => {
  const { vertices, edges, faces } = box([2, .5, .3], [0, .498, 0]);
  const contacts = groundContacts(vertices, edges, [{ x: 0, z: 0, radius: 1 }], faces);
  assert.ok(contacts.some(contact => contact.normal.y === 1 && contact.point.x < -.9));
  assert.ok(contacts.some(contact => contact.normal.y === 1 && contact.point.x > .9));
  assert.ok(contacts.every(contact => contact.depth < .003));
});

test('rim wall penetration pushes inward rather than toward the object center', () => {
  const contacts = groundContacts([new Vec3(1.02, -.06, 0)], [], [{ x: 0, z: 0, radius: 1 }]);
  assert.equal(contacts.length, 1);
  assert.deepEqual(contacts[0].normal.toArray(), [-1, 0, 0]);
  assert.ok(Math.abs(contacts[0].depth - .02) < 1e-9);
});

test('the slab underside pushes down and a fully cleared prop has no ground contact', () => {
  const belowSurface = groundContacts([new Vec3(2, -.05, 0)], [], []);
  assert.equal(belowSurface[0].normal.y, 1);
  const atUnderside = groundContacts([new Vec3(2, -GROUND_THICKNESS + .02, 0)], [], []);
  assert.equal(atUnderside[0].normal.y, -1);
  assert.ok(Math.abs(atUnderside[0].depth - .02) < 1e-9);
  const { vertices, edges, faces } = box([.3, .5, .3], [0, -GROUND_THICKNESS - .51, 0]);
  assert.equal(groundContacts(vertices, edges, [], faces).length, 0);
  assert.equal(groundContacts(vertices, edges, [{ x: 0, z: 0, radius: 1 }], faces).length, 0);
});

test('a wall intersection below the top rim cannot become an upward shelf', () => {
  const vertices = [new Vec3(.9, -.2, 0), new Vec3(1.1, 0, 0)];
  const contacts = groundContacts(vertices, [[0, 1]], [{ x: 0, z: 0, radius: 1 }]);
  const wall = contacts.find(contact => Math.abs(contact.point.y + .1) < 1e-9);
  assert.ok(wall);
  assert.equal(wall.normal.y, 0);
  assert.ok(wall.normal.x < 0);
});

test('a convex hull spanning solid ground is not missed when all vertices lie beyond the slab', () => {
  const { vertices, edges, faces } = box([.2, 1, .2], [3, .5, 0]);
  const contacts = groundContacts(vertices, edges, [{ x: 0, z: 0, radius: 1 }], faces);
  assert.ok(contacts.length > 0);
});

test('four openings around a footprint leave support on a solid island inside a convex face', () => {
  const { vertices, edges, faces } = box([1, .5, 1], [0, .499, 0]);
  const holes = [-1, 1].flatMap(x => [-1, 1].map(z => ({ x, z, radius: 1.1 })));
  assert.ok(vertices.every(vertex => inOpening(vertex.x, vertex.z, holes)));
  assert.equal(inOpening(0, 0, holes), false, 'the center of the lower face is on solid ground');
  const contacts = groundContacts(vertices, edges, holes, faces);
  assert.ok(contacts.some(contact => contact.normal.y === 1 && !inOpening(contact.point.x, contact.point.z, holes)));
});
