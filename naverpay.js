/* ============================================================
   벨로르 · 네이버페이 주문형 V2.1
   - 가입 최종 승인 전에는 ?naverPayTest=1 주소에서만 샌드박스 SDK를 사용합니다.
   - 주문정보는 브라우저가 아닌 Edge Function이 DB 상품가로 생성합니다.
   ============================================================ */
(function () {
  'use strict';

  var CFG = window.BELLORE_NAVERPAY || {};
  var containerId = 'npay-button-container';
  var sdkPromise = null;
  var publicConfig = null;
  var renderSeq = 0;

  function testEnabled() {
    var host = (location.hostname || '').toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1' || host === '[::1]') return true;
    try {
      return new URLSearchParams(location.search).get('naverPayTest') === '1';
    } catch (_e) {
      return false;
    }
  }

  function available() {
    return !!(CFG.enabled && CFG.endpoint && (!CFG.testOnly || testEnabled()));
  }

  function loadScript(src, marker) {
    var found = document.querySelector('script[data-' + marker + '="1"]');
    if (found) return Promise.resolve();
    return new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.setAttribute('data-' + marker, '1');
      script.onload = resolve;
      script.onerror = function () { reject(new Error(marker + '_load_failed')); };
      document.head.appendChild(script);
    });
  }

  function getPublicConfig() {
    if (publicConfig) return Promise.resolve(publicConfig);
    return fetch(CFG.endpoint + '?action=config', {
      headers: { 'Accept': 'application/json' }
    }).then(function (r) {
      if (!r.ok) throw new Error('naverpay_config_failed');
      return r.json();
    }).then(function (data) {
      if (!data.buttonKey || !data.accountId) throw new Error('naverpay_not_configured');
      publicConfig = data;
      return data;
    });
  }

  function initTracking(config) {
    return loadScript('https://wcs.naver.net/wcslog.js', 'npay-wcs').then(function () {
      window.wcs_add = window.wcs_add || {};
      window.wcs_add.wa = config.accountId;
      if (window.wcs) {
        window.wcs.checkoutWhitelist = ['bellore.co.kr'];
        if (window.wcs.inflow) window.wcs.inflow('bellore.co.kr');
        if (window.wcs_do) window.wcs_do();
      }
    });
  }

  function initSdk() {
    if (sdkPromise) return sdkPromise;
    sdkPromise = getPublicConfig().then(function (config) {
      return initTracking(config).then(function () {
        var sdk = CFG.testOnly
          ? 'https://test-pay.naver.com/assets/button/latest/npay.button.js'
          : 'https://npay-order.pstatic.net/assets/button/latest/npay.button.js';
        return loadScript(sdk, 'npay-sdk').then(function () { return config; });
      });
    });
    return sdkPromise;
  }

  function registerOrder(listingId) {
    var cookies = {};
    document.cookie.split(';').forEach(function (pair) {
      var bits = pair.trim().split('=');
      if (bits[0]) cookies[bits[0]] = decodeURIComponent(bits.slice(1).join('=') || '');
    });
    return fetch(CFG.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        listingId: listingId,
        cpaInflowCode: cookies.CPAValidator || '',
        naverInflowCode: cookies.NA_CO || '',
        saClickId: cookies.NVADID || ''
      })
    }).then(function (r) {
      return r.json().then(function (data) {
        if (!r.ok || !data.key || !data.merchantNo) {
          throw new Error(data.error || 'naverpay_order_register_failed');
        }
        return { key: data.key, merchantNo: data.merchantNo };
      });
    });
  }

  function render(product) {
    var box = document.getElementById(containerId);
    if (!box) return;
    var seq = ++renderSeq;
    box.hidden = true;
    box.innerHTML = '';
    if (!available() || !product || !product.listingId || !product.price) return;

    initSdk().then(function (config) {
      if (seq !== renderSeq || !window.Npay || !window.Npay.order) return;
      box.hidden = false;
      window.Npay.order.create({
        buttonKey: config.buttonKey,
        containerId: containerId,
        orderRegistrationVersion: '2.1',
        type: 'template',
        colorTheme: 'green',
        enable: true,
        components: {
          talkTalk: false,
          wishlist: false,
          benefitMessage: true,
          benefitCoachMark: true
        },
        onBuyClick: function () {
          return registerOrder(product.listingId).catch(function (error) {
            alert('네이버페이 주문서를 열지 못했습니다. 잠시 후 다시 시도해 주세요.');
            throw error;
          });
        }
      });
    }).catch(function (error) {
      console.warn('[BELLORE] 네이버페이 준비 실패:', error && error.message);
      box.hidden = true;
    });
  }

  window.BELLORE_NPAY_RENDER = render;
})();
