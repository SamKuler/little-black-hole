import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createMapPicker } from './map-picker.js';

const choices = [{ id: 'town', label: '悠闲小镇', preview: '/maps/town.jpg' }, { id: 'forest', label: '秘境森林', preview: '/maps/forest.jpg' }, { id: 'cyberpunk', label: '霓虹都市', preview: '/maps/cyberpunk.jpg' }];
function setup(onChange = () => {}, maps = choices) {
  const { window } = new JSDOM('<div id="map-picker"></div>');
  // jsdom supplies real DOM and radio behavior; native popover dismissal is browser-tested.
  let dismissed = 0;
  window.HTMLElement.prototype.hidePopover = () => { dismissed++; };
  const root = window.document.querySelector('#map-picker');
  const picker = createMapPicker(root, maps, onChange);
  const inputs = [...root.querySelectorAll('input')];
  const change = index => { inputs[index].checked = true; inputs[index].dispatchEvent(new window.Event('change')); };
  return { root, picker, inputs, change, dismissed: () => dismissed, selected: () => inputs.filter(input => input.checked).map(input => input.value) };
}

test('map browser exposes the current map and a named native-radio list with actual previews', () => {
  const { root, selected } = setup();
  const trigger = root.querySelector('.map-trigger'), panel = root.querySelector('[popover]');
  assert.equal(trigger.getAttribute('popovertarget'), panel.id);
  assert.equal(trigger.getAttribute('aria-label'), '选择地图，当前悠闲小镇');
  const group = root.querySelector('[role=radiogroup]');
  assert.equal(root.querySelector(`#${group.getAttribute('aria-labelledby')}`).textContent, '选择地图');
  assert.deepEqual([...group.querySelectorAll('img')].map(image => image.getAttribute('src')), choices.map(choice => choice.preview));
  assert.deepEqual(selected(), ['town']);
});

test('selecting a different map updates the trigger, closes the picker, and notifies once', () => {
  const changes = [], { root, change, selected, dismissed } = setup(value => changes.push(value));
  change(1); change(1); change(2);
  assert.deepEqual(changes, ['forest', 'cyberpunk']);
  assert.deepEqual(selected(), ['cyberpunk']);
  assert.equal(root.querySelector('.map-trigger span').textContent, '霓虹都市');
  assert.equal(dismissed(), 2);
});

test('snapshots update the selection silently and preserve an open browser', () => {
  const changes = [], { root, picker, selected, dismissed } = setup(value => changes.push(value));
  assert.equal(picker.setValue('forest'), true); assert.equal(picker.setValue('unknown'), false);
  assert.deepEqual(selected(), ['forest']); assert.deepEqual(changes, []); assert.equal(dismissed(), 0);
  assert.equal(root.querySelector('.map-trigger img').getAttribute('src'), '/maps/forest.jpg');
});

test('guests cannot change maps and a rejected host change restores the trigger and selection', () => {
  const changes = [], { root, picker, inputs, change, selected } = setup(value => { changes.push(value); return false; });
  picker.setDisabled(true); assert.ok(inputs.every(input => input.disabled)); assert.ok(root.querySelector('.map-trigger').disabled);
  change(1); assert.deepEqual(changes, []); assert.deepEqual(selected(), ['town']);
  picker.setDisabled(false); change(2);
  assert.deepEqual(changes, ['cyberpunk']); assert.deepEqual(selected(), ['town']);
  assert.equal(root.querySelector('.map-trigger span').textContent, '悠闲小镇');
});

test('a large map catalog uses the same single trigger and scrollable native selection list', () => {
  const maps = Array.from({ length: 40 }, (_, index) => ({ id: `map-${index}`, label: `地图 ${index}`, preview: '/maps/town.jpg' }));
  const changes = [], { root, picker, change, selected } = setup(value => changes.push(value), maps);
  assert.equal(root.querySelectorAll('.map-trigger').length, 1);
  assert.equal(root.querySelectorAll('.map-option').length, 40);
  change(39); assert.deepEqual(selected(), ['map-39']); assert.deepEqual(changes, ['map-39']);
  picker.setValue('map-12'); assert.deepEqual(selected(), ['map-12']);
});
