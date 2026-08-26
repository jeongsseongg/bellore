'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const runtime = fs.readFileSync(path.join(root, 'app', 'legacy', 'page-runtime.js'), 'utf8');
const serviceWorker = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const releaseKey = '20260826-hero-campaigns-v7';

const urls = {
  styles: html.match(/<link rel="stylesheet" href="(styles\.css\?v=[^"]+)"/)?.[1],
  script: html.match(/<script src="(script\.js\?v=[^"]+)"/)?.[1],
  payments: html.match(/<script src="(payments\.js\?v=[^"]+)"/)?.[1],
  dialog: html.match(/<script src="(ui-dialog\.js\?v=[^"]+)"/)?.[1],
  features: html.match(/<script src="(bellore-features\.js\?v=[^"]+)"/)?.[1],
  quotes: html.match(/<script src="(cq-demo\.js\?v=[^"]+)"/)?.[1],
  auction: html.match(/<script src="(auction\.js\?v=[^"]+)"/)?.[1],
  bootstrap: html.match(/<script type="module" src="(app\/bootstrap\.js\?v=[^"]+)"/)?.[1],
  pageRuntime: html.match(/<script src="(app\/legacy\/page-runtime\.js\?v=[^"]+)"/)?.[1],
  serviceWorker: runtime.match(/serviceWorker\.register\('(sw\.js\?v=[^']+)'\)/)?.[1],
};

for (const [name, url] of Object.entries(urls)) {
  assert(url, `${name} release URL is missing`);
  assert.equal(new URL(url, 'https://bellore.co.kr/').searchParams.get('v'), releaseKey, `${name} release key must advance together`);
}
for (const name of ['styles', 'script', 'payments', 'dialog', 'features', 'quotes', 'auction', 'bootstrap', 'pageRuntime']) {
  assert(serviceWorker.includes(`'./${urls[name]}'`), `service worker must precache the exact ${name} URL`);
}
assert.match(serviceWorker, /const VERSION = "bellore-v295-banner-minimal";/, 'service-worker cache namespace must advance with the release');

console.log('phase 7-11 release cache-key invariants: ok');
