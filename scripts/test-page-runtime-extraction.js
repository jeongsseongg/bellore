const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const runtime = fs.readFileSync(path.join(root, 'app', 'legacy', 'page-runtime.js'), 'utf8');
const serviceWorker = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const pagesBuilder = fs.readFileSync(path.join(root, 'tools', 'build-pages.mjs'), 'utf8');
const baseline = JSON.parse(fs.readFileSync(path.join(root, 'scripts', 'architecture-baseline.json'), 'utf8'));

const tag = '<script src="app/legacy/page-runtime.js?v=20260824-home-v1"></script>';
assert.equal((html.match(/app\/legacy\/page-runtime\.js/g) || []).length, 1, 'page runtime must load exactly once');
assert(html.includes(tag), 'page runtime must remain a synchronous classic script');
assert(html.indexOf(tag) > html.indexOf('<script src="naverpay.js'), 'page runtime must keep its position after legacy dependencies');
assert.doesNotMatch(html, /<script>\s*if \('serviceWorker' in navigator\)/, 'service worker bootstrap must not return inline');
assert.doesNotThrow(() => new Function(runtime), 'externalized classic runtime must parse');

for (const contract of [
  /navigator\.serviceWorker\.register\('sw\.js\?v=20260824-home-v1'\)/,
  /window\.BELLORE_applyColFilters\s*=\s*applyFilters/,
  /window\.__catFilterBrands\s*=\s*function/,
  /setTimeout\(applyFilters, 1500\)/,
  /setTimeout\(applyFilters, 4000\)/,
  /window\.addEventListener\('popstate'/,
]) {
  assert.match(runtime, contract, `legacy runtime contract missing: ${contract}`);
}

assert(serviceWorker.includes("'./app/legacy/page-runtime.js?v=20260824-home-v1'"), 'service worker must precache the exact runtime URL');
assert(pagesBuilder.includes("'app/legacy/page-runtime.js'"), 'Pages allowlist must include the runtime');
assert.equal(baseline.legacyCeilings.executableInlineScriptBlocks, 2, 'inline block ceiling must ratchet down');
assert.equal(baseline.legacyCeilings.executableInlineScriptBytes, 1210, 'inline byte ceiling must ratchet down');
assert.equal(baseline.legacyLineCeilings['index.html'], 3218, 'HTML line ceiling must ratchet down');

console.log('page runtime extraction invariants: ok');
