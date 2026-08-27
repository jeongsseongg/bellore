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
assert.match(config, /endpoint:\s*"https:\/\/iumsnacuxgssnnbckurq\.supabase\.co\/functions\/v1\/naverpay-order"/, 'browser must call the active production Edge endpoint');
assert.match(edge, /uuidToNaverId/, 'Naver product ID encoder must remain present');
assert.match(edge, /\{SITE_URL\}\/market\/\$\{encodeURIComponent\(productNo\)\}\//, 'product XML must use canonical product pages');
assert.match(worker, /new URL\(request\.url\)/, 'proxy must preserve dynamic Naver query parameters');
assert.match(worker, /Cache-Control', 'no-store'/, 'dynamic XML must not be cached');
assert.match(worker, /application\/xml; charset=utf-8/, 'same-domain product response must advertise XML');
assert.match(wrangler, /bellore\.co\.kr\/naverpay-order\*/, 'Worker route must stay on the registered domain');
assert.match(sw, /pathname === '\/naverpay-order'/, 'service worker must bypass dynamic product XML');
assert.match(config, /testOnly:\s*false/, 'customer-facing Naver Pay must be enabled after production approval');
assert.match(edge, /https:\/\/api\.pay\.naver\.com\/o\/customer\/api\/order\/v20\/register/, 'Edge must default to the production order API');
assert.match(edge, /sandbox:\s*false/, 'Edge public config must select the production order flow');
assert.equal((html.match(/id="npay-button-container"/g) || []).length, 1, 'product page must have one Naver Pay button container');
assert.match(html, /<div class="pp-bottom">[\s\S]*id="pmBuy"[\s\S]*id="npay-button-container"/, 'regular purchase must sit immediately before the Naver Pay action');
assert.match(css, /\.pp-bottom \.pp-npay-action/, 'bottom purchase bar must size the Naver Pay action');
assert.match(client, /classList\.toggle\('has-npay', visible\)/, 'purchase bar must reserve space only when Naver Pay is visible');
assert.match(client, /sessionStorage\.setItem\(testSessionKey, '1'\)/, 'Naver Pay test mode must survive canonical product routing in the same tab');
assert.match(client, /sessionStorage\.removeItem\(testSessionKey\)/, 'Naver Pay test mode must support an explicit opt-out');
assert.match(sw, /bellore-v351-auth-signup-integration/, 'latest service worker cache namespace must preserve Naver Pay and include signup integration');

console.log('Naver Pay live release contract: 19/19 passed');
