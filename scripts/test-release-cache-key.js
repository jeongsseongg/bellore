'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const loginHtml = fs.readFileSync(path.join(root, 'login.html'), 'utf8');
const runtime = fs.readFileSync(path.join(root, 'app', 'legacy', 'page-runtime.js'), 'utf8');
const serviceWorker = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const bootstrap = fs.readFileSync(path.join(root, 'app', 'bootstrap.js'), 'utf8');
const releaseKey = '20260826-member-verification-live-v2';
const sellReleaseKey = '20260826-naverpay-live-v1';
const bootstrapReleaseKey = '20260828-phone-auth-paths-v1';
const authPageReleaseKey = '20260827-mypage-contracts-v1';
const signupStyleKey = '20260828-phone-auth-paths-v1';
const signupScriptKey = '20260828-phone-auth-paths-v1';
const signupIdentityKey = '20260828-phone-auth-paths-v1';
const shellStyleKey = '20260826-auth-shell-v1';
const loginStyleUrl = loginHtml.match(/href="(app\/features\/auth-login\/auth-login\.css\?v=[^"]+)"/)?.[1];
const loginScriptUrl = loginHtml.match(/src="(app\/features\/auth-login\/auth-login\.js\?v=[^"]+)"/)?.[1];

const urls = {
  styles: html.match(/<link rel="stylesheet" href="(styles\.css\?v=[^"]+)"/)?.[1],
  script: html.match(/<script src="(script\.js\?v=[^"]+)"/)?.[1],
  payments: html.match(/<script src="(payments\.js\?v=[^"]+)"/)?.[1],
  wishlist: html.match(/<script src="(wishlist\.js\?v=[^"]+)"/)?.[1],
  search: html.match(/<script src="(search\.js\?v=[^"]+)"/)?.[1],
  dialog: html.match(/<script src="(ui-dialog\.js\?v=[^"]+)"/)?.[1],
  features: html.match(/<script src="(bellore-features\.js\?v=[^"]+)"/)?.[1],
  quotes: html.match(/<script src="(cq-demo\.js\?v=[^"]+)"/)?.[1],
  auction: html.match(/<script src="(auction\.js\?v=[^"]+)"/)?.[1],
  bootstrap: html.match(/<script type="module" src="(app\/bootstrap\.js\?v=[^"]+)"/)?.[1],
  conditionGuide: html.match(/<link rel="stylesheet" href="(app\/features\/condition-guide\/condition-guide\.css\?v=[^"]+)"/)?.[1],
  pageRuntime: html.match(/<script src="(app\/legacy\/page-runtime\.js\?v=[^"]+)"/)?.[1],
  serviceWorker: runtime.match(/serviceWorker\.register\('(sw\.js\?v=[^']+)'\)/)?.[1],
};

for (const [name, url] of Object.entries(urls)) {
  assert(url, `${name} release URL is missing`);
  const expectedKey = name === 'styles'
    ? authPageReleaseKey
    : name === 'script'
    ? authPageReleaseKey
    : name === 'bootstrap'
    ? bootstrapReleaseKey
    : name === 'serviceWorker'
    ? shellStyleKey
    : name === 'features'
    ? signupIdentityKey
    : (name === 'pageRuntime' ? sellReleaseKey : releaseKey);
  assert.equal(new URL(url, 'https://bellore.co.kr/').searchParams.get('v'), expectedKey, `${name} must use its current release key`);
}
for (const name of ['styles', 'script', 'payments', 'wishlist', 'search', 'dialog', 'features', 'quotes', 'auction', 'bootstrap', 'conditionGuide', 'pageRuntime']) {
  assert(serviceWorker.includes(`'./${urls[name]}'`), `service worker must precache the exact ${name} URL`);
}
assert.match(serviceWorker, /const VERSION = "bellore-v\d+-[a-z0-9-]+";/, 'service-worker cache namespace must remain a versioned Bellore release');
assert(serviceWorker.includes(`'./app/bootstrap.js?v=${bootstrapReleaseKey}'`), 'service worker must preserve the restored sell request path');
assert(serviceWorker.includes("'./login.html'"), 'service worker must precache the independent login page');
assert(loginStyleUrl && serviceWorker.includes(`'./${loginStyleUrl}'`), 'service worker must precache the exact login page styles');
assert(loginScriptUrl && serviceWorker.includes(`'./${loginScriptUrl}'`), 'service worker must precache the exact login page behavior');
assert(serviceWorker.includes(`'./app/features/auth-signup/auth-signup.css?v=${signupStyleKey}'`), 'service worker must precache signup page styles');
assert(serviceWorker.includes(`'./app/features/auth-signup/auth-signup.js?v=${signupScriptKey}'`), 'service worker must precache signup page behavior');
assert(serviceWorker.includes(`'./supabase.js?v=${signupIdentityKey}'`), 'service worker must precache the current signup verification backend');
assert(serviceWorker.includes("'./assets/icons/favicon-32.png'"), 'service worker must precache the favicon used by standalone pages');
for (const heroAsset of ['home-banners.js', 'home-banner-data.js']) {
  assert(serviceWorker.includes(`./app/features/home-banners/${heroAsset}?v=20260826-hero-layout-v7`), `service worker must precache exact restored hero asset: ${heroAsset}`);
}
assert(serviceWorker.includes('./app/features/home-banners/home-banners.css?v=20260826-hero-layout-v9'), 'service worker must precache exact hero layout stylesheet');
assert(serviceWorker.includes('./app/features/home-quicklinks/home-quicklinks.js?v=20260826-hero-layout-v8'), 'service worker must precache exact quicklink script');
assert(serviceWorker.includes('./app/features/home-quicklinks/home-quicklinks.css?v=20260826-rounded-corners-v2'), 'service worker must precache rounded quicklink stylesheet');
for (const tradeAsset of ['방문거래.png', '택배거래.png', '퀵거래.png']) {
  assert(serviceWorker.includes(`./assets/sell/trade/${tradeAsset}`), `service worker must precache transaction artwork: ${tradeAsset}`);
}
for (const asset of [
  'app/vendor/recommendation-engine.js',
  'app/features/home-merchandising/home-merchandising.js',
  'app/features/home-rows/home-rows.js',
  'app/features/listing-availability/listing-availability-ui.js',
  'app/services/listings/listing-catalog-service.js',
  'app/core/listing-display.js',
  'app/features/checkout/payment-flow.js',
  'app/services/payments/payment-auth.js',
  'app/services/payments/checkout-request-recovery.js',
  'app/services/payments/checkout-client.js',
  'app/services/payments/payment-network.js',
  'app/services/payments/pending-payment-recovery.js',
  'app/legacy/customer-feedback.js',
  'app/features/condition-guide/condition-guide.css',
  'app/features/condition-guide/condition-guide.js',
  'app/core/customer-error.mjs',
  'app/features/listing-availability/market-static-status.js',
]) {
  const assetKey = asset === 'app/features/home-rows/home-rows.js'
    ? '20260826-home-row-hotfix-v1'
    : releaseKey;
  assert(serviceWorker.includes(`'./${asset}?v=${assetKey}'`), `service worker must precache exact ESM release URL: ${asset}`);
}
for (const specifier of [
  './vendor/recommendation-engine.js', './features/home-merchandising/home-merchandising.js',
  './features/home-rows/home-rows.js', './features/listing-availability/listing-availability-ui.js',
  './services/listings/listing-catalog-service.js', './core/listing-display.js',
  './features/checkout/payment-flow.js', './legacy/customer-feedback.js',
  './services/payments/payment-auth.js',
  './services/payments/checkout-request-recovery.js',
  './services/payments/checkout-client.js',
  './services/payments/payment-network.js',
  './services/payments/pending-payment-recovery.js',
  './features/condition-guide/condition-guide.js',
]) {
  const specifierKey = specifier === './features/home-rows/home-rows.js'
    ? '20260826-home-row-hotfix-v1'
    : releaseKey;
  assert(bootstrap.includes(`${specifier}?v=${specifierKey}`), `bootstrap must import exact ESM release URL: ${specifier}`);
}

console.log('phase 7-11 release cache-key invariants: ok');
