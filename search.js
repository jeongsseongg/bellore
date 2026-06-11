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
      '<button type="button" class="sp-tab" data-sptab="price">오늘시세</button>' +
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

  /* ---------- 오늘시세 탭 (브랜드별 간단 그래프) ---------- */
  // 브랜드명 기반 시드 → 12개월 시세 추이(참고용 예시 데이터)
  function seedOf(str) { var h = 0; for (var i = 0; i < str.length; i++) { h = (h * 31 + str.charCodeAt(i)) >>> 0; } return h; }
  function trendFor(name) {
    var s = seedOf(name);
    function rnd() { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }
    var base = 800 + Math.floor(rnd() * 9200); // 800만 ~ 1억(만원 단위)
    var pts = [], v = base;
    for (var i = 0; i < 12; i++) { v = Math.max(120, v * (1 + (rnd() - 0.46) * 0.08)); pts.push(Math.round(v)); }
    return pts;
  }
  function won(man) { // 만원 단위 → 보기 좋은 한글 금액
    if (man >= 10000) return (man / 10000).toFixed(man % 10000 === 0 ? 0 : 1) + '억';
    return fmt(man) + '만';
  }
  function sparkline(pts) {
    var W = 300, H = 84, P = 6;
    var min = Math.min.apply(null, pts), max = Math.max.apply(null, pts), rng = (max - min) || 1;
    var step = (W - P * 2) / (pts.length - 1);
    var coords = pts.map(function (v, i) {
      var x = P + i * step, y = P + (H - P * 2) * (1 - (v - min) / rng);
      return [x.toFixed(1), y.toFixed(1)];
    });
    var line = coords.map(function (c) { return c[0] + ',' + c[1]; }).join(' ');
    var area = 'M' + coords[0][0] + ',' + (H - P) + ' L' + line.replace(/ /g, ' L') + ' L' + coords[coords.length - 1][0] + ',' + (H - P) + ' Z';
    var up = pts[pts.length - 1] >= pts[0];
    var col = up ? '#1b8f5a' : '#d23b3b';
    return '<svg class="sp-spark" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none">' +
      '<path d="' + area + '" fill="' + (up ? 'rgba(27,143,90,.10)' : 'rgba(210,59,59,.10)') + '"/>' +
      '<polyline points="' + line + '" fill="none" stroke="' + col + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<circle cx="' + coords[coords.length - 1][0] + '" cy="' + coords[coords.length - 1][1] + '" r="3.5" fill="' + col + '"/></svg>';
  }
  var priceOpen = '';
  function priceGraphHTML(name) {
    var pts = trendFor(name), cur = pts[pts.length - 1], first = pts[0];
    var diff = cur - first, pct = (diff / first * 100);
    var up = diff >= 0;
    // 가격(금액)은 표시하지 않고 추이/등락률만 노출
    return '<div class="sp-price-graph">' +
      '<div class="sp-price-now"><span>최근 12개월 시세 추이</span>' +
        '<em class="' + (up ? 'up' : 'down') + '">' + (up ? '▲ 상승' : '▼ 하락') + ' ' + Math.abs(pct).toFixed(1) + '%</em></div>' +
      sparkline(pts) +
      '<p class="sp-price-foot">※ 추이는 참고용입니다. 정확한 시세는 문의해 주세요.</p>' +
    '</div>';
  }
  function renderPrice() {
    var el = $('.sp-panel[data-sppanel="price"]', page);
    el.innerHTML =
      '<div class="sp-price-head"><h3>오늘의 시세</h3><span class="sp-price-test">참고용 · 데이터 적립중</span></div>' +
      '<p class="sp-price-desc">브랜드를 누르면 최근 12개월 시세 추이를 그래프로 보여드립니다.</p>' +
      '<div class="sp-price-list">' +
        BRANDS.map(function (b) {
          var open = priceOpen === b.name;
          return '<button type="button" class="sp-price-row' + (open ? ' on' : '') + '" data-bi-price="' + esc(b.name) + '">' +
            '<img src="' + window.BELLORE_BRAND_LOGO(b.slug) + '" alt=""><span>' + esc(b.name) + '</span>' +
            '<em class="sp-price-arrow">' + (open ? '−' : '＋') + '</em></button>' +
            (open ? priceGraphHTML(b.name) : '');
        }).join('') +
      '</div>';
  }

  /* ---------- 이벤트 ---------- */
  page.addEventListener('submit', function (e) {
    if (e.target.id === 'spForm') { e.preventDefault(); runQuery(input.value); }
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

    // 카테고리 브랜드 선택
    var bi = e.target.closest('[data-bi]'); if (bi) { catBrandIdx = parseInt(bi.dataset.bi, 10) || 0; renderCat(); return; }

    // 모델 클릭 → 판매시계 이동
    var md = e.target.closest('.sp-model'); if (md) {
      var brand = md.dataset.brand, model = md.dataset.model;
      runQuery(model ? (brand + ' ' + model) : brand);
      return;
    }
    // 오늘시세 행 → 그래프 토글
    var pr = e.target.closest('[data-bi-price]');
    if (pr) { var nm = pr.getAttribute('data-bi-price'); priceOpen = (priceOpen === nm) ? '' : nm; renderPrice(); return; }
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
