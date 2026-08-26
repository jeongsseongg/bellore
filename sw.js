/* 벨로르 PWA 서비스워커 */
const VERSION = "bellore-v296-banner-ratio";
const SHELL_CACHE = `${VERSION}-shell`;
const RUNTIME_CACHE = `${VERSION}-runtime`;
const OFFLINE_FALLBACK = './index.html';

/* 오프라인에서도 첫 화면이 뜨도록 미리 캐시할 앱 셸 */
const SHELL_ASSETS = [
  './',
  './index.html',
  './styles.css?v=20260826-hero-campaigns-v8',
  './wanted-theme.css?v=20260818-pretendard-v1',
  './vendor-reference.css?v=20260731-photo-viewer',
  './reference-layout.css?v=20260821-tabbar-safe-area-v1',
  './mypick.css?v=20260731-mypick-reference-4',
  './bellore-redesign.css?v=20260826-hero-campaigns-v8',
  './script.js?v=20260826-hero-campaigns-v8',
  './payments.js?v=20260826-hero-campaigns-v8',
  './naverpay.js?v=20260728-naver-review-fixes-2',
  './ui-dialog.js?v=20260826-hero-campaigns-v8',
  './supabase-config.js?v=20260814-kg-card-review',
  './analytics-core.js?v=20260810-analytics-v3',
  './analytics-client.js?v=20260826-ai-consent-v1',
  './brands.js',
  './supabase.js?v=20260825-payment-session-v1',
  './bellore-features.js?v=20260826-hero-campaigns-v8',
  './cq-demo.js?v=20260826-hero-campaigns-v8',
  './wishlist.js?v=20260824-purl-v2',
  './alerts.js?v=20260820-tabs-alerts-v1',
  './auction.js?v=20260826-hero-campaigns-v8',
  './search.js?v=20260824-purl-v2',
  './ai-advisor.js?v=20260814-kg-card-review',
  './ai-advisor-admin.js?v=20260725-ai-log',
  './app/bootstrap.js?v=20260826-hero-campaigns-v8',
  './app/features/analytics-consent/analytics-consent.css?v=20260826-ai-consent-v1',
  './app/features/checkout/checkout-addresses.css?v=20260826-checkout-addresses-v1',
  './app/features/checkout/checkout-addresses.mjs',
  './app/core/customer-error.mjs',
  './app/core/listing-display.js',
  './app/core/market-product-url.mjs',
  './app/features/home-banners/home-banners.js',
  './app/features/home-banners/home-banner-data.js',
  './app/features/home-merchandising/home-merchandising.js',
  './app/features/home-banners/home-banners.css?v=20260826-hero-campaigns-v8',
  './app/features/home-quicklinks/home-quicklinks.js',
  './app/features/home-quicklinks/home-quicklinks.js?v=20260826-hero-campaigns-v8',
  './app/features/home-quicklinks/home-quicklinks.css?v=20260826-hero-campaigns-v8',
  './app/features/checkout/checkout-coupon.css?v=20260826-hero-campaigns-v8',
  './app/features/checkout/checkout-coupon.js',
  './app/features/home-rows/home-rows.js',
  './app/features/home-rows/home-rows.css?v=20260826-hero-campaigns-v8',
  './app/features/home-rows/home-row-admin.js',
  './app/services/listings/listing-catalog-service.js',
  './app/services/payments/payment-auth.js',
  './app/legacy/legacy-collection.js',
  './app/legacy/legacy-collection.js?v=20260825-home-typography-admin-layout-v8',
  './app/legacy/home-merchandising-grid.js',
  './app/legacy/customer-feedback.js',
  './app/legacy/checkout-coupon.js',
  './app/legacy/payment-auth.js',
  './app/legacy/legacy-reveal.js',
  './app/legacy/page-runtime.js?v=20260826-hero-campaigns-v8',
  './app/features/insights/insight-filter.js',
  './app/features/insights/insight-reader.js',
  './app/features/legal/legal-modals.js',
  './app/features/product-sharing/product-sharing.mjs',
  './app/ui/hero-parallax.js',
  './app/ui/hero-parallax.js?v=20260825-home-typography-admin-layout-v8',
  './app/ui/reveal-effects.js',
  './app/ui/site-header.js',
  './app/ui/navigation-history.js',
  './app/ui/width-preference.js',
  './app/vendor/recommendation-engine.js',
  './manifest.json',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/apple-touch-icon.png',
  './assets/home-banner-1.png',
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
  './assets/banners/buyin-01.webp',
  './assets/banners/buyin-02.webp',
  './assets/banners/buyin-03.webp',
  './assets/banners/buyin-04.webp',
  './assets/banners/buyin-05.webp',
  './assets/banners/buyin-06.webp',
  './assets/banners/product-stage-01.webp',
  './assets/banners/product-stage-02.webp',
  './assets/banners/product-stage-03.webp',
  './assets/banners/product-stage-04.webp',
  './assets/banners/product-stage-05.webp',
  './assets/banners/product-stage-06.webp',
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

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(async (res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            const cache = await caches.open(RUNTIME_CACHE);
            await cache.put(req, copy);
          }
          return res;
        })
        .catch(async () => {
          const exactPage = await caches.match(req);
          return exactPage || caches.match(OFFLINE_FALLBACK);
        })
    );
    return;
  }

  const isAppCode = /\.(?:js|css|html)(?:\?|$)/.test(url.pathname) ||
    url.pathname === '/' || url.pathname.endsWith('/');
  if (isAppCode) {
    event.respondWith(
      fetch(req)
        .then(async (res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            const cache = await caches.open(SHELL_CACHE);
            await cache.put(req, copy);
          }
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(RUNTIME_CACHE).then((c) => c.put(req, copy));
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
