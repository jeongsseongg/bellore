const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.resolve(__dirname, '..', 'sw.js'), 'utf8');

function harness(fetchImpl, matchImpl) {
  const handlers = {};
  const puts = [];
  const matchCalls = [];
  const sandbox = {
    URL,
    Request,
    Response,
    console,
    fetch: fetchImpl,
    caches: {
      keys: async () => [],
      delete: async () => true,
      match: async (request, options) => {
        matchCalls.push({ request, options });
        return matchImpl ? matchImpl(request, options) : undefined;
      },
      open: async () => ({
        addAll: async () => {},
        put: async (key, response) => {
          puts.push({ key: typeof key === 'string' ? key : key.url, body: await response.text() });
        }
      })
    },
    self: {
      location: { origin: 'https://bellore.test', href: 'https://bellore.test/sw.js' },
      addEventListener(type, handler) { handlers[type] = handler; },
      skipWaiting: async () => {},
      clients: { claim: async () => {}, matchAll: async () => [] },
      registration: { showNotification: async () => {} }
    }
  };
  vm.runInNewContext(source, sandbox, { filename: 'sw.js' });
  return { handlers, puts, matchCalls };
}

async function dispatchFetch(h, request) {
  let responsePromise;
  h.handlers.fetch({
    request,
    respondWith(value) { responsePromise = Promise.resolve(value); }
  });
  assert(responsePromise, 'service worker must handle same-origin GET');
  return responsePromise;
}

(async () => {
  const offlineAsset = harness(
    async () => { throw new Error('offline'); },
    async () => undefined
  );
  const assetResponse = await dispatchFetch(offlineAsset, {
    method: 'GET',
    mode: 'same-origin',
    url: 'https://bellore.test/ai-advisor.js?v=20260822'
  });
  assert.equal(assetResponse.status, 503);
  assert.equal(await assetResponse.text(), '');
  assert.equal(offlineAsset.matchCalls.length, 1);
  assert.equal(offlineAsset.matchCalls[0].options.ignoreSearch, true);

  const offlineNavigation = harness(
    async () => { throw new Error('offline'); },
    async (request) => String(request).includes('index.html') ? new Response('INDEX') : undefined
  );
  const navResponse = await dispatchFetch(offlineNavigation, {
    method: 'GET',
    mode: 'navigate',
    url: 'https://bellore.test/watches/rolex'
  });
  assert.equal(await navResponse.text(), 'INDEX');

  const onlineAsset = harness(
    async () => new Response('const ok = true;', { status: 200 }),
    async () => undefined
  );
  const onlineResponse = await dispatchFetch(onlineAsset, {
    method: 'GET',
    mode: 'same-origin',
    url: 'https://bellore.test/recommendation-engine.js?v=2'
  });
  assert.equal(await onlineResponse.text(), 'const ok = true;');
  assert.equal(onlineAsset.puts.length, 1, 'cache put must finish before the response promise resolves');
  assert.equal(onlineAsset.puts[0].key, 'https://bellore.test/recommendation-engine.js');

  console.log('service worker offline routing invariants: ok');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
