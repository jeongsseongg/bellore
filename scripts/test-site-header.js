const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function eventTarget() {
  const listeners = new Map();
  return {
    listeners,
    addEventListener(type, handler, options) {
      listeners.set(type, { handler, options });
    },
    removeEventListener(type, handler) {
      if (listeners.get(type)?.handler === handler) listeners.delete(type);
    }
  };
}

(async () => {
  const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');
  const serviceWorker = fs.readFileSync(path.resolve(__dirname, '..', 'sw.js'), 'utf8');
  const styles = fs.readFileSync(path.resolve(__dirname, '..', 'styles.css'), 'utf8');
  const pageRuntime = fs.readFileSync(path.resolve(__dirname, '..', 'app', 'legacy', 'page-runtime.js'), 'utf8');
  const sourcePath = path.resolve(__dirname, '..', 'app', 'ui', 'site-header.js');
  const source = fs.readFileSync(sourcePath, 'utf8');
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
  const { initSiteHeader } = await import(moduleUrl);

  const scriptUrl = html.match(/<script src="(script\.js\?v=[^"]+)"/)?.[1];
  const bootstrapUrl = html.match(/<script type="module" src="(app\/bootstrap\.js\?v=[^"]+)"/)?.[1];
  const serviceWorkerUrl = pageRuntime.match(/serviceWorker\.register\('(sw\.js\?v=[^']+)'\)/)?.[1];
  assert(scriptUrl, 'legacy script URL has a release cache key');
  assert(bootstrapUrl, 'bootstrap URL has a release cache key');
  assert(serviceWorkerUrl, 'service worker registration has a release cache key');
  const releaseKey = (url) => url.match(/[?&]v=([^&]+)/)?.[1];
  assert.equal(releaseKey(bootstrapUrl), '20260827-sell-request-persistence-v1', 'bootstrap uses the sell persistence release key');
  assert.equal(releaseKey(scriptUrl), '20260826-auth-page-v1', 'legacy script uses the latest auth page release key');
  assert.equal(releaseKey(serviceWorkerUrl), '20260826-auth-shell-v1', 'service worker registration uses the latest auth shell release key');
  assert(serviceWorker.includes(`'./${scriptUrl}'`), 'service worker precaches the exact script URL');
  assert(serviceWorker.includes(`'./${bootstrapUrl}'`), 'service worker precaches the exact bootstrap URL');
  assert.match(serviceWorker, /\.\/app\/ui\/site-header\.js/, 'service worker precaches the imported header module');
  assert.doesNotMatch(styles, /body\.admin-mode \.main-wrap\s*\{[^}]*padding-top:\s*0/, 'admin login keeps the same header offset as customer home');

  let height = 84;
  const classes = new Set();
  const header = {
    classList: {
      toggle(name, force) {
        if (force) classes.add(name);
        else classes.delete(name);
      }
    },
    getBoundingClientRect() { return { height }; }
  };

  const properties = new Map();
  const document = {
    documentElement: {
      style: {
        setProperty(name, value) { properties.set(name, value); }
      }
    },
    getElementById(id) { return id === 'header' ? header : null; }
  };

  let resizeCallback = null;
  let observedElement = null;
  let disconnected = false;
  class FakeResizeObserver {
    constructor(callback) { resizeCallback = callback; }
    observe(element) { observedElement = element; }
    disconnect() { disconnected = true; }
  }

  const windowEvents = eventTarget();
  const browserWindow = {
    ...windowEvents,
    scrollY: 0,
    ResizeObserver: FakeResizeObserver
  };

  const controller = initSiteHeader({ document, window: browserWindow });
  assert.equal(properties.get('--header-real-h'), '84px', 'initial header height is published');
  assert.equal(observedElement, header, 'header resize is observed');
  assert.equal(windowEvents.listeners.get('scroll').options.passive, true, 'scroll listener stays passive');

  height = 96;
  resizeCallback();
  assert.equal(properties.get('--header-real-h'), '96px', 'resize updates the published height');

  browserWindow.scrollY = 31;
  windowEvents.listeners.get('scroll').handler();
  assert(classes.has('scrolled'), 'scrolling past 30px adds the scrolled class');

  browserWindow.scrollY = 30;
  windowEvents.listeners.get('scroll').handler();
  assert(!classes.has('scrolled'), '30px is still the unscrolled boundary');

  controller.destroy();
  assert.equal(disconnected, true, 'destroy disconnects the resize observer');
  assert.equal(windowEvents.listeners.size, 0, 'destroy removes the scroll listener');

  height = 72;
  const fallbackEvents = eventTarget();
  const fallbackWindow = { ...fallbackEvents, scrollY: 31 };
  const fallbackController = initSiteHeader({ document, window: fallbackWindow });
  assert.equal(properties.get('--header-real-h'), '72px', 'height still publishes without ResizeObserver');
  fallbackEvents.listeners.get('scroll').handler();
  assert(classes.has('scrolled'), 'scroll behavior works without ResizeObserver');
  fallbackController.destroy();
  assert.equal(fallbackEvents.listeners.size, 0, 'fallback cleanup removes the scroll listener');

  const noHeader = initSiteHeader({
    document: { getElementById: () => null },
    window: browserWindow
  });
  assert.doesNotThrow(() => noHeader.destroy(), 'missing header returns a safe controller');

  console.log('site header module invariants: ok');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
