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
assert.match(config, /testOnly:\s*true/, 'Naver Pay must stay restricted to the named review account until final approval');
assert.match(edge, /https:\/\/api\.pay\.naver\.com\/o\/customer\/api\/order\/v20\/register/, 'Edge must default to the production order API');
assert.match(edge, /https:\/\/test-api\.pay\.naver\.com\/o\/customer\/api\/order\/v20\/register/, 'review mode must use the official test order API');
assert.match(edge, /sandbox:\s*SANDBOX/, 'Edge public config must report the selected environment');
assert.equal((html.match(/id="npay-button-container"/g) || []).length, 1, 'product page must have one Naver Pay button container');
assert.match(html, /<div class="pp-bottom">[\s\S]*id="pmBuy"[\s\S]*id="npay-button-container"/, 'regular purchase must sit immediately before the Naver Pay action');
assert.match(css, /\.pp-bottom \.pp-npay-action/, 'bottom purchase bar must size the Naver Pay action');
assert.match(client, /classList\.toggle\('has-npay', visible\)/, 'purchase bar must reserve space only when Naver Pay is visible');
assert.match(client, /window\.sbClient\.auth\.getSession\(\)/, 'review mode must require a real Supabase login session');
assert.match(client, /headers\.Authorization = 'Bearer ' \+ token/, 'review requests must carry the authenticated session');
assert.doesNotMatch(client, /naverPayTest/, 'a public query parameter must never unlock Naver Pay review mode');
assert.match(edge, /select\("username"\)/, 'the Edge must authorize the configured review username');
assert.match(edge, /return json\(\{ error: "forbidden" \}, 403\)/, 'unauthorized review requests must be rejected server-side');
assert.match(sw, /const VERSION = "bellore-v\d+-[a-z0-9-]+";/, 'service worker cache namespace must remain a versioned Bellore release');
assert.match(sw, /app\/services\/sell\/sell-request-access\.js/, 'service worker must preserve the sell persistence runtime');

assert.match(edge, /function parseProviderFailure\(/, 'provider failures must be parsed into safe structured diagnostics');
assert.match(edge, /providerCode:\s*failure\.providerCode/, 'provider error code must be returned to the browser');
assert.match(edge, /traceId,\s*status:\s*response\.status/, 'provider failures must be correlated without logging order XML');
assert.doesNotMatch(edge, /console\.error\([^\n]*orderXml/, 'order XML and credentials must never be written to failure logs');
assert.match(edge, /providerMessage\.split\(secret\)\.join\("\[REDACTED\]"\)/, 'provider diagnostics must redact configured credentials');
assert.match(client, /error\.providerCode = data\.providerCode/, 'client must retain the provider error code');
assert.match(client, /traceId:\s*error && error\.traceId/, 'client diagnostics must expose the matching trace ID');

console.log('Naver Pay live release contract: 26/26 passed');
