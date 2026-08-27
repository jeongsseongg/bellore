const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const runtime = fs.readFileSync(path.join(root, 'app', 'legacy', 'page-runtime.js'), 'utf8');
const serviceWorker = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const pagesBuilder = fs.readFileSync(path.join(root, 'tools', 'build-pages.mjs'), 'utf8');
const navigation = fs.readFileSync(path.join(root, 'app', 'ui', 'navigation-history.js'), 'utf8');
const widthPreference = fs.readFileSync(path.join(root, 'app', 'ui', 'width-preference.js'), 'utf8');
const baseline = JSON.parse(fs.readFileSync(path.join(root, 'scripts', 'architecture-baseline.json'), 'utf8'));
const releaseKey = '20260826-sell-services-blue-v1';

const tag = `<script src="app/legacy/page-runtime.js?v=${releaseKey}"></script>`;
assert.equal((html.match(/app\/legacy\/page-runtime\.js/g) || []).length, 1, 'page runtime must load exactly once');
assert(html.includes(tag), 'page runtime must remain a synchronous classic script');
assert(html.indexOf(tag) > html.indexOf('<script src="naverpay.js'), 'page runtime must keep its position after legacy dependencies');
assert.doesNotMatch(html, /<script>\s*if \('serviceWorker' in navigator\)/, 'service worker bootstrap must not return inline');
assert.doesNotThrow(() => new Function(runtime), 'externalized classic runtime must parse');

for (const contract of [
  /window\.BELLORE_applyColFilters\s*=\s*applyFilters/,
  /window\.__catFilterBrands\s*=\s*function/,
  /setTimeout\(applyFilters, 1500\)/,
  /setTimeout\(applyFilters, 4000\)/,
]) {
  assert.match(runtime, contract, `legacy runtime contract missing: ${contract}`);
}
assert(runtime.includes(`navigator.serviceWorker.register('sw.js?v=${releaseKey}')`), 'service worker registration must use the release key');

assert(serviceWorker.includes(`'./app/legacy/page-runtime.js?v=${releaseKey}'`), 'service worker must precache the exact runtime URL');
assert.match(navigation, /window\.addEventListener\('popstate'/, 'navigation history must own browser back handling');
assert.match(widthPreference, /getStorage\(\)\?\.setItem\('bellore_width'/, 'width preference must resolve storage lazily');
assert(serviceWorker.includes("'./app/ui/navigation-history.js'"), 'service worker must precache navigation history');
assert(serviceWorker.includes("'./app/ui/width-preference.js'"), 'service worker must precache width preference');
assert(pagesBuilder.includes("'app/legacy/page-runtime.js'"), 'Pages allowlist must include the runtime');
assert.deepEqual(
  baseline.newCodeExceptions['app/legacy/page-runtime.js'],
  { maximum: 503 },
  'page runtime exception must remain an exact ratchet for the integrated catalog controls'
);
assert.equal(baseline.legacyCeilings.executableInlineScriptBlocks, 2, 'inline block ceiling must ratchet down');
assert.equal(baseline.legacyCeilings.executableInlineScriptBytes, 1210, 'inline byte ceiling must ratchet down');
assert.equal(baseline.legacyLineCeilings['index.html'], 3323, 'HTML line ceiling must include the condition guide stylesheet entry');

console.log('page runtime extraction invariants: ok');
