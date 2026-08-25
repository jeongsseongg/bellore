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
  const root = path.resolve(__dirname, '..');
  const sourcePath = path.join(root, 'app', 'ui', 'hero-parallax.js');
  const source = fs.readFileSync(sourcePath, 'utf8');
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
  const { initHeroParallax } = await import(moduleUrl);

  const noHeroWindow = { ...eventTarget(), scrollY: 0, innerHeight: 800 };
  const noHero = initHeroParallax({
    document: { querySelector: () => null },
    window: noHeroWindow
  });
  assert.equal(noHeroWindow.listeners.size, 0, 'missing hero installs no listener');
  assert.doesNotThrow(() => noHero.destroy(), 'missing hero returns a safe controller');

  const staticHeroImage = { style: { transform: 'scale(1.05)' }, closest: () => ({}) };
  const staticHeroWindow = { ...eventTarget(), scrollY: 100, innerHeight: 800 };
  const staticHero = initHeroParallax({
    document: { querySelector: () => staticHeroImage },
    window: staticHeroWindow
  });
  assert.equal(staticHeroImage.style.transform, 'none', 'fixed home banner always shows the complete source image');
  assert.equal(staticHeroWindow.listeners.size, 0, 'fixed home banner installs no crop-inducing parallax listener');
  assert.doesNotThrow(() => staticHero.destroy(), 'fixed home banner returns a safe controller');

  const heroImage = { style: { transform: '' } };
  const browserWindow = { ...eventTarget(), scrollY: 0, innerHeight: 800 };
  const controller = initHeroParallax({
    document: { querySelector: (selector) => selector === '.hero-image' ? heroImage : null },
    window: browserWindow
  });

  const scroll = browserWindow.listeners.get('scroll');
  assert(scroll, 'scroll listener is installed');
  assert.equal(scroll.options.passive, true, 'scroll listener stays passive');
  assert.equal(heroImage.style.transform, '', 'initialization does not force a transform');

  browserWindow.scrollY = 100;
  scroll.handler();
  assert.equal(heroImage.style.transform, 'translateY(30px) scale(1.05)', 'scroll position keeps the legacy transform');

  browserWindow.scrollY = 800;
  scroll.handler();
  assert.equal(heroImage.style.transform, 'translateY(30px) scale(1.05)', 'viewport boundary keeps the last transform');

  controller.destroy();
  assert.equal(browserWindow.listeners.size, 0, 'destroy removes the scroll listener');

  const bootstrap = fs.readFileSync(path.join(root, 'app', 'bootstrap.js'), 'utf8');
  const legacyScript = fs.readFileSync(path.join(root, 'script.js'), 'utf8');
  const serviceWorker = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  assert.match(bootstrap, /import \{ initHeroParallax \} from '\.\/ui\/hero-parallax\.js\?v=20260825-banner-contract-v2';/, 'bootstrap imports the fixed banner module with an exact release key');
  assert.match(bootstrap, /initHeroParallax\(\{ document, window \}\);/, 'bootstrap initializes the parallax module');
  assert.doesNotMatch(legacyScript, /initParallax/, 'legacy script no longer owns parallax');
  assert.match(serviceWorker, /\.\/app\/ui\/hero-parallax\.js/, 'service worker precaches the parallax module');

  console.log('hero parallax module invariants: ok');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
