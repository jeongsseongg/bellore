/* 벨로르 내시계팔기(비교견적) — 실제 백엔드 연동 모듈
   고객 / 업체 / 관리자 3개 시점. 로그인 역할에 따라 접근이 제한된다.
   - 고객: 고객 화면만 / 업체: 업체 화면만 / 관리자: 3개 전부(상단 탭으로 전환)
   데이터는 window.NWBackend(Supabase: quote_requests·bids·profiles·reviews)에서 실시간으로 받는다. */
(function () {
  'use strict';

  var ADMIN_EMAIL = 'bellorekr@gmail.com';
  var B = window.NWBackend || null;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function won(n) { return Number(n || 0).toLocaleString('ko-KR') + '원'; }
  function man(n) { return Math.round(Number(n || 0) / 10000).toLocaleString('ko-KR') + '만'; }
  function num(n) { return Number(n || 0).toLocaleString('ko-KR'); }
  function stars(r) {
    var full = Math.round(Number(r) || 0), s = '';
    for (var i = 1; i <= 5; i++) s += '<span class="cqd-star' + (i <= full ? ' on' : '') + '">★</span>';
    return '<span class="cqd-stars">' + s + '</span>';
  }

  /* ===== 로그인 상태 추적 ===== */
  var AUTH = { user: null, info: {} };
  if (B && B.onAuthChange) {
    B.onAuthChange(function (user, info) { AUTH.user = user; AUTH.info = info || {}; renderIfOpen(); });
  }
  function myUid() { return AUTH.user ? AUTH.user.uid : null; }
  function detectRole() {
    if (AUTH.info && AUTH.info.isAdmin) return 'admin';
    if (AUTH.info && AUTH.info.role === 'vendor') return 'vendor';
    return 'customer';
  }

  /* 신규 등록 폼에서 선택한 사진(File) 임시 보관 */
  var newPhotos = [];
  var BRAND_OPTS = ['ROLEX (롤렉스)', 'PATEK PHILIPPE (파텍필립)', 'AUDEMARS PIGUET (오데마피게)',
    'VACHERON CONSTANTIN (바쉐론 콘스탄틴)', 'RICHARD MILLE (리차드 밀)', 'FRANCK MULLER (프랭크뮬러)',
    'CARTIER (까르띠에)', '기타'];
  var PART_OPTS = ['보증서', '박스', '설명서', '추가 링크', '택', '구매 영수증'];

  /* ===== 데이터 캐시 (구독으로 채움) ===== */
  var cust = { watches: [], loaded: false };
  var vend = { quotes: [], loaded: false };
  var adm = { pending: [], open: [], vendors: [], accounts: [], loaded: false };
  var reviews = [];
  var awardedVendorCache = {}; // quoteId → {company_name,...}
  var subs = [];

  function clearSubs() { subs.slice().forEach(function (u) { try { u(); } catch (e) {} }); subs = []; }

  function setupSubs(role) {
    clearSubs();
    if (!B) return;
    if (B.subscribeReviews) subs.push(B.subscribeReviews(function (r) { reviews = r || []; renderIfOpen(); }));
    if (role === 'customer' || role === 'admin') {
      if (B.subscribeMyListings) subs.push(B.subscribeMyListings(function (r) { cust.watches = r || []; cust.loaded = true; renderIfOpen(); }));
    }
    if (role === 'vendor' || role === 'admin') {
      if (B.subscribeOpenQuotes) subs.push(B.subscribeOpenQuotes(function (r) { vend.quotes = r || []; vend.loaded = true; renderIfOpen(); }));
    }
    if (role === 'admin') {
      if (B.subscribePending) subs.push(B.subscribePending(function (r) { adm.pending = r || []; adm.loaded = true; renderIfOpen(); }));
      if (B.subscribeOpenQuotes) subs.push(B.subscribeOpenQuotes(function (r) { adm.open = r || []; renderIfOpen(); }));
      if (B.subscribeVendors) subs.push(B.subscribeVendors(function (r) { adm.vendors = r || []; renderIfOpen(); }));
      if (B.subscribeAccounts) subs.push(B.subscribeAccounts(function (r) { adm.accounts = r || []; renderIfOpen(); }));
    }
  }

  /* ===== 헬퍼 ===== */
  function vendorName(p) { return (p && (p.company_name || p.display_name)) || '(이름 없음)'; }
  function vendorLetter(p) { return vendorName(p).charAt(0).toUpperCase(); }
  function vendorAvatar(p) {
    var lo = p && p.logo_url;
    var inner = lo ? '<img src="' + esc(lo) + '" alt="" onerror="this.remove()">' : esc(vendorLetter(p));
    return '<span class="cqd-avatar">' + inner + '</span>';
  }
  function myBidOf(q) {
    var uid = myUid(); if (!uid) return null;
    for (var i = 0; i < (q.bids || []).length; i++) if (q.bids[i].vendor_id === uid) return q.bids[i];
    return null;
  }
  function statusBadge(q) {
    var s = q.status, n = (q.bids || []).length;
    if (s === 'pending') return '<span class="cqd-badge wait">승인중</span>';
    if (s === 'open') return n ? '<span class="cqd-badge live">입찰 ' + n + '건</span>' : '<span class="cqd-badge wait">대기중</span>';
    if (s === 'awarded') return '<span class="cqd-badge done">판매확정</span>';
    if (s === 'suspended') return '<span class="cqd-badge stop">정지됨</span>';
    if (s === 'closed') return '<span class="cqd-badge stop">종료</span>';
    return '';
  }
  function reviewList() {
    var revs = reviews.slice(0, 6).map(function (r) {
      return '<li class="cqd-rev"><div class="cqd-rev-top"><b>' + esc(r.author_name || '익명') + '</b>' + stars(r.rating || 5) + '</div><p>' + esc(r.title || '') + (r.body ? ' · ' + esc(r.body) : '') + '</p></li>';
    }).join('');
    return revs || '<li class="cqd-empty2">등록된 후기가 없습니다.</li>';
  }

  /* ===== 상태/오버레이 ===== */
  var accountRole = 'customer';
  var viewRole = 'customer';
  var stack = [];
  var overlay, bodyEl, titleEl, backBtn, rolesEl, addBtn;

  function build() {
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.className = 'cqd-overlay'; overlay.id = 'cqdOverlay'; overlay.hidden = true;
    overlay.innerHTML =
      '<div class="cqd-frame">' +
        '<header class="cqd-bar">' +
          '<button type="button" class="cqd-back" aria-label="뒤로" hidden>‹</button>' +
          '<span class="cqd-title">내시계팔기</span>' +
          '<button type="button" class="cqd-add" aria-label="시계 등록 추가" hidden>+</button>' +
          '<button type="button" class="cqd-close" aria-label="닫기">×</button>' +
        '</header>' +
        '<div class="cqd-roles" id="cqdRoles" hidden>' +
          '<button type="button" data-role="customer">고객 화면</button>' +
          '<button type="button" data-role="vendor">업체 화면</button>' +
          '<button type="button" data-role="admin">관리자 화면</button>' +
        '</div>' +
        '<div class="cqd-body" id="cqdBody"></div>' +
      '</div>';
    document.body.appendChild(overlay);
    bodyEl = overlay.querySelector('#cqdBody');
    titleEl = overlay.querySelector('.cqd-title');
    backBtn = overlay.querySelector('.cqd-back');
    addBtn = overlay.querySelector('.cqd-add');
    rolesEl = overlay.querySelector('#cqdRoles');

    overlay.addEventListener('click', onClick);
    overlay.addEventListener('change', onChange);
    var roleBtns = rolesEl.querySelectorAll('button');
    for (var i = 0; i < roleBtns.length; i++) {
      roleBtns[i].addEventListener('click', function () {
        viewRole = this.getAttribute('data-role');
        markRoleTabs();
        go(homeScreen(), null, true);
      });
    }
  }

  function markRoleTabs() {
    if (!rolesEl) return;
    var bs = rolesEl.querySelectorAll('button');
    for (var j = 0; j < bs.length; j++) bs[j].classList.toggle('is-on', bs[j].getAttribute('data-role') === viewRole);
  }
  function homeScreen() {
    return viewRole === 'customer' ? 'c-watches' : viewRole === 'vendor' ? 'v-watches' : 'a-dash';
  }
  function go(screen, param, replace) {
    if (replace) stack = [];
    stack.push({ screen: screen, param: param });
    render();
  }
  function back() { if (stack.length > 1) { stack.pop(); render(); } }
  function renderIfOpen() { if (overlay && !overlay.hidden) render(); }

  function render() {
    if (!overlay) return;
    var cur = stack[stack.length - 1]; if (!cur) return;
    backBtn.hidden = stack.length <= 1;
    if (addBtn) addBtn.hidden = !(cur.screen === 'c-watches');
    bodyEl.scrollTop = 0;
    bodyEl.innerHTML = SCREENS[cur.screen] ? SCREENS[cur.screen](cur.param) : '<p class="cqd-note">준비중</p>';
  }

  function loadingBlock() { return '<div class="cqd-screen"><p class="cqd-note">불러오는 중…</p></div>'; }

  /* ===== 시세 추이 그래프 (디자인 — 데이터 준비중) ===== */
  function trendSvg() {
    var pts = '8,30 52,40 96,34 140,56 184,48 228,70 272,62 312,82';
    var arr = pts.split(' ');
    var dots = '';
    for (var i = 0; i < arr.length; i++) {
      var xy = arr[i].split(',');
      dots += '<circle cx="' + xy[0] + '" cy="' + xy[1] + '" r="3"></circle>';
    }
    return '<svg class="cqd-chart" viewBox="0 0 320 110" preserveAspectRatio="xMidYMid meet" aria-hidden="true">' +
      '<polyline class="cqd-chart-line" points="' + pts + '"></polyline>' +
      '<g class="cqd-chart-dots">' + dots + '</g>' +
      '<text class="cqd-chart-wm" x="160" y="62" text-anchor="middle">데이터 준비중</text>' +
    '</svg>';
  }
  function priceTrendCard() {
    return '<div class="cqd-watchcard slim cqd-trend">' +
      '<div class="cqd-trend-head"><b>최근 시세 추이</b><span class="cqd-badge wait">데이터 준비중</span></div>' +
      trendSvg() +
      '<p class="cqd-chart-label">시세 데이터가 쌓이면 실제 그래프로 표시됩니다.</p>' +
    '</div>';
  }

  /* ===== 이메일(관리자 통지) ===== */
  function emailAdmin(q, bid, vName) {
    try {
      var payload = {
        _subject: '[벨로르] 내시계팔기 업체 선택 알림',
        _template: 'table', _captcha: 'false',
        시계: (q.brand || '') + ' ' + (q.model || ''),
        선택금액: won(bid.amount),
        선택업체: vName || '(상호 비공개)',
        견적ID: q.id, 입찰ID: bid.id
      };
      fetch('https://formsubmit.co/ajax/' + ADMIN_EMAIL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(payload)
      }).catch(function () {});
    } catch (e) {}
  }

  /* ===== 화면들 ===== */
  var SCREENS = {};
  var NO_TREND = '<div class="cqd-nodata"><b>최근 6개월 시세</b><span>최근 6개월 내 데이터가 없습니다.</span></div>';

  function watchCard(q) {
    var ph = (q.photos && q.photos[0]) || '';
    return '<div class="cqd-watchcard">' +
      '<div class="cqd-watchcard-head">' +
        '<img src="' + esc(ph) + '" alt="" onerror="this.style.visibility=\'hidden\'">' +
        '<div><p class="cqd-wc-brand">' + esc(q.brand || '시계') + '</p>' +
        '<p class="cqd-wc-model">' + esc(q.model || '') + '</p>' +
        '<p class="cqd-wc-ref">사진 ' + (q.photoCount || (q.photos ? q.photos.length : 0)) + '장</p></div>' +
        statusBadge(q) +
      '</div>' +
    '</div>';
  }

  /* --- 고객: 내 시계 목록 --- */
  SCREENS['c-watches'] = function () {
    titleEl.textContent = '내 시계팔기';
    if (!cust.loaded) return loadingBlock();
    var rows = cust.watches.map(function (q) {
      var n = (q.bids || []).length;
      var right = (q.status === 'open' || q.status === 'awarded') && q.bidAmount
        ? '<span class="cqd-vrow-amt">' + man(q.bidAmount) + '원<small>›</small></span>'
        : '<span class="cqd-vrow-amt"><small>›</small></span>';
      return '<button type="button" class="cqd-vrow" data-cqd-go="c-bids" data-cqd-id="' + esc(q.id) + '">' +
        '<span class="cqd-avatar lite">⌚</span>' +
        '<span class="cqd-vrow-main">' +
          '<span class="cqd-vrow-name">' + esc((q.brand || '') + ' ' + (q.model || '')) + ' ' + statusBadge(q) + '</span>' +
          '<span class="cqd-vrow-sub"><em>받은 입찰 ' + n + '건</em></span>' +
        '</span>' + right +
      '</button>';
    }).join('');
    if (!rows) {
      return '<div class="cqd-screen">' +
        '<p class="cqd-note">아직 판매 등록한 시계가 없습니다.</p>' +
        '<div class="cqd-empty-cta">' +
          '<p>시계를 등록하면 여러 업체가 금액을 제시해요.<br>여기에서 받은 견적을 확인하고 선택할 수 있어요.</p>' +
          '<button type="button" class="cqd-cta primary" data-cqd-go="c-new">＋ 시계 등록하러 가기</button>' +
        '</div>' +
      '</div>';
    }
    return '<div class="cqd-screen">' +
      '<p class="cqd-note">판매 등록한 내 시계입니다. 시계를 눌러 받은 견적을 확인하세요.</p>' +
      '<div class="cqd-vlist">' + rows + '</div>' +
    '</div>';
  };

  /* --- 고객: 받은 견적(금액만) / 상태 / 확정 업체 --- */
  SCREENS['c-bids'] = function (id) {
    if (!cust.loaded) return loadingBlock();
    var q = findIn(cust.watches, id); if (!q) return '<div class="cqd-screen"><p class="cqd-note">정보를 찾을 수 없습니다.</p></div>';
    titleEl.textContent = '비교견적 결과';
    var head = watchCard(q) + priceTrendCard();

    if (q.status === 'pending')
      return '<div class="cqd-screen">' + head + '<p class="cqd-state wait">🕒 관리자 승인 대기중입니다.<br><span>승인되면 업체 입찰이 시작됩니다.</span></p></div>';
    if (q.status === 'suspended')
      return '<div class="cqd-screen">' + head + '<p class="cqd-state stop">⛔ 관리자에 의해 정지된 견적입니다.</p></div>';
    if (q.status === 'closed')
      return '<div class="cqd-screen">' + head + '<p class="cqd-state stop">종료된 견적입니다.</p></div>';
    if (q.status === 'awarded')
      return '<div class="cqd-screen">' + head + awardedBlock(q) + '</div>';

    /* open */
    var bids = q.bids || [];
    if (!bids.length)
      return '<div class="cqd-screen">' + head + '<p class="cqd-state wait">🕒 업체 입찰을 기다리는 중입니다.<br><span>입찰이 들어오면 이 화면에 표시됩니다.</span></p></div>';

    var rows = bids.map(function (b, i) {
      var top = i === 0;
      return '<button type="button" class="cqd-vrow cqd-bidrow' + (top ? ' is-top' : '') + '" data-cqd-award data-cqd-q="' + esc(q.id) + '" data-cqd-bid="' + esc(b.id) + '" data-cqd-vendor="' + esc(b.vendor_id) + '" data-cqd-amt="' + Number(b.amount) + '">' +
        '<span class="cqd-rankpill' + (top ? ' top' : '') + '">' + (i + 1) + '위</span>' +
        '<span class="cqd-vrow-main">' +
          '<span class="cqd-vrow-name">' + (top ? '최고 견적' : (i + 1) + '순위 견적') + '</span>' +
          '<span class="cqd-vrow-sub"><em>업체 비공개 · 선택 시 공개</em></span>' +
        '</span>' +
        '<span class="cqd-vrow-amt">' + won(b.amount) + '<small>선택</small></span>' +
      '</button>';
    }).join('');
    return '<div class="cqd-screen">' + head +
      '<div class="cqd-statline">' +
        '<span><b>' + bids.length + '</b>건 입찰</span>' +
        '<span>최고 <b class="cqd-hi">' + won(q.bidAmount) + '</b></span>' +
      '</div>' +
      '<p class="cqd-note">업체명·정보는 공개되지 않습니다. <b>금액만 비교</b>해 선택하세요. 선택한 업체만 정보가 공개됩니다.</p>' +
      '<div class="cqd-vlist">' + rows + '</div>' +
    '</div>';
  };

  function awardedBlock(q) {
    var ab = null;
    (q.bids || []).forEach(function (b) { if (b.id === q.awarded_bid) ab = b; });
    if (!ab) ab = (q.bids || [])[0] || { amount: 0, message: '' };
    var vp = awardedVendorCache[q.id];
    if (vp === undefined && B && B.getVendorPublic && ab.vendor_id) {
      awardedVendorCache[q.id] = null; // 중복요청 방지
      B.getVendorPublic(ab.vendor_id).then(function (p) { awardedVendorCache[q.id] = p; renderIfOpen(); });
    }
    var name = (vp && (vp.company_name || vp.display_name)) || '확정 업체 (벨로르 인증)';
    var logo = vp && vp.logo_url;
    return '<p class="cqd-state done">✓ 판매가 확정되었습니다. 확정한 업체만 정보가 공개됩니다.</p>' +
      '<div class="cqd-shop">' +
        '<div class="cqd-shop-avatar">' + (logo ? '<img src="' + esc(logo) + '" alt="" onerror="this.remove()">' : esc(name.charAt(0))) + '</div>' +
        '<p class="cqd-shop-name">' + esc(name) + '</p>' +
        '<div class="cqd-shop-trust">' +
          '<div><b>정품 보장</b><small>100% 정품</small></div>' +
          '<div><b>전문 감정</b><small>감정사 검수</small></div>' +
          '<div><b>안전 거래</b><small>벨로르 보증</small></div>' +
        '</div>' +
      '</div>' +
      '<div class="cqd-offer">' +
        '<p class="cqd-offer-label">확정 견적</p>' +
        '<p class="cqd-offer-amt">' + num(ab.amount) + '<span>원</span></p>' +
        '<dl class="cqd-rows">' +
          '<div><dt>업체 메모</dt><dd>' + esc(ab.message || '-') + '</dd></div>' +
        '</dl>' +
        '<p class="cqd-locked">🔒 업체 연락처·주소는 공개되지 않습니다. 모든 거래는 <b>벨로르를 통해</b> 안전하게 진행됩니다.</p>' +
      '</div>' +
      '<p class="cqd-block-label">벨로르 거래 후기</p>' +
      '<ul class="cqd-news">' + reviewList() + '</ul>';
  }

  /* --- 고객: 새 시계 등록(비교견적 신청) — 앱 내 전체화면 페이지 --- */
  function photoGrid() {
    var thumbs = '';
    for (var i = 0; i < newPhotos.length; i++) {
      var url = '';
      try { url = URL.createObjectURL(newPhotos[i]); } catch (e) {}
      thumbs += '<div class="cqd-photo">' +
        (url ? '<img src="' + url + '" alt="">' : '') +
        '<button type="button" class="cqd-photo-rm" data-cqd-rmphoto="' + i + '" aria-label="삭제">×</button>' +
      '</div>';
    }
    return thumbs +
      '<button type="button" class="cqd-photo-add" data-cqd-addphoto>＋<small>사진</small></button>';
  }
  function refreshPhotoGrid() {
    var g = overlay && overlay.querySelector('#cqdNewPhotos');
    if (g) g.innerHTML = photoGrid();
  }
  SCREENS['c-new'] = function () {
    titleEl.textContent = '비교견적 신청';
    var info = AUTH.info || {};
    var nm = (AUTH.user && AUTH.user.displayName) || '';
    var ph = info.phone || '';
    var brandOpts = '<option value="">선택해주세요</option>' +
      BRAND_OPTS.map(function (b) { return '<option>' + esc(b) + '</option>'; }).join('');
    var partChips = PART_OPTS.map(function (p) {
      return '<label class="cqd-chk"><input type="checkbox" name="cqdpart" value="' + esc(p) + '"><span>' + esc(p) + '</span></label>';
    }).join('');
    return '<div class="cqd-screen">' +
      '<div class="cqd-newhero">' +
        '<p class="cqd-newhero-eyebrow">REQUEST QUOTE</p>' +
        '<h2 class="cqd-newhero-title">내 시계 비교견적 신청</h2>' +
        '<p class="cqd-newhero-sub">사진과 정보만 등록하면 여러 업체가 금액을 제시합니다.<br>업체명·정보는 <b>확정 시에만</b> 공개됩니다.</p>' +
      '</div>' +
      '<div class="cqd-form">' +
        '<label>시계 사진 *</label>' +
        '<div class="cqd-photos" id="cqdNewPhotos">' + photoGrid() + '</div>' +
        '<input type="file" id="cqdNewFile" accept="image/*" multiple hidden>' +
        '<label>브랜드 *</label>' +
        '<select id="cqdNewBrand">' + brandOpts + '</select>' +
        '<label>모델명 / 레퍼런스 *</label>' +
        '<input type="text" id="cqdNewModel" placeholder="예: 서브마리너 126610LN">' +
        '<label>구입 시기</label>' +
        '<input type="text" id="cqdNewYear" placeholder="예: 2023년 1월">' +
        '<label>구성품 (중복 선택)</label>' +
        '<div class="cqd-chkgrid">' + partChips + '</div>' +
        '<label>특이사항 (수리이력 · 흠집 · 정품여부 등)</label>' +
        '<textarea id="cqdNewMemo" rows="4" placeholder="시계 상태를 자세히 적어주실수록 정확한 견적이 가능합니다."></textarea>' +
        '<label>성함 *</label>' +
        '<input type="text" id="cqdNewName" value="' + esc(nm) + '" placeholder="홍길동">' +
        '<label>연락처 *</label>' +
        '<input type="tel" id="cqdNewPhone" value="' + esc(ph) + '" placeholder="010-0000-0000">' +
        '<button type="button" class="cqd-cta primary" data-cqd-submit>비교견적 신청하기</button>' +
        '<button type="button" class="cqd-cta ghost" data-cqd-go="c-watches">취소</button>' +
        '<p class="cqd-offer-foot">* 등록 후 정·가품 구별 및 감정 승인 절차가 진행됩니다.</p>' +
      '</div>' +
    '</div>';
  };

  /* --- 업체: 들어온 비교견적 --- */
  SCREENS['v-watches'] = function () {
    titleEl.textContent = '들어온 비교견적';
    var approved = !!(AUTH.info && AUTH.info.isApprovedVendor);
    var suspended = !!(AUTH.info && AUTH.info.suspended);
    var notice = '';
    if (suspended) notice = '<p class="cqd-state stop">⛔ 사용정지된 업체 계정입니다. 입찰이 제한됩니다.</p>';
    else if (!approved) notice = '<p class="cqd-state wait">🕒 업체 승인 대기중입니다. 승인 후 입찰할 수 있어요.</p>';
    if (!vend.loaded) return '<div class="cqd-screen">' + vendorSubtabs('v-watches') + loadingBody();
    var rows = vend.quotes.map(function (q) {
      var mine = myBidOf(q);
      return '<button type="button" class="cqd-vrow" data-cqd-go="v-bid" data-cqd-id="' + esc(q.id) + '">' +
        '<span class="cqd-avatar lite">⌚</span>' +
        '<span class="cqd-vrow-main">' +
          '<span class="cqd-vrow-name">' + esc((q.brand || '') + ' ' + (q.model || '')) + '</span>' +
          '<span class="cqd-vrow-sub"><em>입찰 ' + (q.bids || []).length + '건' + (mine ? ' · 내 입찰 ' + man(mine.amount) + '원' : '') + '</em></span>' +
        '</span>' +
        '<span class="cqd-vrow-amt">' + (mine ? '수정' : '입찰') + '<small>›</small></span>' +
      '</button>';
    }).join('') || '<p class="cqd-note">현재 입찰 가능한 견적이 없습니다.</p>';
    return '<div class="cqd-screen">' + vendorSubtabs('v-watches') + notice +
      '<p class="cqd-note">진행중인 견적에 제안가를 입력하세요.</p>' +
      '<div class="cqd-vlist">' + rows + '</div>' +
    '</div>';
  };
  function loadingBody() { return '<p class="cqd-note">불러오는 중…</p></div>'; }
  function vendorSubtabs(cur) {
    return '<div class="cqd-subtabs">' +
      '<button type="button" class="' + (cur === 'v-watches' ? 'is-on' : '') + '" data-cqd-go="v-watches">입찰 요청</button>' +
      '<button type="button" class="' + (cur === 'v-manage' ? 'is-on' : '') + '" data-cqd-go="v-manage">내 업체 관리</button>' +
    '</div>';
  }

  /* --- 업체: 입찰 입력 --- */
  SCREENS['v-bid'] = function (id) {
    if (!vend.loaded) return loadingBlock();
    var q = findIn(vend.quotes, id); if (!q) return '<div class="cqd-screen"><p class="cqd-note">정보 없음</p></div>';
    titleEl.textContent = '제안가 입력';
    var mine = myBidOf(q);
    var approved = !!(AUTH.info && AUTH.info.isApprovedVendor);
    return '<div class="cqd-screen">' +
      watchCard(q) + priceTrendCard() +
      (approved ? '' : '<p class="cqd-state wait">🕒 업체 승인 후 입찰이 저장됩니다.</p>') +
      '<div class="cqd-form">' +
        '<label>제안 금액 (원)</label>' +
        '<input type="tel" id="cqdBidAmt" value="' + (mine ? mine.amount : '') + '" placeholder="예: 21000000">' +
        '<label>고객에게 전할 메모</label>' +
        '<textarea id="cqdBidMsg" rows="3" placeholder="당일 현금 지급 가능합니다.">' + esc(mine ? (mine.message || '') : '') + '</textarea>' +
        '<button type="button" class="cqd-cta primary" data-cqd-bidsave="' + esc(q.id) + '">' + (mine ? '입찰 수정하기' : '입찰 등록하기') + '</button>' +
        '<button type="button" class="cqd-cta ghost" data-cqd-go="v-watches">‹ 취소</button>' +
      '</div>' +
    '</div>';
  };

  /* --- 업체: 내 업체 관리 --- */
  SCREENS['v-manage'] = function () {
    titleEl.textContent = '내 업체 관리';
    var info = AUTH.info || {};
    var name = info.companyName || (AUTH.user && AUTH.user.displayName) || '내 업체';
    var logo = info.logoUrl || '';
    var statusTxt = info.suspended ? '<span class="cqd-badge stop">정지</span>' : (info.isApprovedVendor ? '<span class="cqd-badge done">승인</span>' : '<span class="cqd-badge wait">승인대기</span>');
    return '<div class="cqd-screen">' + vendorSubtabs('v-manage') +
      '<div class="cqd-shop">' +
        '<div class="cqd-shop-avatar">' + (logo ? '<img src="' + esc(logo) + '" alt="" onerror="this.remove()">' : esc(name.charAt(0).toUpperCase())) + '</div>' +
        '<p class="cqd-shop-name">' + esc(name) + ' ' + statusTxt + '</p>' +
        '<p class="cqd-mini">상호와 대표 이미지는 고객의 확정 화면에 표시됩니다.</p>' +
      '</div>' +
      '<div class="cqd-form">' +
        '<label>업체명(상호)</label>' +
        '<input type="text" id="cqdVName" value="' + esc(name) + '" placeholder="업체명">' +
        '<label>대표 이미지 주소 (URL)</label>' +
        '<input type="text" id="cqdVImg" value="' + esc(logo) + '" placeholder="https://…  (비우면 첫 글자 표시)">' +
        '<button type="button" class="cqd-cta primary" data-cqd-vsave>업체 정보 저장</button>' +
      '</div>' +
      '<p class="cqd-block-label">벨로르 거래 후기</p>' +
      '<ul class="cqd-news">' + reviewList() + '</ul>' +
    '</div>';
  };

  /* --- 관리자 --- */
  function adminSubtabs(cur) {
    return '<div class="cqd-subtabs">' +
      '<button type="button" class="' + (cur === 'quotes' ? 'is-on' : '') + '" data-cqd-go="a-dash">견적 현황</button>' +
      '<button type="button" class="' + (cur === 'vendors' ? 'is-on' : '') + '" data-cqd-go="a-vendors">업체 관리</button>' +
      '<button type="button" class="' + (cur === 'customers' ? 'is-on' : '') + '" data-cqd-go="a-customers">고객 관리</button>' +
    '</div>';
  }
  function accById(id) {
    for (var i = 0; i < adm.accounts.length; i++) if (adm.accounts[i].id === id) return adm.accounts[i];
    return null;
  }
  function vendById(id) {
    for (var i = 0; i < adm.vendors.length; i++) if (adm.vendors[i].id === id) return adm.vendors[i];
    return null;
  }
  function allAdminQuotes() { return adm.pending.concat(adm.open); }

  SCREENS['a-dash'] = function () {
    titleEl.textContent = '관리자 · 비교견적';
    if (!adm.loaded) return '<div class="cqd-screen">' + adminSubtabs('quotes') + loadingBody();
    var list = allAdminQuotes();
    var rows = list.map(function (q) {
      var c = accById(q.uid);
      return '<button type="button" class="cqd-vrow" data-cqd-go="a-quote" data-cqd-id="' + esc(q.id) + '">' +
        '<span class="cqd-avatar lite">⌚</span>' +
        '<span class="cqd-vrow-main">' +
          '<span class="cqd-vrow-name">' + esc((q.brand || '') + ' ' + (q.model || '')) + ' ' + statusBadge(q) + '</span>' +
          '<span class="cqd-vrow-sub"><em>고객 ' + esc(c ? (c.display_name || c.email || '회원') : '회원') + ' · 입찰 ' + (q.bids || []).length + '건</em></span>' +
        '</span>' +
        '<span class="cqd-vrow-amt">' + (q.bidAmount ? man(q.bidAmount) + '원' : '-') + '<small>›</small></span>' +
      '</button>';
    }).join('') || '<p class="cqd-note">대기/진행중 견적이 없습니다.</p>';
    return '<div class="cqd-screen">' + adminSubtabs('quotes') +
      '<div class="cqd-stats">' +
        '<div class="cqd-stat"><b>' + adm.pending.length + '</b><span>승인 대기</span></div>' +
        '<div class="cqd-stat"><b>' + adm.open.length + '</b><span>입찰 진행</span></div>' +
        '<div class="cqd-stat"><b>' + adm.vendors.length + '</b><span>업체</span></div>' +
      '</div>' +
      '<p class="cqd-block-label">견적 목록</p>' +
      '<div class="cqd-vlist">' + rows + '</div>' +
    '</div>';
  };

  SCREENS['a-quote'] = function (id) {
    var q = findIn(allAdminQuotes(), id); if (!q) return '<div class="cqd-screen"><p class="cqd-note">정보 없음</p></div>';
    titleEl.textContent = '견적 상세';
    var c = accById(q.uid);
    var bids = q.bids || [];
    var rows = bids.map(function (b, i) {
      var v = vendById(b.vendor_id);
      return '<div class="cqd-vrow static">' +
        vendorAvatar(v) +
        '<span class="cqd-vrow-main">' +
          '<span class="cqd-vrow-name">' + (i + 1) + '. ' + esc(vendorName(v)) +
            (q.awarded_bid === b.id ? ' <span class="cqd-flag awd">채택</span>' : (i === 0 ? ' <span class="cqd-flag top">최고가</span>' : '')) + '</span>' +
          '<span class="cqd-vrow-sub"><em>' + (b.message ? esc(b.message) : '메모 없음') + '</em></span>' +
        '</span>' +
        '<span class="cqd-vrow-amt">' + won(b.amount) + '</span>' +
      '</div>';
    }).join('') || '<p class="cqd-note">아직 입찰이 없습니다.</p>';
    var approveBtns = q.status === 'pending'
      ? '<button type="button" class="cqd-actbtn ok" data-cqd-approve="' + esc(q.id) + '">견적 승인(입찰 시작)</button>' +
        '<button type="button" class="cqd-actbtn warn" data-cqd-reject="' + esc(q.id) + '">거부</button>'
      : '';
    var suspBtn = q.status === 'suspended'
      ? '<button type="button" class="cqd-actbtn stop" data-cqd-unsuspendq="' + esc(q.id) + '">견적 정지 해제</button>'
      : '<button type="button" class="cqd-actbtn stop" data-cqd-suspendq="' + esc(q.id) + '">견적 정지</button>';
    return '<div class="cqd-screen">' +
      watchCard(q) +
      '<div class="cqd-cust">' +
        '<p class="cqd-cust-h">등록 고객 정보</p>' +
        '<dl class="cqd-rows">' +
          '<div><dt>고객</dt><dd>' + esc(c ? (c.display_name || '회원') : '회원') + (c && c.grade ? ' (' + esc(c.grade) + ')' : '') + '</dd></div>' +
          '<div><dt>계정</dt><dd>' + esc(c && c.email ? c.email : (q.uid || '-')) + '</dd></div>' +
          '<div><dt>신청 메모</dt><dd>' + esc(q.memo || '-') + '</dd></div>' +
        '</dl>' +
      '</div>' +
      '<div class="cqd-actions">' + approveBtns + suspBtn +
        '<button type="button" class="cqd-actbtn warn" data-cqd-delq="' + esc(q.id) + '">견적 삭제</button>' +
      '</div>' +
      '<p class="cqd-block-label">전체 업체 입찰 (관리자만 열람)</p>' +
      '<div class="cqd-vlist">' + rows + '</div>' +
    '</div>';
  };

  SCREENS['a-vendors'] = function () {
    titleEl.textContent = '관리자 · 업체 관리';
    var rows = adm.vendors.map(function (v) {
      var flags = (v.approved ? '' : '<span class="cqd-badge wait">승인대기</span> ') +
        (v.vip ? '<span class="cqd-badge done">VIP</span> ' : '') +
        (v.suspended ? '<span class="cqd-badge stop">정지</span>' : '');
      return '<button type="button" class="cqd-vrow' + (v.suspended ? ' is-stop' : '') + '" data-cqd-go="a-vendor" data-cqd-id="' + esc(v.id) + '">' +
        vendorAvatar(v) +
        '<span class="cqd-vrow-main">' +
          '<span class="cqd-vrow-name">' + esc(vendorName(v)) + ' ' + flags + '</span>' +
          '<span class="cqd-vrow-sub"><em>' + esc(v.email || v.id) + '</em></span>' +
        '</span>' +
        '<span class="cqd-vrow-amt"><small>›</small></span>' +
      '</button>';
    }).join('') || '<p class="cqd-note">등록된 업체가 없습니다.</p>';
    return '<div class="cqd-screen">' + adminSubtabs('vendors') +
      '<p class="cqd-block-label">업체 (' + adm.vendors.length + ')</p>' +
      '<div class="cqd-vlist">' + rows + '</div>' +
    '</div>';
  };

  SCREENS['a-vendor'] = function (id) {
    var v = vendById(id); if (!v) return '<div class="cqd-screen"><p class="cqd-note">정보 없음</p></div>';
    titleEl.textContent = '업체 상세';
    return '<div class="cqd-screen">' +
      '<div class="cqd-shop">' +
        '<div class="cqd-shop-avatar">' + (v.logo_url ? '<img src="' + esc(v.logo_url) + '" alt="" onerror="this.remove()">' : esc(vendorLetter(v))) + '</div>' +
        '<p class="cqd-shop-name">' + esc(vendorName(v)) + (v.suspended ? ' <span class="cqd-badge stop">정지</span>' : '') + '</p>' +
      '</div>' +
      '<dl class="cqd-rows cqd-contact">' +
        '<div><dt>이메일</dt><dd>' + esc(v.email || '-') + '</dd></div>' +
        '<div><dt>연락처</dt><dd>' + esc(v.phone || '-') + '</dd></div>' +
        '<div><dt>승인</dt><dd>' + (v.approved ? '승인됨' : '대기') + '</dd></div>' +
        '<div><dt>계좌인증</dt><dd>' + (v.account_verified ? '완료' : '미완료') + '</dd></div>' +
      '</dl>' +
      '<div class="cqd-actions">' +
        (v.approved
          ? '<button type="button" class="cqd-actbtn" data-cqd-unapprovev="' + esc(v.id) + '">승인 취소</button>'
          : '<button type="button" class="cqd-actbtn ok" data-cqd-approvev="' + esc(v.id) + '">업체 승인</button>') +
        (v.vip
          ? '<button type="button" class="cqd-actbtn" data-cqd-unvipv="' + esc(v.id) + '">VIP 해제</button>'
          : '<button type="button" class="cqd-actbtn" data-cqd-vipv="' + esc(v.id) + '">VIP 지정</button>') +
        (v.suspended
          ? '<button type="button" class="cqd-actbtn stop" data-cqd-unsuspendv="' + esc(v.id) + '">사용정지 해제</button>'
          : '<button type="button" class="cqd-actbtn stop" data-cqd-suspendv="' + esc(v.id) + '">사용정지</button>') +
        '<button type="button" class="cqd-actbtn warn" data-cqd-delv="' + esc(v.id) + '">업체 삭제</button>' +
      '</div>' +
    '</div>';
  };

  SCREENS['a-customers'] = function () {
    titleEl.textContent = '관리자 · 고객 관리';
    var custs = adm.accounts.filter(function (p) { return p.role !== 'vendor' && p.role !== 'admin'; });
    var rows = custs.map(function (p) {
      var nm = p.display_name || p.email || '회원';
      return '<div class="cqd-vrow static">' +
        '<span class="cqd-avatar">' + esc(nm.charAt(0).toUpperCase()) + '</span>' +
        '<span class="cqd-vrow-main">' +
          '<span class="cqd-vrow-name">' + esc(nm) + (p.grade ? ' <span class="cqd-flag top">' + esc(p.grade) + '</span>' : '') + '</span>' +
          '<span class="cqd-vrow-sub"><em>' + esc(p.email || p.id) + '</em></span>' +
        '</span>' +
        '<span class="cqd-actions inline">' +
          (p.email ? '<button type="button" class="cqd-actbtn sm" data-resetpw="' + esc(p.email) + '">비번 재설정</button>' : '') +
          '<button type="button" class="cqd-actbtn sm warn" data-cqd-delc="' + esc(p.id) + '">삭제</button>' +
        '</span>' +
      '</div>';
    }).join('') || '<p class="cqd-note">가입한 고객이 없습니다.</p>';
    return '<div class="cqd-screen">' + adminSubtabs('customers') +
      '<p class="cqd-note">고객 정보 확인 · 비밀번호 재설정 메일 발송 · 계정 삭제가 가능합니다.</p>' +
      '<div class="cqd-vlist">' + rows + '</div>' +
    '</div>';
  };

  function findIn(arr, id) {
    for (var i = 0; i < arr.length; i++) if (arr[i].id === id) return arr[i];
    return null;
  }

  /* ===== 클릭 위임 ===== */
  function onClick(e) {
    if (e.target.closest('.cqd-close')) { close(); return; }
    if (e.target.closest('.cqd-back')) { back(); return; }

    var nav = e.target.closest('[data-cqd-go]');
    if (nav) { go(nav.getAttribute('data-cqd-go'), nav.getAttribute('data-cqd-id') || null); return; }

    var cnav = e.target.closest('[data-cqd-close-nav]');
    if (cnav) { close(); location.hash = '#' + cnav.getAttribute('data-cqd-close-nav'); return; }

    /* 상단 + 버튼 → 새 시계 등록 */
    if (e.target.closest('.cqd-add')) { go('c-new'); return; }

    /* 신규 등록: 사진 추가/삭제 */
    if (e.target.closest('[data-cqd-addphoto]')) {
      var fileEl = overlay.querySelector('#cqdNewFile');
      if (fileEl) fileEl.click();
      return;
    }
    var rmph = e.target.closest('[data-cqd-rmphoto]');
    if (rmph) { newPhotos.splice(Number(rmph.getAttribute('data-cqd-rmphoto')), 1); refreshPhotoGrid(); return; }

    /* 신규 등록: 제출 */
    var sub = e.target.closest('[data-cqd-submit]');
    if (sub) { submitNew(sub); return; }

    /* 고객: 견적 선택(확정) */
    var aw = e.target.closest('[data-cqd-award]');
    if (aw) {
      var qid = aw.getAttribute('data-cqd-q');
      var bidId = aw.getAttribute('data-cqd-bid');
      var vendorId = aw.getAttribute('data-cqd-vendor');
      var amt = Number(aw.getAttribute('data-cqd-amt'));
      var qa = findIn(cust.watches, qid); if (!qa) return;
      if (!confirm(won(amt) + ' 견적으로 판매를 확정할까요?\n확정 후 해당 업체 정보가 공개되며, 관리자에게 전송됩니다.')) return;
      B.awardBid(qid, bidId, vendorId).then(function () {
        var vp = awardedVendorCache[qid];
        emailAdmin(qa, { amount: amt, id: bidId }, vp && (vp.company_name || vp.display_name));
        alert('판매가 확정되었습니다. 관리자(' + ADMIN_EMAIL + ')에게 선택 내역을 전송했습니다.');
      }).catch(function (err) { alert('확정 실패: ' + msg(err)); });
      return;
    }

    /* 업체: 입찰 등록/수정 */
    var bf = e.target.closest('[data-cqd-bidsave]');
    if (bf) {
      var bq = findIn(vend.quotes, bf.getAttribute('data-cqd-bidsave')); if (!bq) return;
      var amtEl = overlay.querySelector('#cqdBidAmt');
      var msgEl = overlay.querySelector('#cqdBidMsg');
      var v = Number(String(amtEl && amtEl.value || '').replace(/[^0-9]/g, ''));
      if (!v) { alert('제안 금액을 입력해주세요.'); return; }
      bf.disabled = true;
      B.placeBid({ id: bq.id }, v, msgEl ? msgEl.value.trim() : '').then(function () {
        alert(won(v) + '으로 입찰했습니다.'); back();
      }).catch(function (err) { alert('입찰 실패: ' + msg(err)); }).then(function () { bf.disabled = false; });
      return;
    }

    /* 업체: 내 업체 정보 저장 */
    var vs = e.target.closest('[data-cqd-vsave]');
    if (vs) {
      var nm = overlay.querySelector('#cqdVName');
      var im = overlay.querySelector('#cqdVImg');
      B.updateMyVendorProfile({ company_name: nm ? nm.value.trim() : null, logo_url: im ? im.value.trim() : '' })
        .then(function () { alert('업체 정보가 저장되었습니다.'); render(); })
        .catch(function (err) { alert('저장 실패: ' + msg(err)); });
      return;
    }

    /* 관리자: 견적 승인/거부/정지/삭제 */
    var ap = e.target.closest('[data-cqd-approve]');
    if (ap) { B.approveListing(ap.getAttribute('data-cqd-approve')).then(function(){ alert('승인했습니다. 업체 입찰이 시작됩니다.'); }).catch(function (err) { alert('실패: ' + msg(err)); }); return; }
    var rj = e.target.closest('[data-cqd-reject]');
    if (rj) { if (confirm('이 견적을 거부할까요?')) B.rejectListing(rj.getAttribute('data-cqd-reject')).then(function(){ go('a-dash', null, true); }).catch(function (err) { alert('실패: ' + msg(err)); }); return; }
    var sq = e.target.closest('[data-cqd-suspendq]');
    if (sq) { if (confirm('이 견적을 정지할까요?')) B.suspendQuote(sq.getAttribute('data-cqd-suspendq')).catch(function (err) { alert('실패: ' + msg(err)); }); return; }
    var usq = e.target.closest('[data-cqd-unsuspendq]');
    if (usq) { B.unsuspendQuote(usq.getAttribute('data-cqd-unsuspendq')).catch(function (err) { alert('실패: ' + msg(err)); }); return; }
    var dq = e.target.closest('[data-cqd-delq]');
    if (dq) { if (confirm('이 견적을 삭제할까요? 되돌릴 수 없습니다.')) B.deleteQuote(dq.getAttribute('data-cqd-delq')).then(function(){ go('a-dash', null, true); }).catch(function (err) { alert('실패: ' + msg(err)); }); return; }

    /* 관리자: 업체 승인/VIP/정지/삭제 */
    var apv = e.target.closest('[data-cqd-approvev]');
    if (apv) { B.setVendorApproved(apv.getAttribute('data-cqd-approvev'), true).catch(function (err) { alert('실패: ' + msg(err)); }); return; }
    var uapv = e.target.closest('[data-cqd-unapprovev]');
    if (uapv) { if (confirm('승인을 취소할까요?')) B.setVendorApproved(uapv.getAttribute('data-cqd-unapprovev'), false).catch(function (err) { alert('실패: ' + msg(err)); }); return; }
    var vip = e.target.closest('[data-cqd-vipv]');
    if (vip) { B.setVip(vip.getAttribute('data-cqd-vipv'), true).catch(function (err) { alert('실패: ' + msg(err)); }); return; }
    var uvip = e.target.closest('[data-cqd-unvipv]');
    if (uvip) { B.setVip(uvip.getAttribute('data-cqd-unvipv'), false).catch(function (err) { alert('실패: ' + msg(err)); }); return; }
    var sv = e.target.closest('[data-cqd-suspendv]');
    if (sv) { if (confirm('이 업체를 사용정지할까요?')) B.setVendorSuspended(sv.getAttribute('data-cqd-suspendv'), true).catch(function (err) { alert('실패: ' + msg(err)); }); return; }
    var usv = e.target.closest('[data-cqd-unsuspendv]');
    if (usv) { B.setVendorSuspended(usv.getAttribute('data-cqd-unsuspendv'), false).catch(function (err) { alert('실패: ' + msg(err)); }); return; }
    var dv = e.target.closest('[data-cqd-delv]');
    if (dv) { if (confirm('이 업체를 삭제할까요? (Auth 계정 완전 삭제는 콘솔에서)')) B.deleteAccount(dv.getAttribute('data-cqd-delv')).then(function(){ go('a-vendors', null, true); }).catch(function (err) { alert('실패: ' + msg(err)); }); return; }
    var dc = e.target.closest('[data-cqd-delc]');
    if (dc) { if (confirm('이 고객 계정을 삭제할까요?')) B.deleteAccount(dc.getAttribute('data-cqd-delc')).catch(function (err) { alert('실패: ' + msg(err)); }); return; }
    /* data-resetpw 는 전역 핸들러(bellore-features.js)가 처리 */
  }

  function msg(err) { return (err && (err.message || err.code)) || '오류'; }

  /* 사진 선택(파일 input) */
  function onChange(e) {
    if (e.target && e.target.id === 'cqdNewFile') {
      var fs = e.target.files;
      for (var i = 0; i < fs.length; i++) newPhotos.push(fs[i]);
      e.target.value = '';
      refreshPhotoGrid();
    }
  }

  /* 신규 등록 제출 → 실제 백엔드(quote_requests) 저장 */
  function submitNew(btn) {
    var brand = valOf('#cqdNewBrand');
    var model = valOf('#cqdNewModel');
    var year = valOf('#cqdNewYear');
    var memo = valOf('#cqdNewMemo');
    var name = valOf('#cqdNewName');
    var phone = valOf('#cqdNewPhone');
    var parts = [];
    var chk = overlay.querySelectorAll('input[name="cqdpart"]:checked');
    for (var i = 0; i < chk.length; i++) parts.push(chk[i].value);
    if (!newPhotos.length) { alert('시계 사진을 1장 이상 등록해주세요.'); return; }
    if (!brand) { alert('브랜드를 선택해주세요.'); return; }
    if (!model) { alert('모델명을 입력해주세요.'); return; }
    if (!name || !phone) { alert('성함과 연락처를 입력해주세요.'); return; }
    var fullMemo = '';
    if (year) fullMemo += '[구입 시기] ' + year + '\n';
    if (parts.length) fullMemo += '[구성품] ' + parts.join(' · ') + '\n';
    if (memo) fullMemo += memo;
    if (!B.addListing) { alert('등록 기능을 사용할 수 없습니다.'); return; }
    btn.disabled = true; btn.textContent = '등록 중…';
    B.addListing({ photos: newPhotos, brand: brand, model: model, memo: fullMemo.trim(), name: name, phone: phone })
      .then(function () {
        newPhotos = [];
        alert('비교견적 신청이 접수되었습니다.\n관리자 승인 후 업체 입찰이 시작됩니다.');
        go('c-watches', null, true);
      })
      .catch(function (err) { alert('신청 실패: ' + msg(err)); })
      .then(function () { btn.disabled = false; btn.textContent = '비교견적 신청하기'; });
  }
  function valOf(sel) {
    var el = overlay && overlay.querySelector(sel);
    return el ? String(el.value || '').trim() : '';
  }

  /* ===== 열기/닫기 ===== */
  function open(opts) {
    if (!B || !B.enabled) { alert('로그인 후 이용할 수 있습니다.'); return; }
    if (!myUid()) { alert('로그인 후 이용할 수 있습니다.'); return; }
    build();
    accountRole = detectRole();
    if (accountRole === 'admin') { rolesEl.hidden = false; viewRole = 'admin'; }
    else { rolesEl.hidden = true; viewRole = accountRole; }
    markRoleTabs();
    setupSubs(accountRole);
    stack = [];
    if (opts && opts.screen && SCREENS[opts.screen]) go(opts.screen, opts.id || null, true);
    else go(homeScreen(), null, true);
    overlay.hidden = false;
    document.body.style.overflow = 'hidden';
  }
  function close() {
    clearSubs();
    if (overlay) overlay.hidden = true;
    document.body.style.overflow = '';
  }

  window.CQDemo = { open: open, close: close };

  /* 마이페이지 진입 버튼 위임 */
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-cqd-open]');
    if (t) { e.preventDefault(); open(); }
  });
})();
