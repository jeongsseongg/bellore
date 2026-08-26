import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const config = read('supabase-config.js');
const edge = read('supabase/functions/naverpay-order/index.ts');
const worker = read('cloudflare/naverpay-proxy/src/index.js');
const wrangler = read('cloudflare/naverpay-proxy/wrangler.jsonc');
const sw = read('sw.js');
const html = read('index.html');
const css = read('bellore-redesign.css');
const client = read('naverpay.js');

assert.match(config, /naverWcsId:\s*"s_1ffe9440a292"/, 'issued Naver common account ID must be configured');
assert.match(config, /endpoint:\s*"\/naverpay-order"/, 'browser must call the registered Bellore domain');
assert.match(edge, /uuidToNaverId/, 'Naver product ID encoder must remain present');
assert.match(edge, /\{SITE_URL\}\/market\/\$\{encodeURIComponent\(productNo\)\}\//, 'product XML must use canonical product pages');
assert.match(worker, /new URL\(request\.url\)/, 'proxy must preserve dynamic Naver query parameters');
assert.match(worker, /Cache-Control', 'no-store'/, 'dynamic XML must not be cached');
assert.match(worker, /application\/xml; charset=utf-8/, 'same-domain product response must advertise XML');
assert.match(wrangler, /bellore\.co\.kr\/naverpay-order\*/, 'Worker route must stay on the registered domain');
assert.match(sw, /pathname === '\/naverpay-order'/, 'service worker must bypass dynamic product XML');
assert.match(config, /testOnly:\s*true/, 'customer-facing Naver Pay must remain disabled until final approval');
assert.match(edge, /sandbox:\s*true/, 'Edge config must remain in Naver sandbox until final approval');
assert.equal((html.match(/id="npay-button-container"/g) || []).length, 1, 'product page must have one Naver Pay button container');
assert.match(html, /<div class="pp-bottom">[\s\S]*id="npay-button-container"[\s\S]*id="pmBuy"/, 'Naver Pay must sit immediately before the regular purchase action');
assert.match(css, /\.pp-bottom \.pp-npay-action/, 'bottom purchase bar must size the Naver Pay action');
assert.match(client, /classList\.toggle\('has-npay', visible\)/, 'purchase bar must reserve space only when Naver Pay is visible');
assert.match(sw, /bellore-v342-naverpay-bottom-action/, 'service worker cache namespace must advance for the button relocation');

console.log('Naver Pay review release contract: 16/16 passed');
