'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const runtime = fs.readFileSync(path.join(root, 'app', 'legacy', 'page-runtime.js'), 'utf8');
const serviceWorker = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const releaseKey = '20260825-single-home-banner-v5';

const urls = {
  script: html.match(/<script src="(script\.js\?v=[^"]+)"/)?.[1],
  bootstrap: html.match(/<script type="module" src="(app\/bootstrap\.js\?v=[^"]+)"/)?.[1],
  pageRuntime: html.match(/<script src="(app\/legacy\/page-runtime\.js\?v=[^"]+)"/)?.[1],
  serviceWorker: runtime.match(/serviceWorker\.register\('(sw\.js\?v=[^']+)'\)/)?.[1],
};

for (const [name, url] of Object.entries(urls)) {
  assert(url, `${name} release URL is missing`);
  assert.equal(new URL(url, 'https://bellore.co.kr/').searchParams.get('v'), releaseKey, `${name} release key must advance together`);
}
for (const name of ['script', 'bootstrap', 'pageRuntime']) {
  assert(serviceWorker.includes(`'./${urls[name]}'`), `service worker must precache the exact ${name} URL`);
}
assert.match(serviceWorker, /const VERSION = "bellore-v275-single-home-banner";/, 'service-worker cache namespace must advance with the release');

console.log('phase 7-11 release cache-key invariants: ok');
