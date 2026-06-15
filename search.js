/* ============================================================
   벨로르(BELLORE) · 검색 페이지 (GUGUS 스타일)
   ------------------------------------------------------------
   - 헤더 검색 → 전체화면 검색 페이지로 이동
   - 탭: 검색어 / 카테고리 / 오늘시세
   - 검색어: 최근검색어(계정·게스트별) / 추천검색어(3시간 회전)
            / 인기검색어(검색기록 1000건 미만이면 핫 브랜드) / 최근 확인한 상품(20개)
   - 카테고리: 좌측 브랜드 → 우측 모델 → 클릭 시 판매시계로 이동
   - 오늘시세: 시세 그래프(준비중 · 데이터 적립용 테스트 표시)
   ============================================================ */
(function () {
  'use strict';
  function $(s, c) { return (c || document).querySelector(s); }
  function $$(s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function fmt(n) { return Number(n || 0).toLocaleString('ko-KR'); }
  var BRANDS = window.BELLORE_BRANDS || [];

  /* ---------- 계정 키(최근검색어/최근본상품 분리) ---------- */
  function uid() {
    try { var u = window.NWBackend && NWBackend.currentUser && NWBackend.currentUser(); if (u && u.uid) return u.uid; } catch (e) {}
    return 'guest';
  }
  function lsGet(k) { try { return JSON.parse(localStorage.getItem(k) || '[]'); } catch (e) { return []; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function recentKey() { return 'bellore_recent_kw_' + uid(); }
  var VIEWED_KEY = 'bellore_recent_items';

  function getRecent() { return lsGet(recentKey()); }
  function addRecent(q) {
    q = String(q || '').trim(); if (!q) return;
    var arr = getRecent().filter(function (x) { return x !== q; });
    arr.unshift(q); arr = arr.slice(0, 12);
    lsSet(recentKey(), arr);
  }
  function removeRecent(q) { lsSet(recentKey(), getRecent().filter(function (x) { return x !== q; })); }
  function clearRecent() { lsSet(recentKey(), []); }

  /* ---------- 최근 확인한 상품 ---------- */
  window.BELLORE_recordView = function (it) {
    if (!it || (!it.brand && !it.model)) return;
    var id = String(it.id || (it.brand + '|' + it.model));
    var arr = lsGet(VIEWED_KEY).filter(function (x) { return String(x.id) !== id; });
    arr.unshift({ id: id, brand: it.brand || '', model: it.model || '', price: it.price || 0, sale_price: it.sale_price || 0, img: it.img || it.image || '' });
    lsSet(VIEWED_KEY, arr.slice(0, 20));
  };
  function getViewed() { return lsGet(VIEWED_KEY); }

  /* ---------- 추천 검색어(3시간마다 회전) ---------- */
  var SUGGEST_POOL = [
    '스피드마스터 문워치', '엠워치', '보테가베네타 가방', '로얄오크', '노틸러스', '데이토나',
    '서브마리너', 'GMT마스터', '까르띠에 산토스', '오메가 씨마스터', '리차드밀', '파텍필립 아쿠아넛',
    '예거 르쿨트르 리베르소', '블랙베이', '카레라', '빅뱅', '네비타이머', '루미노르',
    '랑에1', '오버시즈', '벤츄라', 'J12', '캡틴쿡', 'PRX'
  ];
  function suggestNow() {
    // 3시간 단위 시드로 풀에서 6개 회전
    var slot = Math.floor(Date.now() / (3 * 3600 * 1000));
    var out = [], n = SUGGEST_POOL.length, start = slot % n;
    for (var i = 0; i < 6; i++) out.push(SUGGEST_POOL[(start + i) % n]);
    return out;
  }

  /* ---------- 인기 검색어(핫 브랜드 폴백) ---------- */
  var HOT_BRANDS = ['롤렉스', '파텍필립', '오메가', '까르띠에', '오데마피게', '튜더', '위블로', '태그호이어', 'IWC', '브라이틀링'];
  function popularNow(cb) {
    // 검색기록 1000건 이상이면 실제 랭킹, 아니면 핫 브랜드
    if (window.NWBackend && NWBackend.popularSearches) {
      NWBackend.popularSearches(10).then(function (rows) {
        if (rows && rows.total >= 1000 && rows.list && rows.list.length) cb(rows.list.map(function (r) { return r.q; }));
        else cb(HOT_BRANDS);
      }).catch(function () { cb(HOT_BRANDS); });
    } else cb(HOT_BRANDS);
  }

  /* ---------- 검색 실행 ---------- */
  function runQuery(q) {
    q = String(q || '').trim(); if (!q) return;
    addRecent(q);
    if (window.NWBackend && NWBackend.logSearch) { try { NWBackend.logSearch(q); } catch (e) {} }
    closePage();
    if (window.BELLORE_runSearch) window.BELLORE_runSearch(q);
  }

  /* ---------- 페이지 셸 ---------- */
  var page = document.createElement('div');
  page.className = 'search-page'; page.id = 'searchPage'; page.hidden = true;
  page.innerHTML =
    '<header class="sp-top">' +
      '<form class="sp-bar" id="spForm">' +
        '<svg class="sp-bar-ic" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>' +
        '<input type="search" id="spInput" placeholder="검색어를 입력해 주세요." autocomplete="off" enterkeyhint="search">' +
      '</form>' +
      '<button type="button" class="sp-close" data-spclose aria-label="닫기">' +
        '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>' +
      '</button>' +
    '</header>' +
    '<nav class="sp-tabs">' +
      '<button type="button" class="sp-tab active" data-sptab="word">검색어</button>' +
      '<button type="button" class="sp-tab" data-sptab="cat">카테고리</button>' +
      '<button type="button" class="sp-tab" data-sptab="price">내 시세</button>' +
    '</nav>' +
    '<div class="sp-scroll">' +
      '<section class="sp-panel" data-sppanel="word"></section>' +
      '<section class="sp-panel" data-sppanel="cat" hidden></section>' +
      '<section class="sp-panel" data-sppanel="price" hidden></section>' +
    '</div>';
  document.body.appendChild(page);

  var input = $('#spInput', page);

  /* ---------- 자동완성(연관 검색어) ---------- */
  // 후보: 브랜드명 + "브랜드 모델" 조합 + 모델 단독
  var AUTO = (function () {
    var arr = [];
    BRANDS.forEach(function (b) {
      arr.push({ label: b.name, q: b.name, sub: '브랜드' });
      (b.models || []).forEach(function (m) {
        arr.push({ label: b.name + ' ' + m, q: b.name + ' ' + m, sub: m });
      });
    });
    return arr;
  })();
  var autoBox = document.createElement('div');
  autoBox.className = 'sp-auto'; autoBox.hidden = true;
  $('.sp-top', page).appendChild(autoBox);

  function matchAuto(qRaw) {
    var q = String(qRaw || '').trim().toLowerCase();
    if (!q) return [];
    var out = [];
    for (var i = 0; i < AUTO.length && out.length < 10; i++) {
      var it = AUTO[i];
      if (it.label.toLowerCase().indexOf(q) > -1 || it.sub.toLowerCase().indexOf(q) > -1) out.push(it);
    }
    return out;
  }
  function hl(label, q) {
    var i = label.toLowerCase().indexOf(q.toLowerCase());
    if (i < 0) return esc(label);
    return esc(label.slice(0, i)) + '<b>' + esc(label.slice(i, i + q.length)) + '</b>' + esc(label.slice(i + q.length));
  }
  function renderAuto(q) {
    var list = matchAuto(q);
    if (!list.length) { hideAuto(); return; }
    autoBox.innerHTML = list.map(function (it) {
      return '<button type="button" class="sp-auto-item" data-q="' + esc(it.q) + '">' +
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#aaa" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4-4"/></svg>' +
        '<span>' + hl(it.label, q) + '</span></button>';
    }).join('');
    autoBox.hidden = false;
  }
  function hideAuto() { autoBox.hidden = true; autoBox.innerHTML = ''; }

  function openPage(tab) {
    page.hidden = false;
    document.body.style.overflow = 'hidden';
    document.body.classList.add('is-searching');
    switchTab(tab || 'word');
    setTimeout(function () { if ((tab || 'word') === 'word') input.focus(); }, 50);
  }
  function closePage() {
    page.hidden = true; document.body.style.overflow = '';
    document.body.classList.remove('is-searching');
    if (input) input.value = '';
    hideAuto();
  }
  window.BELLORE_openSearch = openPage;

  function switchTab(t) {
    $$('.sp-tab', page).forEach(function (x) { x.classList.toggle('active', x.dataset.sptab === t); });
    $$('.sp-panel', page).forEach(function (p) { p.hidden = p.dataset.sppanel !== t; });
    $('.sp-scroll', page).scrollTop = 0;
    if (t === 'word') renderWord();
    else if (t === 'cat') renderCat();
    else renderPrice();
  }

  /* ---------- 검색어 탭 ---------- */
  function renderWord() {
    var el = $('.sp-panel[data-sppanel="word"]', page);
    var recent = getRecent();
    var recentHTML = recent.length
      ? recent.map(function (q) {
          return '<button type="button" class="sp-chip" data-q="' + esc(q) + '">' + esc(q) +
            '<span class="sp-chip-x" data-rmq="' + esc(q) + '">×</span></button>';
        }).join('')
      : '<p class="sp-empty">최근 검색어가 없습니다.</p>';

    var suggest = suggestNow().map(function (q) {
      return '<button type="button" class="sp-sug" data-q="' + esc(q) + '">' + esc(q) + '</button>';
    }).join('');

    var viewed = getViewed();
    var viewedHTML = viewed.length
      ? '<div class="sp-viewed-row">' + viewed.map(function (it) {
          var price = it.sale_price && it.sale_price < it.price ? it.sale_price : it.price;
          return '<button type="button" class="sp-viewed" data-pid="' + esc(it.id) + '" data-brand="' + esc(it.brand) + '" data-model="' + esc(it.model) + '" data-price="' + (it.price || 0) + '" data-sprice="' + (it.sale_price || '') + '">' +
            '<span class="sp-viewed-img"><img src="' + esc(it.img || 'assets/images.jpg') + '" alt="" loading="lazy"></span>' +
            '<span class="sp-viewed-brand">' + esc(it.brand) + '</span>' +
            '<span class="sp-viewed-price">' + (price ? fmt(price) + '원' : '문의') + '</span>' +
          '</button>';
        }).join('') + '</div>'
      : '<p class="sp-empty">최근 확인한 상품이 없습니다.</p>';

    el.innerHTML =
      '<div class="sp-sec">' +
        '<div class="sp-sec-head"><h3>최근 검색어</h3>' + (recent.length ? '<button type="button" class="sp-clear" data-clearrecent>전체삭제</button>' : '') + '</div>' +
        '<div class="sp-chips">' + recentHTML + '</div>' +
      '</div>' +
      '<div class="sp-sec">' +
        '<div class="sp-sec-head"><h3>추천 검색어</h3></div>' +
        '<div class="sp-sugs">' + suggest + '</div>' +
      '</div>' +
      '<div class="sp-sec">' +
        '<div class="sp-sec-head"><h3>인기 검색어</h3><span class="sp-pop-note" id="spPopNote"></span></div>' +
        '<ol class="sp-pop" id="spPop"></ol>' +
      '</div>' +
      '<div class="sp-sec">' +
        '<div class="sp-sec-head"><h3>최근 확인한 상품</h3></div>' +
        viewedHTML +
      '</div>';

    popularNow(function (list) {
      var ol = $('#spPop', page); if (!ol) return;
      ol.innerHTML = list.slice(0, 10).map(function (q, i) {
        return '<li><button type="button" class="sp-pop-item" data-q="' + esc(q) + '"><b>' + (i + 1) + '</b><span>' + esc(q) + '</span></button></li>';
      }).join('');
    });
  }

  /* ---------- 카테고리 탭 (브랜드 → 모델) ---------- */
  var catBrandIdx = 0;
  function renderCat() {
    var el = $('.sp-panel[data-sppanel="cat"]', page);
    var left = BRANDS.map(function (b, i) {
      return '<button type="button" class="sp-brand' + (i === catBrandIdx ? ' on' : '') + '" data-bi="' + i + '">' + esc(b.name) + '</button>';
    }).join('');
    el.innerHTML =
      '<div class="sp-cat">' +
        '<div class="sp-cat-left">' + left + '</div>' +
        '<div class="sp-cat-right" id="spModels"></div>' +
      '</div>';
    renderModels();
  }
  function renderModels() {
    var box = $('#spModels', page); if (!box) return;
    var b = BRANDS[catBrandIdx]; if (!b) return;
    box.innerHTML =
      '<button type="button" class="sp-model sp-model-all" data-brand="' + esc(b.name) + '" data-model="">' +
        '<img class="sp-model-logo" src="' + window.BELLORE_BRAND_LOGO(b.slug) + '" alt=""><b>' + esc(b.name) + ' 전체</b></button>' +
      b.models.map(function (m) {
        return '<button type="button" class="sp-model" data-brand="' + esc(b.name) + '" data-model="' + esc(m) + '">' + esc(m) + '</button>';
      }).join('');
  }

  /* ---------- '내 시계 지금 얼마일까?' 시세 조회 (가격 데이터 준비중 · 입력값 적립) ---------- */
  var priceBrandIdx = -1;
  function priceModelOptions() {
    if (priceBrandIdx < 0 || !BRANDS[priceBrandIdx]) return '<option value="">브랜드를 먼저 선택</option>';
    return '<option value="">모델 선택</option>' +
      BRANDS[priceBrandIdx].models.map(function (m) { return '<option value="' + esc(m) + '">' + esc(m) + '</option>'; }).join('') +
      '<option value="__etc">기타 / 직접 입력</option>';
  }
  function renderPrice() {
    var el = $('.sp-panel[data-sppanel="price"]', page);
    el.innerHTML =
      '<div class="sp-price-head"><h3>내 시계 지금 얼마일까?</h3><span class="sp-price-test">시세 데이터 준비중</span></div>' +
      '<p class="sp-price-desc">브랜드 · 모델 · 스탬핑 날짜 · 구성품을 입력하면 예상 시세를 확인할 수 있어요. (가격 데이터는 준비 중입니다)</p>' +
      '<form id="spPriceForm" class="sp-price-form">' +
        '<label class="sp-price-field"><span>브랜드</span>' +
          '<select id="spPriceBrand" required><option value="">브랜드 선택</option>' +
            BRANDS.map(function (b, i) { return '<option value="' + i + '">' + esc(b.name) + '</option>'; }).join('') +
          '</select></label>' +
        '<label class="sp-price-field"><span>모델</span>' +
          '<select id="spPriceModel" required>' + priceModelOptions() + '</select></label>' +
        '<input type="text" id="spPriceModelEtc" class="sp-price-input" placeholder="모델명 직접 입력" hidden>' +
        '<label class="sp-price-field"><span>스탬핑(개런티) 날짜</span>' +
          '<input type="text" id="spPriceStamp" class="sp-price-input" placeholder="예: 2023-05 또는 2023년 5월"></label>' +
        '<div class="sp-price-field"><span>구성품</span>' +
          '<div class="sp-price-comps">' +
            ['박스', '케이스', '개런티카드', '보증서', '풀세트'].map(function (c) {
              return '<label class="sp-price-chk"><input type="checkbox" name="spcomp" value="' + esc(c) + '"><span>' + esc(c) + '</span></label>';
            }).join('') +
          '</div></div>' +
        '<button type="submit" class="sp-price-submit">시세 조회</button>' +
      '</form>' +
      '<div id="spPriceResult" class="sp-price-result"></div>';
  }
  function logPriceQuery(q) {
    try {
      var key = 'bellore_price_queries';
      var arr = JSON.parse(localStorage.getItem(key) || '[]');
      arr.unshift(q); if (arr.length > 200) arr.length = 200;
      localStorage.setItem(key, JSON.stringify(arr));
    } catch (e) {}
    try { if (window.NWBackend && NWBackend.logSearch) NWBackend.logSearch('[시세조회] ' + q.brand + ' ' + q.model); } catch (e) {}
  }
  function submitPriceQuery() {
    var bsel = $('#spPriceBrand', page), msel = $('#spPriceModel', page);
    var etc = $('#spPriceModelEtc', page), stamp = $('#spPriceStamp', page);
    var brand = (bsel && bsel.value !== '') ? BRANDS[parseInt(bsel.value, 10)].name : '';
    var model = msel ? msel.value : '';
    if (model === '__etc') model = etc ? etc.value.trim() : '';
    if (!brand) { alert('브랜드를 선택해 주세요.'); return; }
    if (!model) { alert('모델을 선택하거나 직접 입력해 주세요.'); return; }
    var comps = [];
    $$('input[name="spcomp"]', page).forEach(function (c) { if (c.checked) comps.push(c.value); });
    var q = { brand: brand, model: model, stamping: stamp ? stamp.value.trim() : '', components: comps, at: new Date().toISOString() };
    logPriceQuery(q);
    var rEl = $('#spPriceResult', page);
    if (rEl) {
      rEl.innerHTML =
        '<div class="sp-price-card">' +
          '<div class="sp-price-card-top"><span class="sp-price-badge">시세 데이터 준비중</span></div>' +
          '<p class="sp-price-card-brand">' + esc(brand) + '</p>' +
          '<p class="sp-price-card-model">' + esc(model) + '</p>' +
          '<ul class="sp-price-card-spec">' +
            (q.stamping ? '<li><span>스탬핑</span><strong>' + esc(q.stamping) + '</strong></li>' : '') +
            '<li><span>구성품</span><strong>' + (comps.length ? esc(comps.join(' · ')) : '미선택') + '</strong></li>' +
          '</ul>' +
          '<p class="sp-price-card-note">아직 시세 데이터가 준비 중입니다. 입력하신 정보는 저장되었으며, 데이터가 모이면 예상 시세를 제공해 드립니다.</p>' +
          '<button type="button" class="sp-price-cta">지금 비교견적으로 정확한 가격 받기</button>' +
        '</div>';
      rEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  /* ---------- 이벤트 ---------- */
  page.addEventListener('submit', function (e) {
    if (e.target.id === 'spForm') { e.preventDefault(); runQuery(input.value); return; }
    if (e.target.id === 'spPriceForm') { e.preventDefault(); submitPriceQuery(); return; }
  });
  page.addEventListener('change', function (e) {
    if (e.target.id === 'spPriceBrand') {
      priceBrandIdx = (e.target.value === '') ? -1 : parseInt(e.target.value, 10);
      var ms = $('#spPriceModel', page); if (ms) ms.innerHTML = priceModelOptions();
      var etc = $('#spPriceModelEtc', page); if (etc) etc.hidden = true;
    } else if (e.target.id === 'spPriceModel') {
      var etc2 = $('#spPriceModelEtc', page); if (etc2) etc2.hidden = (e.target.value !== '__etc');
    }
  });
  input.addEventListener('search', function () { runQuery(input.value); });
  input.addEventListener('input', function () { renderAuto(input.value); });
  page.addEventListener('click', function (e) {
    var ai = e.target.closest('.sp-auto-item'); if (ai) { runQuery(ai.dataset.q); return; }
    if (e.target.closest('[data-spclose]')) { closePage(); return; }
    var tab = e.target.closest('[data-sptab]'); if (tab) { switchTab(tab.dataset.sptab); return; }

    // 최근검색어 삭제
    var rm = e.target.closest('[data-rmq]'); if (rm) { e.stopPropagation(); removeRecent(rm.dataset.rmq); renderWord(); return; }
    if (e.target.closest('[data-clearrecent]')) { clearRecent(); renderWord(); return; }

    // 검색어/추천/인기 클릭 → 검색 실행
    var q = e.target.closest('[data-q]'); if (q) { runQuery(q.dataset.q); return; }

    // 최근 확인한 상품 → 상세
    var v = e.target.closest('.sp-viewed'); if (v) { openViewed(v); return; }

    // 카테고리 브랜드 선택 — 왼쪽 목록을 다시 그리지 않고(스크롤 위치 유지) 활성표시 + 모델만 갱신
    var bi = e.target.closest('[data-bi]'); if (bi) {
      catBrandIdx = parseInt(bi.dataset.bi, 10) || 0;
      var brs = page.querySelectorAll('.sp-brand');
      for (var k = 0; k < brs.length; k++) brs[k].classList.toggle('on', k === catBrandIdx);
      renderModels();
      var mr = page.querySelector('#spModels'); if (mr) mr.scrollTop = 0;
      return;
    }

    // 모델 클릭 → 판매시계 이동
    var md = e.target.closest('.sp-model'); if (md) {
      var brand = md.dataset.brand, model = md.dataset.model;
      runQuery(model ? (brand + ' ' + model) : brand);
      return;
    }
    // 시세 조회 결과 → 비교견적으로 이동
    if (e.target.closest('.sp-price-cta')) {
      closePage();
      var ct = document.querySelector('.tab-item[data-nav="compare"]');
      if (ct) ct.click(); else location.hash = '#compare';
      return;
    }
  });

  function openViewed(v) {
    closePage();
    // 가상 카드를 만들어 기존 상세 로직 재사용
    var card = document.createElement('article');
    card.className = 'hcard'; card.dataset.pid = v.dataset.pid;
    card.dataset.brand = v.dataset.brand; card.dataset.model = v.dataset.model;
    card.dataset.price = v.dataset.price; card.dataset.sprice = v.dataset.sprice || '';
    card.innerHTML = '<div class="hcard-img"><img src="' + (v.querySelector('img') ? v.querySelector('img').src : '') + '"></div>' +
      '<p class="hcard-brand">' + esc(v.dataset.brand) + '</p><p class="hcard-model">' + esc(v.dataset.model) + '</p>';
    if (window.BELLORE_openProductCard) window.BELLORE_openProductCard(card);
  }

  /* ---------- 헤더 검색 → 페이지 오픈 ---------- */
  function wireHeader() {
    var hs = $('#headerSearch'), si = $('#searchInput');
    if (si) { si.setAttribute('readonly', 'readonly'); si.removeAttribute('enterkeyhint'); }
    function open(e) { if (e) { e.preventDefault(); } openPage('word'); }
    if (hs) hs.addEventListener('submit', open);
    if (si) { si.addEventListener('focus', open); si.addEventListener('click', open); }
    if (hs) { var ic = hs.querySelector('.header-search-ic'); if (ic) ic.addEventListener('click', open); }
    var ts = $('#tabSearch');
    if (ts) ts.addEventListener('click', function (e) { e.preventDefault(); openPage('word'); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wireHeader);
  else wireHeader();

  /* ---------- 홈 원형 브랜드 → 판매시계 필터 연동 ---------- */
  document.addEventListener('click', function (e) {
    var c = e.target.closest('#brandCircleRow .brand-circle[data-brandfilter]');
    if (!c) return;
    var bf = c.dataset.brandfilter;
    setTimeout(function () {
      var sel = '#collection .cat-brand';
      var btns = $$(sel), hit = null;
      btns.forEach(function (b) { if ((b.dataset.brand || '') === bf) hit = b; });
      if (!hit && bf === 'all') hit = $('#collection .cat-brand[data-brand="all"]');
      if (hit) hit.click();
    }, 80);
  });
})();
