import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMapPicker } from './map-picker.js';

// Exercise selection events and state without replacing the browser's radio behavior.
class Element {
  children = []; listeners = {};
  append(...children) { this.children.push(...children); }
  addEventListener(type, listener) { this.listeners[type] = listener; }
  change() { this.checked = true; this.listeners.change(); }
}
const choices = [{ id: 'town', label: '小镇' }, { id: 'forest', label: '森林' }, { id: 'cyberpunk', label: '霓虹' }];
function setup(onChange = () => {}) {
  const root = new Element(); root.id = 'map-picker'; root.ownerDocument = { createElement: () => new Element() };
  const picker = createMapPicker(root, choices, onChange);
  const inputs = root.children.map(label => label.children[0]);
  return { root, picker, inputs, selected: () => inputs.filter(input => input.checked).map(input => input.value) };
}

test('compact map choices use labeled native radios in a single named group', () => {
  const { root, inputs, selected } = setup();
  assert.deepEqual(inputs.map(input => input.type), ['radio', 'radio', 'radio']);
  assert.ok(inputs.every(input => input.name === root.id));
  assert.deepEqual(root.children.map(label => label.children[1].textContent), ['小镇', '森林', '霓虹']);
  assert.deepEqual(selected(), ['town']);
});

test('map changes select exactly one choice and repeated selection is a no-op', () => {
  const changes = [], { inputs, selected } = setup(value => changes.push(value));
  inputs[1].change(); inputs[1].change(); inputs[2].change();
  assert.deepEqual(changes, ['forest', 'cyberpunk']);
  assert.deepEqual(selected(), ['cyberpunk']);
});

test('snapshot selection is silent and an unknown map leaves the current choice intact', () => {
  const changes = [], { picker, selected } = setup(value => changes.push(value));
  assert.equal(picker.setValue('forest'), true);
  assert.equal(picker.setValue('unknown'), false);
  assert.deepEqual(selected(), ['forest']);
  assert.deepEqual(changes, []);
});

test('read-only guests cannot trigger a map change and host rejection restores selection', () => {
  const changes = [], { picker, inputs, selected } = setup(value => { changes.push(value); return false; });
  picker.setDisabled(true);
  assert.ok(inputs.every(input => input.disabled));
  inputs[1].change();
  assert.deepEqual(changes, []);
  assert.deepEqual(selected(), ['town']);
  picker.setValue('town'); picker.setDisabled(false);
  inputs[2].change();
  assert.deepEqual(changes, ['cyberpunk']);
  assert.deepEqual(selected(), ['town']);
});
