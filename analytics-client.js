(function () {
  'use strict';

  var CFG = window.BELLORE_ANALYTICS || {};
  var Core = window.BelloreAnalyticsCore;
  var NOOP = Promise.resolve(false);
  var SESSION_MS = Number(CFG.sessionTimeoutMinutes || 30) * 60 * 1000;
  var STORAGE = String(CFG.projectPrefix || 'bellore') + ':analytics:';
  var CONSENT_KEY = STORAGE + 'consent';
  var VISITOR_KEY = STORAGE + 'anonymous_id';
  var SESSION_KEY = STORAGE + 'session';
  var FIRST_TOUCH_KEY = STORAGE + 'first_touch';
  var QUEUE_KEY = STORAGE + 'queue';
  var started = false;
  var session = null;
  var visibleFrom = document.visibilityState === 'visible' ? Date.now() : 0;
  var engagedMs = 0;
  var navigationId = randomId();
  var viewId = routeId();
  var segmentId = randomId();
  var aggregateSent = false;

  function randomId() {
    return window.crypto && crypto.randomUUID ? crypto.randomUUID() :
      'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16);
      });
  }
  function read(key, fallback) {
    try { var value = localStorage.getItem(key); return value ? JSON.parse(value) : fallback; }
    catch (_e) { return fallback; }
  }
  function write(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (_e) { return false; }
  }
  function remove(key) { try { localStorage.removeItem(key); } catch (_e) {} }
  function consent() {
    var current = CFG.policyVersion || '2026-08-10-ip-v1';
    var value = read(CONSENT_KEY, null);
    return value && value.policy_version === current ? value : { analytics: 'pending', ads: 'pending', policy_version: current };
  }
  function analyticsGranted() { return consent().analytics === 'granted'; }
  function internalTraffic() { return !!(window.NWBackend && window.NWBackend.isAdmin && window.NWBackend.isAdmin()); }
  function hostAllowed() {
    var host = location.hostname.toLowerCase();
    return (CFG.allowedHosts || []).map(function (h) { return String(h).toLowerCase(); }).indexOf(host) >= 0;
  }
  function environment() {
    var host = location.hostname.toLowerCase();
    return (CFG.previewHosts || []).indexOf(host) >= 0 ? 'preview' : 'production';
  }
  function routeId() { return String((location.hash || '#home').slice(1) || 'home').replace(/[^a-z0-9_-]/gi, '').slice(0, 64) || 'home'; }
  function deviceClass() { return matchMedia('(max-width: 767px)').matches ? 'mobile' : (matchMedia('(max-width: 1023px)').matches ? 'tablet' : 'desktop'); }
  function visitorId() {
    if (!analyticsGranted()) return null;
    var id = read(VISITOR_KEY, null);
    if (!id) { id = randomId(); write(VISITOR_KEY, id); }
    return id;
  }
  function currentAcquisition() {
    return Core.parseAcquisition(location.href, document.referrer, CFG.allowedHosts || []);
  }
  function ensureSession(now) {
    now = now || Date.now();
    var stored = read(SESSION_KEY, null);
    var fresh = !stored || Core.sessionExpired(stored.last_activity, now, SESSION_MS);
    if (fresh) {
      session = { id: randomId(), started_at: now, last_activity: now, touch: currentAcquisition() };
      write(SESSION_KEY, session);
      if (!read(FIRST_TOUCH_KEY, null)) write(FIRST_TOUCH_KEY, session.touch);
    } else {
      session = stored;
      session.last_activity = now;
      write(SESSION_KEY, session);
    }
    return fresh;
  }
  function envelope(name, targetId, properties) {
    var now = Date.now();
    var fresh = ensureSession(now);
    var payload = {
      event_id: randomId(), event_name: name, event_version: 1,
      occurred_at: new Date(now).toISOString(), site_id: CFG.siteId,
      environment: environment(), anonymous_id: visitorId(), session_id: session.id,
      view_id: viewId, target_id: targetId || null,
      acquisition: { first_touch: read(FIRST_TOUCH_KEY, null), session_touch: session.touch },
      consent: consent(), properties: Core.sanitizeProperties(name, properties)
    };
    return { payload: payload, fresh: fresh };
  }
  function queue() { return read(QUEUE_KEY, []); }
  function setQueue(items) { write(QUEUE_KEY, (items || []).slice(-50)); }
  function requestHeaders() {
    var headers = { 'Content-Type': 'application/json', 'apikey': (window.BELLORE_SUPABASE || {}).anonKey || '' };
    if (!window.sbClient || !window.sbClient.auth || !window.sbClient.auth.getSession) return Promise.resolve(headers);
    return window.sbClient.auth.getSession().then(function (result) {
      var token = result && result.data && result.data.session && result.data.session.access_token;
      if (token) headers.Authorization = 'Bearer ' + token;
      return headers;
    }).catch(function () { return headers; });
  }
  function sendConsentAggregate() {
    var state = consent().analytics;
    if (aggregateSent || !CFG.enabled || !hostAllowed() || internalTraffic() || !CFG.collectUrl || (state !== 'granted' && state !== 'denied')) return NOOP;
    aggregateSent = true;
    var payload = {
      aggregate_only: true,
      site_id: CFG.siteId,
      environment: environment(),
      occurred_at: new Date().toISOString(),
      consent_state: state,
      policy_version: consent().policy_version
    };
    return requestHeaders().then(function (headers) {
      return fetch(CFG.collectUrl, {
        method: 'POST', keepalive: true, headers: headers, body: JSON.stringify(payload)
      });
    }).then(function (r) {
      if (!r.ok) throw new Error('analytics_aggregate_' + r.status); return true;
    }).catch(function () { aggregateSent = false; return false; });
  }
  function send(payload, keepalive) {
    if (!CFG.enabled || !hostAllowed() || !analyticsGranted() || internalTraffic() || !CFG.collectUrl) return NOOP;
    return requestHeaders().then(function (headers) {
      return fetch(CFG.collectUrl, {
        method: 'POST', keepalive: !!keepalive, headers: headers, body: JSON.stringify(payload)
      });
    }).then(function (r) {
      if (!r.ok) throw new Error('analytics_' + r.status); return true;
    }).catch(function () {
      if (!keepalive) { var items = queue(); items.push(payload); setQueue(items); }
      return false;
    });
  }
  function flush() {
    if (!analyticsGranted()) { setQueue([]); return; }
    var items = queue(); if (!items.length) return;
    setQueue([]);
    items.reduce(function (p, item) {
      return p.then(function () { return send(item, false); });
    }, Promise.resolve());
  }
  function track(name, targetId, properties, keepalive) {
    if (!Core.allowedEvent(name) || !analyticsGranted()) return NOOP;
    var built = envelope(name, targetId, properties || {});
    if (built.fresh && name !== 'session_start') {
      var start = envelope('session_start', null, { device_class: deviceClass() });
      return send(start.payload, false).then(function () { return send(built.payload, keepalive); });
    }
    return send(built.payload, keepalive);
  }
  function page(id) {
    settleDwell();
    viewId = String(id || routeId()).replace(/^#/, '').slice(0, 64) || 'home';
    navigationId = randomId(); segmentId = randomId();
    visibleFrom = document.visibilityState === 'visible' ? Date.now() : 0;
    return track('view_open', null, { route: '#' + viewId, navigation_id: navigationId });
  }
  function settleDwell() {
    if (visibleFrom) { engagedMs += Math.max(0, Date.now() - visibleFrom); visibleFrom = 0; }
    if (engagedMs > 0 && analyticsGranted()) {
      track('view_dwell', null, { engaged_ms: Math.round(engagedMs), segment_id: segmentId }, true);
      engagedMs = 0; segmentId = randomId();
    }
  }
  function conversionContext() {
    if (!analyticsGranted()) return null;
    ensureSession(Date.now());
    return {
      event_id: randomId(), anonymous_id: visitorId(), session_id: session.id,
      first_touch: read(FIRST_TOUCH_KEY, null), session_touch: session.touch,
      conversion_touch: currentAcquisition(), consent: consent()
    };
  }
  function loadScript(src, id) {
    if (id && document.getElementById(id)) return;
    var s = document.createElement('script'); s.async = true; s.src = src; if (id) s.id = id;
    document.head.appendChild(s);
  }
  function syncMarketing() {
    if (!window.NWBackend || !window.NWBackend.ready || internalTraffic() || consent().ads !== 'granted') return;
    if (CFG.googleAdsId) {
      window.dataLayer = window.dataLayer || [];
      window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
      window.gtag('js', new Date()); window.gtag('config', CFG.googleAdsId);
      loadScript('https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(CFG.googleAdsId), 'bellore-google-ads');
    }
    if (CFG.naverWcsId) {
      loadScript('https://wcs.naver.net/wcslog.js', 'bellore-naver-wcs');
      var tries = 0, timer = setInterval(function () {
        tries++;
        if (window.wcs) {
          clearInterval(timer); window.wcs_add = window.wcs_add || {}; window.wcs_add.wa = CFG.naverWcsId;
          if (window.wcs.inflow) window.wcs.inflow(location.hostname);
          if (window.wcs_do) window.wcs_do();
        } else if (tries > 30) clearInterval(timer);
      }, 100);
    }
  }
  function applyConsent(next) {
    var previous = consent();
    var value = { analytics: next.analytics, ads: next.ads, policy_version: CFG.policyVersion || '2026-08-10-ip-v1', updated_at: new Date().toISOString() };
    write(CONSENT_KEY, value);
    sendConsentAggregate();
    if (value.analytics !== 'granted') {
      remove(VISITOR_KEY); remove(SESSION_KEY); remove(FIRST_TOUCH_KEY); remove(QUEUE_KEY); session = null;
    } else {
      var wasDenied = previous.analytics !== 'granted';
      if (wasDenied) track('consent_updated', null, { analytics: value.analytics, ads: value.ads }).then(function () { page(routeId()); });
      flush();
    }
    syncMarketing(); closeConsent();
  }
  function closeConsent() { var el = document.getElementById('analyticsConsent'); if (el) el.remove(); }
  function showConsent(force) {
    if (!force && consent().analytics !== 'pending') return;
    closeConsent();
    var c = consent(), el = document.createElement('section');
    el.id = 'analyticsConsent'; el.className = 'analytics-consent';
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', '개인정보 및 경험 설정');
    el.innerHTML = '<div class="analytics-consent-card">' +
      '<header class="analytics-consent-head"><img src="assets/logo-bellore.png" alt="BELLORE"><span>PRIVACY &amp; EXPERIENCE</span></header>' +
      '<div class="analytics-consent-intro"><h2>당신의 취향이 더 빛나도록</h2>' +
      '<p>관심 있게 본 시계와 이용 흐름을 이해하면, 더 잘 맞는 상품과 한층 편리한 벨로르 경험을 준비할 수 있습니다.</p>' +
      '<p class="analytics-consent-note">선택해 주신 정보는 서비스 개선과 광고 성과 확인에만 안전하게 사용합니다. 비동의 시에는 개인 식별 정보 없이 동의 상태별 방문 숫자만 합산하며, 필수 기능은 동일하게 이용할 수 있습니다.</p></div>' +
      '<div class="analytics-consent-options" data-consent-options' + (force ? '' : ' hidden') + '>' +
        '<div class="analytics-consent-options-head"><div><b>나에게 맞는 경험 설정</b><span>선택은 언제든 개인정보처리방침에서 변경할 수 있습니다.</span></div><button type="button" data-legal-open="privacy">자세히 보기</button></div>' +
        '<div class="analytics-purpose essential"><div><b>필수 기능</b><span>로그인·보관함·주문·보안 등 서비스 운영에 꼭 필요한 기능</span></div><em>항상 사용</em></div>' +
        '<label class="analytics-purpose"><div><b>서비스 경험 분석</b><span>방문·유입·상품 조회 흐름을 살펴 더 좋은 상품 구성과 이용 경험을 만듭니다.</span></div><input type="checkbox" data-consent-analytics' + (c.analytics === 'granted' ? ' checked' : '') + '><i aria-hidden="true"></i></label>' +
        '<label class="analytics-purpose"><div><b>광고 성과 측정</b><span>Google·Naver 캠페인의 성과를 확인해 더 유용한 소식을 전합니다.</span></div><input type="checkbox" data-consent-ads' + (c.ads === 'granted' ? ' checked' : '') + '><i aria-hidden="true"></i></label>' +
      '</div>' +
      '<div class="analytics-consent-actions">' +
        '<button type="button" class="primary" data-consent="all">모두 동의</button>' +
        '<button type="button" data-consent="essential">필수만 사용</button>' +
        '<button type="button" class="more" data-consent="options">더 많은 옵션</button>' +
        '<button type="button" class="save" data-consent="save"' + (force ? '' : ' hidden') + '>선택 저장</button>' +
      '</div></div>';
    document.body.appendChild(el);
    el.addEventListener('click', function (e) {
      var button = e.target.closest('[data-consent]'); if (!button) return;
      if (button.dataset.consent === 'essential') applyConsent({ analytics: 'denied', ads: 'denied' });
      else if (button.dataset.consent === 'all') applyConsent({ analytics: 'granted', ads: 'granted' });
      else if (button.dataset.consent === 'options') {
        el.querySelector('[data-consent-options]').hidden = false;
        button.hidden = true;
        el.querySelector('[data-consent="save"]').hidden = false;
        el.classList.add('is-customizing');
      }
      else applyConsent({
        analytics: el.querySelector('[data-consent-analytics]').checked ? 'granted' : 'denied',
        ads: el.querySelector('[data-consent-ads]').checked ? 'granted' : 'denied'
      });
    });
  }
  function init() {
    if (started || !Core) return; started = true;
    var storedConsent = read(CONSENT_KEY, null);
    if (storedConsent && storedConsent.policy_version !== (CFG.policyVersion || '2026-08-10-ip-v1')) {
      remove(VISITOR_KEY); remove(SESSION_KEY); remove(FIRST_TOUCH_KEY); remove(QUEUE_KEY); session = null;
    }
    var backendReady = window.NWBackend && window.NWBackend.ready ? window.NWBackend.ready : Promise.resolve();
    backendReady.then(function () {
      var state = consent().analytics;
      if (state === 'granted' && !internalTraffic()) { sendConsentAggregate(); page(routeId()); flush(); }
      else if (state === 'denied' && !internalTraffic()) sendConsentAggregate();
      else showConsent(false);
      syncMarketing();
    });
    document.addEventListener('click', function (e) {
      var settings = e.target.closest('[data-analytics-settings]');
      if (settings) { e.preventDefault(); showConsent(true); return; }
      var tel = e.target.closest('a[href^="tel:"]');
      if (tel) { track('phone_call', tel.dataset.analyticsId || 'site_phone', { measurement: 'click_intent', location_id: tel.dataset.locationId || null }); return; }
      var target = e.target.closest('[data-analytics-id]'); if (!target) return;
      var id = target.dataset.analyticsId;
      track(target.dataset.analyticsEvent || 'element_click', id, {});
    }, true);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') { settleDwell(); track('page_exit', null, { navigation_id: navigationId }, true); }
      else { visibleFrom = Date.now(); track('page_return', null, { navigation_id: navigationId }); }
    });
    window.addEventListener('pagehide', function () { settleDwell(); track('page_exit', null, { navigation_id: navigationId }, true); });
    window.addEventListener('online', flush);
    document.addEventListener('bellore:auth', function () {
      if (internalTraffic()) { remove(SESSION_KEY); remove(QUEUE_KEY); session = null; }
    });
  }

  window.BelloreAnalytics = {
    init: init, track: track, page: page, consent: consent,
    openConsentSettings: function () { showConsent(true); },
    conversionContext: conversionContext,
    purchaseComplete: function (order, value, listingId) {
      if (!order || !order.id) return NOOP;
      return track('purchase_complete', 'checkout_payment', { conversion_id: order.id, listing_id: listingId || null, value: Number(value) || 0, currency: 'KRW' });
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
}());
