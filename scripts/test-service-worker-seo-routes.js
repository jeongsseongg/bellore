const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ORIGIN = 'https://bellore.co.kr';

function cacheKey(request) {
  const value = typeof request === 'string' ? request : request.url;
  return new URL(value, `${ORIGIN}/sw.js`).href;
}

class MemoryCache {
  constructor() {
    this.entries = new Map();
  }

  async put(request, response) {
    this.entries.set(cacheKey(request), response.clone());
  }

  async match(request) {
    const response = this.entries.get(cacheKey(request));
    return response ? response.clone() : undefined;
  }
}

function createCacheStorage() {
  const stores = new Map();
  return {
    stores,
    async open(name) {
      if (!stores.has(name)) stores.set(name, new MemoryCache());
      return stores.get(name);
    },
    async match(request) {
      for (const cache of stores.values()) {
        const response = await cache.match(request);
        if (response) return response;
      }
      return undefined;
    },
    async keys() {
      return [...stores.keys()];
    },
    async delete(name) {
      return stores.delete(name);
    }
  };
}

function navigationRequest(pathname) {
  return {
    method: 'GET',
    mode: 'navigate',
    url: new URL(pathname, ORIGIN).href
  };
}

(async () => {
  const swPath = path.resolve(__dirname, '..', 'sw.js');
  const source = fs.readFileSync(swPath, 'utf8');
  const version = source.match(/const VERSION = "([^"]+)";/)?.[1];
  assert.equal(version, 'bellore-v256-home-rows-cards', 'SEO route change advances the cache version');
  assert.doesNotMatch(source, /req\.mode === 'navigate' \? '\.\/index\.html'/, 'navigation never overwrites the home cache key');

  const listeners = new Map();
  const caches = createCacheStorage();
  let networkFetch = async () => { throw new Error('network response not configured'); };
  const context = {
    URL,
    caches,
    fetch: (request) => networkFetch(request),
    self: {
      location: { origin: ORIGIN },
      addEventListener(type, listener) { listeners.set(type, listener); },
      skipWaiting: async () => {},
      clients: { claim: async () => {} },
      registration: { showNotification: async () => {} }
    }
  };
  vm.runInNewContext(source, context, { filename: swPath });

  const shellCache = await caches.open(`${version}-shell`);
  await shellCache.put('./index.html', new Response('offline home', { status: 200 }));

  async function dispatch(request) {
    let responsePromise;
    listeners.get('fetch')({
      request,
      respondWith(value) { responsePromise = Promise.resolve(value); }
    });
    assert(responsePromise, `fetch handler responds to ${request.url}`);
    return responsePromise;
  }

  for (const [pathname, body] of [
    ['/market/', 'market hub'],
    ['/market/rol-n21268-4/', 'product page']
  ]) {
    const request = navigationRequest(pathname);
    networkFetch = async () => new Response(body, { status: 200 });
    const online = await dispatch(request);
    assert.equal(await online.text(), body, `${pathname} returns its network response`);

    networkFetch = async () => { throw new Error('offline'); };
    const offline = await dispatch(request);
    assert.equal(await offline.text(), body, `${pathname} retains its own cached response offline`);
  }

  const missingRequest = navigationRequest('/market/not-found/');
  networkFetch = async () => new Response('not found', { status: 404 });
  const missing = await dispatch(missingRequest);
  assert.equal(missing.status, 404, 'online 404 remains a 404 response');
  assert.equal(await caches.match(missingRequest), undefined, '404 navigation response is not cached');
  assert.equal(await (await shellCache.match('./index.html')).text(), 'offline home', '404 does not overwrite the home cache');

  networkFetch = async () => { throw new Error('offline'); };
  const fallback = await dispatch(missingRequest);
  assert.equal(await fallback.text(), 'offline home', 'uncached offline navigation uses the explicit app-shell fallback');

  console.log('service worker SEO route invariants: ok');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
