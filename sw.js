/* 벨로르 PWA 서비스워커 */
const VERSION = "bellore-v318-expert-status-card-clean";
const SHELL_CACHE = `${VERSION}-shell`;
const RUNTIME_CACHE = `${VERSION}-runtime`;

/* 오프라인에서도 첫 화면이 뜨도록 미리 캐시할 앱 셸 */
const SHELL_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './wanted-theme.css',
  './vendor-reference.css',
  './reference-layout.css',
  './mypick.css',
  './bellore-redesign.css?v=20260826-expert-status-v1',
  './app/features/sell-method/sell-method.css?v=20260826-sell-method-v12',
  './script.js?v=20260826-expert-status-card-clean-v2',
  './payments.js',
  './naverpay.js',
  './ui-dialog.js',
  './supabase-config.js',
  './analytics-core.js',
  './analytics-client.js',
  './brands.js',
  './supabase.js',
  './bellore-features.js',
  './cq-demo.js',
  './recommendation-engine.js',
  './wishlist.js',
  './alerts.js',
  './auction.js',
  './search.js',
  './ai-advisor.js',
  './ai-advisor-admin.js',
  './app/bootstrap.js?v=20260826-copy-cleanup-card-clean-v2',
  './app/core/listing-display.js',
  './app/features/home-banners/home-banner-data.js?v=20260826-copy-cleanup-v1',
  './app/features/home-banners/home-banners.js?v=20260826-copy-cleanup-v1',
  './app/features/home-banners/home-banners.css?v=20260826-hero-collections-v1',
  './app/features/home-rows/home-rows.js?v=20260826-card-trust-clean-v2',
  './app/features/home-rows/home-rows.css?v=20260826-card-price-lock-v1',
  './app/features/sell-method/sell-method.js?v=20260826-sell-method-v16',
  './시계판매 이미지/비교견적.png',
  './시계판매 이미지/위탁판매.png',
  './시계판매 이미지/즉시매입.png',
  './구성품 이미지/ChatGPT Image 2026년 8월 26일 오전 11_18_56 (1).png',
  './구성품 이미지/ChatGPT Image 2026년 8월 26일 오전 11_18_56 (2).png',
  './구성품 이미지/ChatGPT Image 2026년 8월 26일 오전 11_18_57 (3).png',
  './구성품 이미지/ChatGPT Image 2026년 8월 26일 오전 11_18_57 (4).png',
  './구성품 이미지/ChatGPT Image 2026년 8월 26일 오전 11_18_57 (5).png',
  './구성품 이미지/ChatGPT Image 2026년 8월 26일 오전 11_18_58 (6).png',
  './assets/cq-guide/front.jpg',
  './assets/cq-guide/back.jpg',
  './assets/cq-guide/left.jpg',
  './assets/cq-guide/right.jpg',
  './assets/cq-guide/clasp.jpg',
  './assets/cq-guide/parts.jpg',
  './app/services/listings/listing-catalog-service.js',
  './app/legacy/legacy-collection.js?v=20260826-hero-collections-v3',
  './app/features/insights/insight-filter.js',
  './app/features/insights/insight-reader.js',
  './app/features/legal/legal-modals.js',
  './app/ui/hero-parallax.js',
  './app/ui/site-header.js',
  './manifest.json',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/apple-touch-icon.png',
  './assets/banners/hero-01.webp',
  './assets/banners/hero-02.webp',
  './assets/banners/hero-03.webp',
  './assets/banners/hero-04.webp',
  './assets/banners/hero-05.webp',
  './assets/banners/hero-06.webp',
  './assets/banners/hero-07.webp',
  './assets/banners/hero-08.webp',
  './assets/banners/hero-09.webp',
  './assets/banners/hero-10.webp',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const isAppCode = req.mode === 'navigate' ||
    /\.(?:js|css|html)(?:\?|$)/.test(url.pathname) ||
    url.pathname === '/' || url.pathname.endsWith('/');
  if (isAppCode) {
    event.respondWith(
      fetch(req)
        .then(async (res) => {
          const copy = res.clone();
          const cache = await caches.open(SHELL_CACHE);
          const cacheKey = req.mode === 'navigate'
            ? new Request(new URL('./index.html', self.location.href).href)
            : new Request(url.origin + url.pathname);
          await cache.put(cacheKey, copy);
          return res;
        })
        .catch(() => {
          if (req.mode === 'navigate') return caches.match('./index.html', { ignoreSearch: true });
          return caches.match(req, { ignoreSearch: true }).then((cached) => cached || new Response('', {
            status: 503,
            statusText: 'Offline asset unavailable'
          }));
        })
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then(async (res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            const cache = await caches.open(RUNTIME_CACHE);
            await cache.put(req, copy);
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});

/* 알림 클릭 → 앱 열기/포커스 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || './';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => {
      for (const c of cs) { if ('focus' in c) return c.focus(); }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    })
  );
});

/* 웹 푸시 수신(백그라운드) — 향후 VAPID 서버 연동 시 동작 */
self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch (e) {}
  const title = d.title || '벨로르 알림';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: d.body || '',
      icon: 'assets/icons/icon-192.png',
      badge: 'assets/icons/icon-192.png',
      tag: d.tag || 'bellore',
      data: { url: d.url || './' }
    })
  );
});
