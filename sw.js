/* 벨로르 PWA 서비스워커 */
const VERSION = "bellore-v342-naverpay-bottom-action";
const SHELL_CACHE = `${VERSION}-shell`;
const RUNTIME_CACHE = `${VERSION}-runtime`;
const OFFLINE_FALLBACK = './index.html';

/* 오프라인에서도 첫 화면이 뜨도록 미리 캐시할 앱 셸 */
const SHELL_ASSETS = [
  './',
  './index.html',
  './styles.css?v=20260826-member-verification-live-v1',
  './wanted-theme.css?v=20260818-pretendard-v1',
  './vendor-reference.css?v=20260731-photo-viewer',
  './reference-layout.css?v=20260821-tabbar-safe-area-v1',
  './mypick.css?v=20260826-member-verification-live-v1',
  './bellore-redesign.css?v=20260826-naverpay-bottom-action-v1',
  './script.js?v=20260826-sell-services-member-v2',
  './payments.js?v=20260826-member-verification-live-v1',
  './naverpay.js?v=20260826-naverpay-bottom-action-v1',
  './ui-dialog.js?v=20260826-member-verification-live-v1',
  './supabase-config.js?v=20260826-naver-review-release',
  './analytics-core.js?v=20260810-analytics-v3',
  './analytics-client.js?v=20260826-ai-consent-v1',
  './brands.js',
  './supabase.js?v=20260826-member-verification-live-v1',
  './bellore-features.js?v=20260826-member-verification-live-v1',
  './cq-demo.js?v=20260826-member-verification-live-v1',
  './wishlist.js?v=20260826-member-verification-live-v1',
  './alerts.js?v=20260820-tabs-alerts-v1',
  './auction.js?v=20260826-member-verification-live-v1',
  './search.js?v=20260826-member-verification-live-v1',
  './ai-advisor.js?v=20260826-member-verification-live-v1',
  './ai-advisor-admin.js?v=20260826-member-verification-live-v1',
  './app/bootstrap.js?v=20260826-sell-services-member-v2',
  './app/features/analytics-consent/analytics-consent.css?v=20260826-ai-consent-v1',
  './app/features/checkout/checkout-addresses.css?v=20260826-shipping-address-popup-v2',
  './app/features/checkout/checkout-addresses.mjs?v=20260826-shipping-address-popup-v2',
  './app/features/checkout/shipping-address-popup.mjs',
  './app/core/customer-error.mjs?v=20260826-member-verification-live-v1',
  './app/core/listing-display.js?v=20260826-member-verification-live-v1',
  './app/core/market-product-url.mjs',
  './app/features/home-banners/home-banners.js?v=20260826-hero-layout-v7',
  './app/features/home-banners/home-banner-data.js?v=20260826-hero-layout-v7',
  './app/features/home-merchandising/home-merchandising.js?v=20260826-member-verification-live-v1',
  './app/features/home-banners/home-banners.css?v=20260826-hero-layout-v9',
  './app/features/home-quicklinks/home-quicklinks.js?v=20260826-hero-layout-v8',
  './app/features/home-quicklinks/home-quicklinks.css?v=20260826-rounded-corners-v1',
  './app/features/checkout/checkout-coupon.css?v=20260826-member-verification-live-v1',
  './app/features/checkout/checkout-coupon.js',
  './app/features/home-rows/home-rows.js?v=20260826-member-verification-live-v1',
  './app/features/home-rows/home-rows.css?v=20260826-price-bottom-v1',
  './app/features/condition-guide/condition-guide.css?v=20260826-member-verification-live-v1',
  './app/features/condition-guide/condition-guide.js?v=20260826-member-verification-live-v1',
  './app/features/listing-availability/listing-availability-ui.js?v=20260826-member-verification-live-v1',
  './app/features/listing-availability/market-static-status.js?v=20260826-member-verification-live-v1',
  './app/features/checkout/payment-flow.js?v=20260826-member-verification-live-v1',
  './app/features/home-rows/home-row-admin.js',
  './app/services/listings/listing-catalog-service.js?v=20260826-member-verification-live-v1',
  './app/services/payments/payment-auth.js?v=20260826-member-verification-live-v1',
  './app/services/payments/checkout-request-recovery.js?v=20260826-member-verification-live-v1',
  './app/services/payments/checkout-client.js?v=20260826-member-verification-live-v1',
  './app/services/payments/payment-network.js?v=20260826-member-verification-live-v1',
  './app/services/payments/pending-payment-recovery.js?v=20260826-member-verification-live-v1',
  './app/legacy/legacy-collection.js?v=20260826-member-verification-live-v1',
  './app/legacy/home-merchandising-grid.js',
  './app/legacy/customer-feedback.js?v=20260826-member-verification-live-v1',
  './app/legacy/checkout-coupon.js',
  './app/legacy/payment-auth.js',
  './app/legacy/legacy-reveal.js',
  './app/legacy/member-verification-service.js?v=20260826-member-verification-live-v1',
  './app/legacy/member-verification-ui.js?v=20260826-member-verification-live-v1',
  './app/legacy/page-runtime.js?v=20260826-sell-services-member-v2',
  './app/features/insights/insight-filter.js',
  './app/features/insights/insight-reader.js',
  './app/features/legal/legal-modals.js',
  './app/features/member-verification/signup-verification.js',
  './app/features/product-sharing/product-sharing.mjs',
  './app/services/auth/member-verification-service.js',
  './app/ui/hero-parallax.js',
  './app/ui/reveal-effects.js',
  './app/ui/site-header.js',
  './app/ui/navigation-history.js',
  './app/ui/width-preference.js',
  './app/vendor/recommendation-engine.js?v=20260826-member-verification-live-v1',
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
  './app/features/sell-method/sell-method.css?v=20260826-sell-services-member-v2',
  './app/features/sell-method/sell-quotes.css?v=20260826-sell-services-member-v2',
  './app/features/sell-method/sell-service-navigation.css?v=20260826-sell-services-member-v2',
  './app/features/sell-method/sell-service-pages.css?v=20260826-sell-services-member-v2',
  './app/features/sell-method/sell-service-action.css?v=20260826-sell-services-member-v2',
  './app/legacy/recommendation-engine.js?v=20260826-member-verification-live-v1',
  './app/features/sell-method/sell-method.js?v=20260826-sell-services-member-v2',
  './app/features/sell-method/sell-guide-preview.js?v=20260826-sell-quotes-v3',
  './app/features/sell-method/sell-reference-controller.js?v=20260826-sell-quotes-v3',
  './app/features/sell-method/sell-quote-controller.js?v=20260826-sell-quotes-v3',
  './app/features/sell-method/sell-service-pages.js?v=20260826-sell-services-member-v2',
  './assets/sell/trade/방문거래.png',
  './assets/sell/trade/택배거래.png',
  './assets/sell/trade/퀵거래.png',
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

  // 네이버 상품 XML은 요청마다 상품 ID와 재고가 달라지므로 캐시하지 않는다.
  if (url.pathname === '/naverpay-order' || url.pathname === '/naverpay-order/') {
    event.respondWith(fetch(req));
    return;
  }

  if (req.mode === 'navigate') {
    const paymentReturn = url.searchParams.get('pay') === 'portone' ||
      url.searchParams.has('paymentId') || url.searchParams.has('code');
    event.respondWith(
      fetch(req)
        .then(async (res) => {
          if (res && res.status === 200 && !paymentReturn) {
            const copy = res.clone();
            const cache = await caches.open(RUNTIME_CACHE);
            await cache.put(req, copy);
          }
          return res;
        })
        .catch(async () => {
          const exactPage = paymentReturn ? null : await caches.match(req);
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
            await cache.put(url.origin + url.pathname, copy);
          }
          return res;
        })
        .catch(() => caches.match(req, { ignoreSearch: true })
          .then((cached) => cached || new Response('', { status: 503 })))
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
