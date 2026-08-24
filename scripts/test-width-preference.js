'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function fixture() {
  const rootAttributes = new Map();
  const toggleAttributes = new Map();
  let click = null;
  const root = {
    getAttribute: (name) => rootAttributes.get(name) || null,
    setAttribute: (name, value) => rootAttributes.set(name, value),
    removeAttribute: (name) => rootAttributes.delete(name),
  };
  const toggle = {
    addEventListener(type, handler) { if (type === 'click') click = handler; },
    setAttribute: (name, value) => toggleAttributes.set(name, value),
  };
  return {
    document: { documentElement: root, getElementById: (id) => (id === 'toggleWide' ? toggle : null) },
    root,
    toggleAttributes,
    click: () => click(),
  };
}

(async () => {
  const root = path.resolve(__dirname, '..');
  const source = fs.readFileSync(path.join(root, 'app', 'ui', 'width-preference.js'), 'utf8');
  const bootstrap = fs.readFileSync(path.join(root, 'app', 'bootstrap.js'), 'utf8');
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
  const { initWidthPreference } = await import(moduleUrl);

  assert.match(bootstrap, /getStorage: \(\) => window\.localStorage/, 'bootstrap must defer access to the storage getter');
  assert.doesNotMatch(bootstrap, /storage: window\.localStorage/, 'bootstrap must not read storage during argument evaluation');

  const normal = fixture();
  const writes = [];
  let getterCalls = 0;
  initWidthPreference({
    document: normal.document,
    getStorage: () => {
      getterCalls += 1;
      return { setItem: (...args) => writes.push(args) };
    },
  });
  assert.equal(getterCalls, 0, 'initialization must not touch the storage getter');
  assert.equal(normal.toggleAttributes.get('aria-checked'), 'false');
  normal.click();
  assert.equal(normal.root.getAttribute('data-width'), 'full');
  assert.deepEqual(writes[0], ['bellore_width', 'full']);
  assert.equal(normal.toggleAttributes.get('aria-checked'), 'true');
  normal.click();
  assert.equal(normal.root.getAttribute('data-width'), null);
  assert.deepEqual(writes[1], ['bellore_width', 'app']);

  const blocked = fixture();
  initWidthPreference({
    document: blocked.document,
    getStorage: () => { throw new Error('SecurityError'); },
  });
  assert.doesNotThrow(() => blocked.click(), 'a throwing localStorage getter must not break the view toggle');
  assert.equal(blocked.root.getAttribute('data-width'), 'full');
  assert.equal(blocked.toggleAttributes.get('aria-checked'), 'true');

  const unavailable = fixture();
  initWidthPreference({ document: unavailable.document });
  assert.doesNotThrow(() => unavailable.click(), 'missing storage must remain a safe no-op');
  assert.equal(unavailable.root.getAttribute('data-width'), 'full');

  console.log('width preference invariants: ok');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
