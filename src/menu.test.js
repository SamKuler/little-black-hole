import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Read the static template's nesting without introducing a browser dependency.
// These checks protect the shared menu structure; visual checks remain separate.
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const elements = [], stack = [];
const voidTags = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
for (const match of html.matchAll(/<(\/?)\s*([a-z][\w-]*)\b([^>]*)>/gi)) {
  const [, closing, tag, attributes] = match;
  if (closing) { assert.equal(stack.pop()?.tag, tag, `balanced closing ${tag}`); continue; }
  const attrs = Object.fromEntries([...attributes.matchAll(/([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)].map(([, key, double, single, bare]) => [key, double ?? single ?? bare ?? '']));
  const element = { tag, attrs, parent: stack.at(-1) }; elements.push(element);
  if (!voidTags.has(tag) && !attributes.trimEnd().endsWith('/')) stack.push(element);
}
assert.equal(stack.length, 0, 'the menu template closes all non-void elements');
const byId = id => elements.find(element => element.attrs.id === id);
const hasClass = (element, name) => element.attrs.class?.split(/\s+/).includes(name);
const within = (element, ancestor) => {
  for (let parent = element?.parent; parent; parent = parent.parent) if (parent === ancestor) return true;
  return false;
};

test('home and lobby keep headings outside their scrollable content', () => {
  for (const id of ['intro', 'room-panel']) {
    const menu = byId(id), content = elements.find(element => element.parent === menu && hasClass(element, 'menu-content'));
    assert.ok(content, `${id} has a shared scrollable content area`);
    assert.ok(elements.some(element => element.parent === menu && element.tag === 'h1'), `${id} retains its heading`);
    assert.ok(elements.some(element => element.parent === menu && hasClass(element, 'intro-dot')), `${id} retains its heading accent`);
    for (const child of id === 'intro' ? ['map-picker', 'start', 'network-form'] : ['room-map-picker', 'lobby-players', 'room-start']) {
      assert.ok(within(byId(child), content), `${child} stays in the scrollable content area`);
    }
  }
  assert.ok(elements.some(element => element.parent === byId('intro') && hasClass(element, 'mode-picker')));
});

test('home and host lobby provide matching map-browser mount points', () => {
  for (const id of ['map-picker', 'room-map-picker']) {
    const picker = byId(id);
    assert.ok(hasClass(picker.parent, 'map-selection'));
    assert.ok(elements.some(element => element.parent === picker.parent && hasClass(element, 'map-label')));
  }
  assert.ok(byId('room-map-name'), 'guests have a read-only map name');
});

test('menu integration does not duplicate existing controls or IDs', () => {
  const ids = elements.filter(element => element.attrs.id).map(element => element.attrs.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ['nickname', 'create-room', 'join-room', 'room-code', 'room-start', 'copy-invite', 'leave-lobby']) {
    assert.ok(byId(id), `${id} is retained`);
  }
  assert.ok(within(byId('nickname'), byId('network-form')));
  assert.ok(within(byId('create-room'), byId('network-form')));
});

test('toast announcements stay mounted independently of the visual notification', () => {
  const status = byId('toast-status'), visual = byId('toast');
  assert.equal(status.attrs.role, 'status');
  assert.equal(status.attrs['aria-live'], 'polite');
  assert.equal(status.attrs['aria-atomic'], 'true');
  assert.ok(!('hidden' in status.attrs));
  assert.ok(!within(status, byId('intro')) && !within(status, byId('room-panel')));
  assert.equal(visual.attrs['aria-hidden'], 'true');
});
