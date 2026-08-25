const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const html = read('index.html');
const router = read('script.js');
const productRoute = read('app/features/product-sharing/product-sharing.mjs');
const navigationHistory = read('app/ui/navigation-history.js');

assert.doesNotMatch(html, /href="#home"/, 'home is the root URL without #home');
assert.match(html, /<a href="\/" class="logo" aria-label="BELLORE 홈">/,
  'the header logo uses a native root link so every app state returns to the canonical home');
assert.doesNotMatch(html, /<a href="\/" class="logo"[^>]+data-nav="home"/,
  'the router must not intercept the header logo root navigation');
assert.equal((html.match(/href="\/"[^>]+data-nav="home"/g) || []).length, 1,
  'the footer may keep the in-app home navigation');
assert.match(router, /function routeForPage\(target\)/);
assert.match(router, /if \(target === 'home'\) return '\/';/);
assert.match(router, /return '\/#' \+ target;/, 'app hashes are anchored at the site root');
assert.doesNotMatch(router, /history\.pushState\(\{ page: target \}, '', '#' \+ target\);/,
  'market paths never receive an app hash');
assert.match(router, /if \(location\.hash === '#home'\) history\.replaceState\(\{ page: 'home' \}, '', '\/'\);/,
  'old #home URLs normalize to the root');
assert.match(productRoute, /win\.history\.replaceState\(win\.history\.state, '', '\/'\);/);
assert.doesNotMatch(productRoute, /\/#home/);
assert.match(navigationHistory, /window\.location\.pathname === '\/'/);

console.log('home canonical route invariants: ok');
