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
  function consent() { return read(CONSENT_KEY, { analytics: 'pending', ads: 'pending', policy_version: CFG.policyVersion || '2026-08-10' }); }
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
    var value = { analytics: next.analytics, ads: next.ads, policy_version: CFG.policyVersion || '2026-08-10', updated_at: new Date().toISOString() };
    write(CONSENT_KEY, value);
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
    el.id = 'analyticsConsent'; el.className = 'analytics-consent'; el.setAttribute('aria-label', '쿠키 및 분석 설정');
    el.innerHTML = '<div class="analytics-consent-card"><strong>개인정보와 선택권을 지켜요</strong>' +
      '<p>서비스 개선용 익명 활동 분석과 광고 성과 측정은 동의한 경우에만 사용합니다. 필수 기능은 동의 없이 이용할 수 있습니다.</p>' +
      '<details' + (force ? ' open' : '') + '><summary>직접 설정</summary>' +
      '<label><input type="checkbox" data-consent-analytics' + (c.analytics === 'granted' ? ' checked' : '') + '> 익명 활동·유입 분석</label>' +
      '<label><input type="checkbox" data-consent-ads' + (c.ads === 'granted' ? ' checked' : '') + '> 광고 성과 측정(Google·Naver)</label></details>' +
      '<div><button type="button" data-consent="essential">필수만</button><button type="button" data-consent="save">설정 저장</button><button type="button" class="primary" data-consent="all">모두 허용</button></div></div>';
    document.body.appendChild(el);
    el.addEventListener('click', function (e) {
      var button = e.target.closest('[data-consent]'); if (!button) return;
      if (button.dataset.consent === 'essential') applyConsent({ analytics: 'denied', ads: 'denied' });
      else if (button.dataset.consent === 'all') applyConsent({ analytics: 'granted', ads: 'granted' });
      else applyConsent({
        analytics: el.querySelector('[data-consent-analytics]').checked ? 'granted' : 'denied',
        ads: el.querySelector('[data-consent-ads]').checked ? 'granted' : 'denied'
      });
    });
  }
  function init() {
    if (started || !Core) return; started = true;
    var backendReady = window.NWBackend && window.NWBackend.ready ? window.NWBackend.ready : Promise.resolve();
    backendReady.then(function () {
      if (analyticsGranted() && !internalTraffic()) { page(routeId()); flush(); }
      else if (!analyticsGranted()) showConsent(false);
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
