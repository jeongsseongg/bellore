const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function classList() {
  const values = new Set();
  return {
    add(value) { values.add(value); },
    contains(value) { return values.has(value); }
  };
}

function element() {
  return { classList: classList() };
}

async function importSource(file) {
  const source = fs.readFileSync(file, 'utf8');
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}

(async () => {
  const root = path.resolve(__dirname, '..');
  const revealPath = path.join(root, 'app', 'ui', 'reveal-effects.js');
  const legacyPath = path.join(root, 'app', 'legacy', 'legacy-reveal.js');
  const { initRevealEffects } = await importSource(revealPath);
  const { installLegacyReveal } = await importSource(legacyPath);

  const fallbackElement = element();
  const fallback = initRevealEffects({
    document: { querySelectorAll: () => [fallbackElement] },
    window: {}
  });
  assert.equal(fallbackElement.classList.contains('reveal'), false, 'unsupported browsers keep content visible');
  assert.doesNotThrow(() => fallback.refresh(), 'fallback refresh is safe');
  assert.doesNotThrow(() => fallback.destroy(), 'fallback destroy is safe');

  const rows = [element(), element()];
  let observerCallback = null;
  let observerOptions = null;
  let disconnected = false;
  const observed = new Set();
  const unobserved = [];
  class FakeIntersectionObserver {
    constructor(callback, options) {
      observerCallback = callback;
      observerOptions = options;
    }
    observe(target) { observed.add(target); }
    unobserve(target) { observed.delete(target); unobserved.push(target); }
    disconnect() { disconnected = true; observed.clear(); }
  }

  let nextTimer = 1;
  const timers = new Map();
  const cleared = [];
  const browserWindow = {
    IntersectionObserver: FakeIntersectionObserver,
    setTimeout(callback, delay) {
      const id = nextTimer++;
      timers.set(id, { callback, delay });
      return id;
    },
    clearTimeout(id) { cleared.push(id); timers.delete(id); }
  };
  const document = { querySelectorAll: () => rows };

  const controller = initRevealEffects({ document, window: browserWindow });
  assert.deepEqual(observerOptions, { threshold: 0.1, rootMargin: '0px 0px -30px 0px' }, 'observer keeps the legacy visibility boundary');
  assert(rows.every((row) => row.classList.contains('reveal')), 'initial elements receive the reveal class');
  assert.equal(observed.size, 2, 'initial elements are observed');

  observerCallback([
    { target: rows[0], isIntersecting: true },
    { target: rows[1], isIntersecting: true }
  ]);
  assert.deepEqual([...timers.values()].map((timer) => timer.delay), [0, 35], 'entries keep the legacy 35ms stagger');
  assert.deepEqual(unobserved, rows, 'intersecting elements stop observing before animation');

  const firstTimer = [...timers.entries()][0];
  firstTimer[1].callback();
  assert(rows[0].classList.contains('in'), 'timer reveals the intersecting element');

  const dynamic = element();
  rows.push(dynamic);
  controller.refresh();
  assert(dynamic.classList.contains('reveal'), 'refresh discovers dynamic elements');
  assert(observed.has(dynamic), 'dynamic element is observed');

  controller.destroy();
  assert.equal(disconnected, true, 'destroy disconnects the observer');
  assert(cleared.length > 0, 'destroy clears pending stagger timers');
  assert(rows.every((row) => row.classList.contains('in')), 'destroy never leaves content hidden');
  const nextTimerAfterDestroy = nextTimer;
  observerCallback([{ target: dynamic, isIntersecting: true }]);
  assert.equal(nextTimer, nextTimerAfterDestroy, 'queued observer callbacks cannot schedule work after destroy');
  const observedAfterDestroy = observed.size;
  controller.refresh();
  assert.equal(observed.size, observedAfterDestroy, 'destroyed controller ignores refresh');

  const previous = () => 'previous';
  const legacyWindow = { refreshReveals: previous };
  let refreshCalls = 0;
  const bridge = installLegacyReveal({
    window: legacyWindow,
    reveal: { refresh() { refreshCalls += 1; } }
  });
  legacyWindow.refreshReveals();
  assert.equal(refreshCalls, 1, 'legacy global delegates to the module controller');
  bridge.destroy();
  assert.equal(legacyWindow.refreshReveals, previous, 'destroy restores an existing legacy global');

  const emptyWindow = {};
  const emptyBridge = installLegacyReveal({ window: emptyWindow, reveal: { refresh() {} } });
  assert.equal(typeof emptyWindow.refreshReveals, 'function', 'adapter publishes the temporary global');
  emptyBridge.destroy();
  assert.equal('refreshReveals' in emptyWindow, false, 'adapter removes a newly introduced global');

  const bootstrap = fs.readFileSync(path.join(root, 'app', 'bootstrap.js'), 'utf8');
  const legacyScript = fs.readFileSync(path.join(root, 'script.js'), 'utf8');
  const serviceWorker = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  const pagesBuilder = fs.readFileSync(path.join(root, 'tools', 'build-pages.mjs'), 'utf8');
  assert.match(bootstrap, /initRevealEffects\(\{ document, window \}\)/, 'bootstrap initializes the reveal module');
  assert.match(bootstrap, /installLegacyReveal\(\{ window, reveal \}\)/, 'bootstrap installs the temporary global adapter');
  assert.doesNotMatch(legacyScript, /function initReveal|var REVEAL_SEL|var revealObserver/, 'legacy reveal implementation is removed');
  assert.match(legacyScript, /window\.refreshReveals\(\)/, 'legacy router calls only the adapter contract');
  assert.match(serviceWorker, /\.\/app\/ui\/reveal-effects\.js/, 'service worker precaches the reveal module');
  assert.match(serviceWorker, /\.\/app\/legacy\/legacy-reveal\.js/, 'service worker precaches the reveal adapter');
  assert.match(pagesBuilder, /app\/ui\/reveal-effects\.js/, 'Pages and Firebase artifacts include the reveal module');
  assert.match(pagesBuilder, /app\/legacy\/legacy-reveal\.js/, 'Pages and Firebase artifacts include the reveal adapter');
  assert.throws(() => initRevealEffects({ document: null, window: {} }), /requires document and window/, 'dependencies are explicit');
  assert.throws(() => installLegacyReveal({ window: {}, reveal: null }), /requires window and reveal controller/, 'adapter dependencies are explicit');

  console.log('reveal effects module invariants: ok');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
