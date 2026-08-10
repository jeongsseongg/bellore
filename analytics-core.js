(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.BelloreAnalyticsCore = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var CAMPAIGN_KEYS = [
    'utm_id', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_source_platform',
    'utm_term', 'utm_content', 'utm_creative_format', 'utm_marketing_tactic'
  ];
  var CLICK_KEYS = ['gclid', 'dclid', 'wbraid', 'gbraid', 'msclkid', 'fbclid', 'ttclid'];
  var NAVER_KEYS = [
    'n_media', 'n_query', 'n_keyword', 'n_campaign', 'n_campaign_type',
    'n_ad_group', 'n_ad', 'n_rank', 'n_click_id'
  ];
  var EVENT_PROPERTIES = {
    session_start: ['device_class'],
    view_open: ['route', 'navigation_id'],
    view_dwell: ['engaged_ms', 'segment_id'],
    page_exit: ['navigation_id'],
    page_return: ['navigation_id'],
    element_click: [],
    purchase_click: [],
    quote_requested: ['quote_id'],
    phone_call: ['measurement', 'location_id'],
    product_view: ['listing_id', 'brand', 'model'],
    purchase_complete: ['conversion_id', 'listing_id', 'value', 'currency'],
    purchase_failed: ['reason_code'],
    consent_updated: ['analytics', 'ads']
  };

  function clean(value, max) {
    if (value == null) return null;
    value = String(value).trim();
    return value ? value.slice(0, max || 160) : null;
  }

  function hostname(value) {
    try { return new URL(value).hostname.toLowerCase(); } catch (_e) { return ''; }
  }

  function classify(acq) {
    acq = acq || {};
    var source = String(acq.utm_source || '').toLowerCase();
    var medium = String(acq.utm_medium || '').toLowerCase();
    var ref = String(acq.referrer_host || '').toLowerCase();
    var hasClick = CLICK_KEYS.some(function (key) { return !!acq[key]; }) || !!acq.n_click_id;
    var paid = hasClick || /^(cpc|ppc|paid|paid_search|paid_social|display|affiliate)$/.test(medium);

    if (paid) {
      if (/naver/.test(source) || acq.n_media || acq.n_click_id) return 'naver_paid_search';
      if (/google/.test(source) || acq.gclid || acq.dclid || acq.wbraid || acq.gbraid) return 'google_paid_search';
      if (/instagram|facebook|meta/.test(source) || acq.fbclid || medium === 'paid_social') return 'paid_social';
      return 'paid_unknown';
    }
    if (/map\.naver|m\.place\.naver/.test(ref)) return 'naver_place';
    if (/blog\.naver\.com/.test(ref)) return 'naver_blog';
    if (/search\.naver|naver\.com/.test(ref)) return 'naver_organic';
    if (/google\./.test(ref)) return 'google_organic';
    if (/instagram|facebook/.test(ref)) return 'organic_social';
    if (ref) return 'referral';
    if (source || medium) return 'unclassified';
    return 'direct';
  }

  function parseAcquisition(href, referrer, internalHosts) {
    var url;
    try { url = new URL(href); } catch (_e) { url = new URL('https://invalid.local/'); }
    var out = {};
    CAMPAIGN_KEYS.concat(CLICK_KEYS, NAVER_KEYS).forEach(function (key) {
      var value = clean(url.searchParams.get(key), 200);
      if (value) out[key] = value;
    });
    var refHost = hostname(referrer);
    var internal = (internalHosts || []).map(function (h) { return String(h).toLowerCase(); });
    if (refHost && internal.indexOf(refHost) === -1) out.referrer_host = refHost;
    out.channel = classify(out);
    return out;
  }

  function allowedEvent(name) {
    return Object.prototype.hasOwnProperty.call(EVENT_PROPERTIES, name);
  }

  function sanitizeProperties(name, properties) {
    if (!allowedEvent(name)) return null;
    properties = properties || {};
    var out = {};
    EVENT_PROPERTIES[name].forEach(function (key) {
      var value = properties[key];
      if (value == null) return;
      if (typeof value === 'number') out[key] = Number.isFinite(value) ? value : 0;
      else if (typeof value === 'boolean') out[key] = value;
      else out[key] = clean(value, 160);
    });
    return out;
  }

  function sessionExpired(lastActivity, now, timeoutMs) {
    return !lastActivity || now - Number(lastActivity) > timeoutMs;
  }

  return {
    CAMPAIGN_KEYS: CAMPAIGN_KEYS,
    CLICK_KEYS: CLICK_KEYS,
    NAVER_KEYS: NAVER_KEYS,
    EVENT_PROPERTIES: EVENT_PROPERTIES,
    classify: classify,
    parseAcquisition: parseAcquisition,
    allowedEvent: allowedEvent,
    sanitizeProperties: sanitizeProperties,
    sessionExpired: sessionExpired
  };
}));
