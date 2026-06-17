/* 벨로르 비교견적(내시계팔기) 시스템 — 데모 모듈
   사진 속 앱 화면(시세그래프 → 업체 비교 → 업체상세/제안견적)을 그대로 구현.
   고객 / 업체 / 관리자 3개 시점으로 확인 가능. 마이페이지에서 열림.
   데모용이라 백엔드에 쓰지 않고 메모리 상의 더미 데이터로 동작한다. */
(function () {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function won(n) { return Number(n).toLocaleString('ko-KR') + '원'; }
  function man(n) { return Math.round(n / 10000).toLocaleString('ko-KR') + '만'; }

  /* ===== 더미 데이터 ===== */
  var DATA = {
    watch: {
      brand: 'ROLEX', model: '서브마리너 데이트', ref: '126610LN',
      img: 'assets/images.jpg', parts: '풀세트 (보증서·박스)',
      low: 19800000, high: 21600000,
      trendLabels: ['1월', '2월', '3월', '4월', '5월', '6월'],
      trend: [20800000, 21500000, 20900000, 20100000, 20500000, 21200000]
    },
    bids: [
      { id: 'v1', name: 'WATCH & CO', logo: 'W', amount: 21200000, rating: 4.9, reviews: 1284, deals: 8210, viewed: true,
        address: '서울 강남구 테헤란로 152 7층', hours: '평일 10:00~20:00 · 주말 11:00~18:00',
        method: '당일 현금 / 실시간 계좌이체', pay: '당일 입금', appraisal: '방문 실물 감정',
        msg: '풀세트 기준 최고가로 모시겠습니다. 당일 현금 지급 가능합니다.',
        news: ['이번 주 롤렉스 스포츠 모델 고가 매입 진행중', '신규 고객 첫 거래 시 정산 수수료 0%'] },
      { id: 'v2', name: 'TIME DEGE', logo: 'T', amount: 20600000, rating: 4.8, reviews: 902, deals: 5140, viewed: true,
        address: '서울 종로구 종로 188', hours: '평일 10:30~19:30',
        method: '계좌이체', pay: '당일 입금', appraisal: '실물 감정',
        msg: '정품 확인 후 즉시 입금해드립니다.', news: ['데이저스트 전 모델 매입 강화'] },
      { id: 'v3', name: 'THE HOUR', logo: 'H', amount: 20050000, rating: 4.7, reviews: 651, deals: 3320, viewed: true,
        address: '부산 부산진구 서면로 39', hours: '평일 11:00~20:00',
        method: '현금 / 계좌', pay: '익일 입금', appraisal: '실물 감정',
        msg: '부산 지역 방문 매입 가능합니다.', news: [] },
      { id: 'v4', name: 'LUXE MARKET', logo: 'L', amount: 19900000, rating: 4.6, reviews: 430, deals: 2110, viewed: false,
        address: '대구 중구 동성로 12', hours: '평일 10:00~19:00',
        method: '계좌이체', pay: '당일 입금', appraisal: '사진 감정 후 실물 확정',
        msg: '택배 매입도 가능합니다.', news: [] },
      { id: 'v5', name: 'HERITAGE SEOUL', logo: 'S', amount: 19600000, rating: 4.8, reviews: 1108, deals: 6730, viewed: false,
        address: '서울 중구 을지로 281', hours: '평일 10:00~20:00',
        method: '현금 / 계좌', pay: '당일 입금', appraisal: '방문 실물 감정',
        msg: '20년 전통 정품 보장 매장입니다.', news: ['VIP 고객 전용 픽업 서비스 운영'] }
    ],
    awardedId: null,
    myVendorId: 'v1' // 업체 시점에서 '내 업체'로 동작
  };

  function sortedBids() {
    return DATA.bids.slice().sort(function (a, b) { return b.amount - a.amount; });
  }
  function bidById(id) {
    for (var i = 0; i < DATA.bids.length; i++) if (DATA.bids[i].id === id) return DATA.bids[i];
    return null;
  }
  function viewedCount() {
    var n = 0; DATA.bids.forEach(function (b) { if (b.viewed) n++; }); return n;
  }
  function topBid() { return sortedBids()[0]; }

  /* ===== 별점 표시 ===== */
  function stars(r) {
    var full = Math.round(r);
    var s = '';
    for (var i = 1; i <= 5; i++) s += '<span class="cqd-star' + (i <= full ? ' on' : '') + '">★</span>';
    return '<span class="cqd-stars">' + s + '</span>';
  }

  /* ===== 6개월 시세 그래프 (SVG) ===== */
  function trendChart(vals, labels) {
    var w = 300, h = 120, pad = 24;
    var min = Math.min.apply(null, vals), max = Math.max.apply(null, vals);
    var span = (max - min) || 1;
    var stepX = (w - pad * 2) / (vals.length - 1);
    var pts = vals.map(function (v, i) {
      var x = pad + stepX * i;
      var y = pad + (h - pad * 2) * (1 - (v - min) / span);
      return { x: x, y: y };
    });
    var line = pts.map(function (p, i) { return (i ? 'L' : 'M') + p.x.toFixed(1) + ' ' + p.y.toFixed(1); }).join(' ');
    var area = 'M' + pts[0].x.toFixed(1) + ' ' + (h - pad) + ' ' +
      pts.map(function (p) { return 'L' + p.x.toFixed(1) + ' ' + p.y.toFixed(1); }).join(' ') +
      ' L' + pts[pts.length - 1].x.toFixed(1) + ' ' + (h - pad) + ' Z';
    var dots = pts.map(function (p, i) {
      var last = i === pts.length - 1;
      return '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="' + (last ? 4 : 2.5) +
        '" fill="' + (last ? '#1f3b34' : '#9bb4ab') + '"/>';
    }).join('');
    var xlab = labels.map(function (l, i) {
      return '<text x="' + (pad + stepX * i).toFixed(1) + '" y="' + (h - 6) + '" text-anchor="middle" class="cqd-axis">' + esc(l) + '</text>';
    }).join('');
    return '<svg class="cqd-chart" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="xMidYMid meet">' +
      '<defs><linearGradient id="cqdg" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#1f3b34" stop-opacity=".18"/>' +
      '<stop offset="1" stop-color="#1f3b34" stop-opacity="0"/></linearGradient></defs>' +
      '<path d="' + area + '" fill="url(#cqdg)"/>' +
      '<path d="' + line + '" fill="none" stroke="#1f3b34" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>' +
      dots + xlab + '</svg>';
  }

  /* ===== 상태 ===== */
  var role = 'customer';
  var stack = []; // {screen, param}
  var overlay, bodyEl, titleEl, backBtn;

  function build() {
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.className = 'cqd-overlay'; overlay.id = 'cqdOverlay'; overlay.hidden = true;
    overlay.innerHTML =
      '<div class="cqd-frame">' +
        '<header class="cqd-bar">' +
          '<button type="button" class="cqd-back" aria-label="뒤로" hidden>‹</button>' +
          '<span class="cqd-title">비교견적</span>' +
          '<button type="button" class="cqd-close" aria-label="닫기">×</button>' +
        '</header>' +
        '<div class="cqd-roles">' +
          '<button type="button" data-role="customer" class="is-on">고객</button>' +
          '<button type="button" data-role="vendor">업체</button>' +
          '<button type="button" data-role="admin">관리자</button>' +
        '</div>' +
        '<div class="cqd-body" id="cqdBody"></div>' +
      '</div>';
    document.body.appendChild(overlay);
    bodyEl = overlay.querySelector('#cqdBody');
    titleEl = overlay.querySelector('.cqd-title');
    backBtn = overlay.querySelector('.cqd-back');

    overlay.addEventListener('click', onClick);
    var roleBtns = overlay.querySelectorAll('.cqd-roles button');
    for (var i = 0; i < roleBtns.length; i++) {
      roleBtns[i].addEventListener('click', function () {
        role = this.getAttribute('data-role');
        var bs = overlay.querySelectorAll('.cqd-roles button');
        for (var j = 0; j < bs.length; j++) bs[j].classList.toggle('is-on', bs[j] === this);
        stack = [];
        go(homeScreen(), null, true);
      });
    }
  }

  function homeScreen() {
    return role === 'customer' ? 'c-list' : role === 'vendor' ? 'v-watches' : 'a-dash';
  }

  function go(screen, param, replace) {
    if (replace) stack = [];
    stack.push({ screen: screen, param: param });
    render();
  }
  function back() { if (stack.length > 1) { stack.pop(); render(); } }

  function render() {
    var cur = stack[stack.length - 1];
    backBtn.hidden = stack.length <= 1;
    bodyEl.scrollTop = 0;
    bodyEl.innerHTML = SCREENS[cur.screen] ? SCREENS[cur.screen](cur.param) : '<p>준비중</p>';
  }

  /* ===== 클릭 위임 ===== */
  function onClick(e) {
    if (e.target.closest('.cqd-close')) { close(); return; }
    if (e.target.closest('.cqd-back')) { back(); return; }
    if (e.target === overlay) { close(); return; }

    var nav = e.target.closest('[data-cqd-go]');
    if (nav) { go(nav.getAttribute('data-cqd-go'), nav.getAttribute('data-cqd-id') || null); return; }

    var award = e.target.closest('[data-cqd-award]');
    if (award) {
      var id = award.getAttribute('data-cqd-award');
      var b = bidById(id);
      if (b && confirm(b.name + ' 업체의 견적 ' + won(b.amount) + '(으)로 판매를 확정할까요?')) {
        DATA.awardedId = id;
        alert('판매가 확정되었습니다. ' + b.name + ' 업체의 연락처와 거래 정보가 공개됩니다.');
        render();
      }
      return;
    }

    var bidForm = e.target.closest('[data-cqd-bidsave]');
    if (bidForm) {
      var amtEl = overlay.querySelector('#cqdBidAmt');
      var msgEl = overlay.querySelector('#cqdBidMsg');
      var v = Number(String(amtEl && amtEl.value || '').replace(/[^0-9]/g, ''));
      if (!v) { alert('제안 금액을 입력해주세요.'); return; }
      var me = bidById(DATA.myVendorId);
      if (me) { me.amount = v; me.msg = (msgEl && msgEl.value) || me.msg; me.viewed = true; }
      alert('입찰이 등록되었습니다. 고객 화면에 즉시 반영됩니다.');
      back();
      return;
    }

    var newsForm = e.target.closest('[data-cqd-newssave]');
    if (newsForm) {
      var nt = overlay.querySelector('#cqdNewsTitle');
      if (nt && nt.value.trim()) {
        var me2 = bidById(DATA.myVendorId);
        if (me2) me2.news.unshift(nt.value.trim());
        nt.value = '';
        alert('소식이 등록되었습니다.');
        render();
      } else { alert('소식 내용을 입력해주세요.'); }
      return;
    }
  }

  /* ===== 화면들 ===== */
  var SCREENS = {};

  /* --- 고객: 비교견적 현황 (사진 1+2) --- */
  SCREENS['c-list'] = function () {
    titleEl.textContent = '내 비교견적';
    var w = DATA.watch;
    var bids = sortedBids();
    var awardedExists = !!DATA.awardedId;

    var rows = bids.map(function (b, i) {
      var isAwarded = DATA.awardedId === b.id;
      var top = i === 0;
      var flag = isAwarded ? '<span class="cqd-flag awd">채택됨</span>'
        : (top ? '<span class="cqd-flag top">최고가</span>' : '');
      return '<button type="button" class="cqd-vrow' + (isAwarded ? ' is-awd' : '') + '" data-cqd-go="c-detail" data-cqd-id="' + b.id + '">' +
        '<span class="cqd-avatar">' + esc(b.logo) + '</span>' +
        '<span class="cqd-vrow-main">' +
          '<span class="cqd-vrow-name">' + esc(b.name) + flag + '</span>' +
          '<span class="cqd-vrow-sub">' + stars(b.rating) + '<em>' + b.rating.toFixed(1) + ' · 후기 ' + b.reviews.toLocaleString('ko-KR') + '</em></span>' +
        '</span>' +
        '<span class="cqd-vrow-amt">' + won(b.amount) + '<small>›</small></span>' +
        '</button>';
    }).join('');

    return '<div class="cqd-screen">' +
      // 시세 카드 (사진 1)
      '<div class="cqd-watchcard">' +
        '<div class="cqd-watchcard-head">' +
          '<img src="' + esc(w.img) + '" alt="" onerror="this.style.visibility=\'hidden\'">' +
          '<div><p class="cqd-wc-brand">' + esc(w.brand) + '</p>' +
          '<p class="cqd-wc-model">' + esc(w.model) + '</p>' +
          '<p class="cqd-wc-ref">Ref. ' + esc(w.ref) + ' · ' + esc(w.parts) + '</p></div>' +
        '</div>' +
        '<div class="cqd-pricerange"><span>현재 시세</span><b>' + man(w.low) + ' ~ ' + man(w.high) + '원</b></div>' +
        '<p class="cqd-chart-label">최근 6개월 시세 추이</p>' +
        trendChart(w.trend, w.trendLabels) +
      '</div>' +
      // 현황 (사진 2)
      '<div class="cqd-statline">' +
        '<span><b>' + DATA.bids.length + '</b>곳 입찰</span>' +
        '<span><b>' + viewedCount() + '</b>곳 확인</span>' +
        '<span>최고 <b class="cqd-hi">' + won(topBid().amount) + '</b></span>' +
      '</div>' +
      (awardedExists ? '<p class="cqd-note ok">✓ 판매가 확정되었습니다. 확정 업체만 상세 확인이 가능합니다.</p>'
        : '<p class="cqd-note">업체명을 눌러 제안 내용을 확인하고, 원하는 곳을 선택하세요.</p>') +
      '<div class="cqd-vlist">' + rows + '</div>' +
    '</div>';
  };

  /* --- 고객: 업체 상세 / 제안 견적 (사진 3) --- */
  SCREENS['c-detail'] = function (id) {
    var b = bidById(id); if (!b) return '<p>정보를 찾을 수 없습니다.</p>';
    titleEl.textContent = '업체 제안 상세';
    var isAwarded = DATA.awardedId === b.id;
    var locked = DATA.awardedId && !isAwarded; // 확정 후 비확정 업체는 연락처 잠금
    var top = topBid().id === b.id;

    var cta;
    if (isAwarded) cta = '<div class="cqd-cta done">✓ 이 업체로 판매 확정됨</div>';
    else if (DATA.awardedId) cta = '<div class="cqd-cta done">다른 업체로 판매가 확정되었습니다</div>';
    else cta = '<button type="button" class="cqd-cta primary" data-cqd-award="' + b.id + '">이 견적으로 판매하기</button>';

    var contact = (isAwarded || !DATA.awardedId)
      ? (isAwarded
          ? '<dl class="cqd-rows cqd-contact"><div><dt>주소</dt><dd>' + esc(b.address) + '</dd></div>' +
            '<div><dt>영업시간</dt><dd>' + esc(b.hours) + '</dd></div>' +
            '<div><dt>거래방식</dt><dd>' + esc(b.method) + '</dd></div></dl>'
          : '<p class="cqd-locked">🔒 업체 연락처·주소는 <b>판매 확정 후</b> 공개됩니다.</p>')
      : '<p class="cqd-locked">🔒 확정된 업체가 아니어서 상세 정보가 비공개입니다.</p>';

    return '<div class="cqd-screen">' +
      '<div class="cqd-shop">' +
        '<div class="cqd-shop-avatar">' + esc(b.logo) + '</div>' +
        '<p class="cqd-shop-name">' + esc(b.name) + '</p>' +
        '<p class="cqd-shop-rating">' + stars(b.rating) + ' <b>' + b.rating.toFixed(1) + '</b> · 후기 ' + b.reviews.toLocaleString('ko-KR') + ' · 거래 ' + b.deals.toLocaleString('ko-KR') + '건</p>' +
        '<div class="cqd-shop-trust">' +
          '<div><b>정품 보장</b><small>100% 정품</small></div>' +
          '<div><b>전문 감정</b><small>감정사 검수</small></div>' +
          '<div><b>안전 결제</b><small>거래 보장</small></div>' +
        '</div>' +
      '</div>' +
      '<div class="cqd-offer">' +
        '<p class="cqd-offer-label">제안 견적' + (top ? ' <span class="cqd-flag top">최고가</span>' : '') + '</p>' +
        '<p class="cqd-offer-amt">' + Number(b.amount).toLocaleString('ko-KR') + '<span>원</span></p>' +
        '<dl class="cqd-rows">' +
          '<div><dt>모델</dt><dd>' + esc(DATA.watch.brand + ' ' + DATA.watch.model) + '</dd></div>' +
          '<div><dt>구성</dt><dd>' + esc(DATA.watch.parts) + '</dd></div>' +
          '<div><dt>감정 방식</dt><dd>' + esc(b.appraisal) + '</dd></div>' +
          '<div><dt>입금 예정</dt><dd>' + esc(b.pay) + '</dd></div>' +
          '<div><dt>업체 메모</dt><dd>' + esc(b.msg) + '</dd></div>' +
        '</dl>' +
        contact +
        cta +
        '<button type="button" class="cqd-cta ghost" data-cqd-back>‹ 다른 견적 비교하기</button>' +
        '<p class="cqd-offer-foot">개인정보와 거래 내역은 안전하게 보호됩니다.</p>' +
      '</div>' +
    '</div>';
  };

  /* --- 업체: 등록된 시계 목록 --- */
  SCREENS['v-watches'] = function () {
    titleEl.textContent = '들어온 비교견적';
    var w = DATA.watch;
    var me = bidById(DATA.myVendorId);
    return '<div class="cqd-screen">' +
      '<div class="cqd-subtabs">' +
        '<button type="button" class="is-on" data-cqd-go="v-watches">입찰 요청</button>' +
        '<button type="button" data-cqd-go="v-manage">내 업체 관리</button>' +
      '</div>' +
      '<p class="cqd-note">승인된 업체에게만 보이는 화면입니다. 진행중인 견적에 제안가를 입력하세요.</p>' +
      '<button type="button" class="cqd-vrow" data-cqd-go="v-bid" data-cqd-id="' + w.ref + '">' +
        '<span class="cqd-avatar lite">⌚</span>' +
        '<span class="cqd-vrow-main">' +
          '<span class="cqd-vrow-name">' + esc(w.brand + ' ' + w.model) + '</span>' +
          '<span class="cqd-vrow-sub"><em>Ref. ' + esc(w.ref) + ' · ' + esc(w.parts) + '</em></span>' +
        '</span>' +
        '<span class="cqd-vrow-amt">' + (me ? '내 입찰 ' + man(me.amount) + '원' : '입찰하기') + '<small>›</small></span>' +
      '</button>' +
    '</div>';
  };

  /* --- 업체: 입찰 입력 --- */
  SCREENS['v-bid'] = function () {
    titleEl.textContent = '제안가 입력';
    var w = DATA.watch;
    var me = bidById(DATA.myVendorId);
    return '<div class="cqd-screen">' +
      '<div class="cqd-watchcard slim">' +
        '<div class="cqd-watchcard-head">' +
          '<img src="' + esc(w.img) + '" alt="" onerror="this.style.visibility=\'hidden\'">' +
          '<div><p class="cqd-wc-brand">' + esc(w.brand) + '</p>' +
          '<p class="cqd-wc-model">' + esc(w.model) + '</p>' +
          '<p class="cqd-wc-ref">Ref. ' + esc(w.ref) + ' · ' + esc(w.parts) + '</p></div>' +
        '</div>' +
        '<div class="cqd-pricerange"><span>시세 참고</span><b>' + man(w.low) + ' ~ ' + man(w.high) + '원</b></div>' +
      '</div>' +
      '<div class="cqd-form">' +
        '<label>제안 금액 (원)</label>' +
        '<input type="tel" id="cqdBidAmt" value="' + (me ? me.amount : '') + '" placeholder="예: 21000000">' +
        '<label>고객에게 전할 메모</label>' +
        '<textarea id="cqdBidMsg" rows="3" placeholder="당일 현금 지급 가능합니다.">' + esc(me ? me.msg : '') + '</textarea>' +
        '<button type="button" class="cqd-cta primary" data-cqd-bidsave>입찰 등록하기</button>' +
        '<button type="button" class="cqd-cta ghost" data-cqd-back>‹ 취소</button>' +
      '</div>' +
    '</div>';
  };

  /* --- 업체: 내 업체 관리 (평점·소식) --- */
  SCREENS['v-manage'] = function () {
    titleEl.textContent = '내 업체 관리';
    var me = bidById(DATA.myVendorId);
    var news = (me.news || []).map(function (n) {
      return '<li class="cqd-newsitem"><span class="cqd-newsdot"></span>' + esc(n) + '</li>';
    }).join('') || '<li class="cqd-empty2">등록된 소식이 없습니다.</li>';
    return '<div class="cqd-screen">' +
      '<div class="cqd-subtabs">' +
        '<button type="button" data-cqd-go="v-watches">입찰 요청</button>' +
        '<button type="button" class="is-on" data-cqd-go="v-manage">내 업체 관리</button>' +
      '</div>' +
      '<div class="cqd-shop">' +
        '<div class="cqd-shop-avatar">' + esc(me.logo) + '</div>' +
        '<p class="cqd-shop-name">' + esc(me.name) + '</p>' +
        '<p class="cqd-shop-rating">' + stars(me.rating) + ' <b>' + me.rating.toFixed(1) + '</b> · 후기 ' + me.reviews.toLocaleString('ko-KR') + ' · 거래 ' + me.deals.toLocaleString('ko-KR') + '건</p>' +
        '<p class="cqd-mini">평점은 고객 후기로 자동 집계됩니다.</p>' +
      '</div>' +
      '<div class="cqd-form">' +
        '<label>업체 소식 등록</label>' +
        '<input type="text" id="cqdNewsTitle" placeholder="예: 이번 주 롤렉스 고가 매입 이벤트">' +
        '<button type="button" class="cqd-cta primary" data-cqd-newssave>소식 올리기</button>' +
      '</div>' +
      '<p class="cqd-block-label">등록된 소식</p>' +
      '<ul class="cqd-news">' + news + '</ul>' +
    '</div>';
  };

  /* --- 관리자: 대시보드 --- */
  SCREENS['a-dash'] = function () {
    titleEl.textContent = '관리자 · 비교견적';
    var bids = sortedBids();
    var rows = '<button type="button" class="cqd-vrow" data-cqd-go="a-quote" data-cqd-id="' + DATA.watch.ref + '">' +
      '<span class="cqd-avatar lite">⌚</span>' +
      '<span class="cqd-vrow-main">' +
        '<span class="cqd-vrow-name">' + esc(DATA.watch.brand + ' ' + DATA.watch.model) + '</span>' +
        '<span class="cqd-vrow-sub"><em>입찰 ' + DATA.bids.length + '곳 · 확인 ' + viewedCount() + '곳' +
          (DATA.awardedId ? ' · 채택완료' : ' · 진행중') + '</em></span>' +
      '</span>' +
      '<span class="cqd-vrow-amt">' + man(topBid().amount) + '원<small>›</small></span>' +
    '</button>';
    return '<div class="cqd-screen">' +
      '<div class="cqd-subtabs">' +
        '<button type="button" class="is-on" data-cqd-go="a-dash">견적 현황</button>' +
        '<button type="button" data-cqd-go="a-vendors">업체 평점</button>' +
      '</div>' +
      '<div class="cqd-stats">' +
        '<div class="cqd-stat"><b>1</b><span>등록 시계</span></div>' +
        '<div class="cqd-stat"><b>' + DATA.bids.length + '</b><span>총 입찰</span></div>' +
        '<div class="cqd-stat"><b>' + DATA.bids.length + '</b><span>참여 업체</span></div>' +
        '<div class="cqd-stat wide"><b class="cqd-hi">' + won(topBid().amount) + '</b><span>최고 입찰가 (' + esc(topBid().name) + ')</span></div>' +
      '</div>' +
      '<p class="cqd-block-label">견적 들어온 시계</p>' +
      '<div class="cqd-vlist">' + rows + '</div>' +
    '</div>';
  };

  /* --- 관리자: 견적 상세 (모든 업체 입찰 열람) --- */
  SCREENS['a-quote'] = function () {
    titleEl.textContent = '견적 상세';
    var bids = sortedBids();
    var rows = bids.map(function (b, i) {
      return '<button type="button" class="cqd-vrow" data-cqd-go="a-vendor" data-cqd-id="' + b.id + '">' +
        '<span class="cqd-avatar">' + esc(b.logo) + '</span>' +
        '<span class="cqd-vrow-main">' +
          '<span class="cqd-vrow-name">' + (i + 1) + '. ' + esc(b.name) +
            (DATA.awardedId === b.id ? ' <span class="cqd-flag awd">채택</span>' : (i === 0 ? ' <span class="cqd-flag top">최고가</span>' : '')) + '</span>' +
          '<span class="cqd-vrow-sub"><em>' + stars(b.rating) + ' ' + b.rating.toFixed(1) + ' · ' + (b.viewed ? '확인함' : '미확인') + '</em></span>' +
        '</span>' +
        '<span class="cqd-vrow-amt">' + won(b.amount) + '<small>›</small></span>' +
      '</button>';
    }).join('');
    return '<div class="cqd-screen">' +
      '<div class="cqd-watchcard slim">' +
        '<div class="cqd-watchcard-head">' +
          '<img src="' + esc(DATA.watch.img) + '" alt="" onerror="this.style.visibility=\'hidden\'">' +
          '<div><p class="cqd-wc-brand">' + esc(DATA.watch.brand) + '</p>' +
          '<p class="cqd-wc-model">' + esc(DATA.watch.model) + '</p>' +
          '<p class="cqd-wc-ref">입찰 ' + DATA.bids.length + '곳 · 최고 ' + won(topBid().amount) + '</p></div>' +
        '</div>' +
      '</div>' +
      '<p class="cqd-block-label">전체 업체 입찰 (관리자만 열람)</p>' +
      '<div class="cqd-vlist">' + rows + '</div>' +
    '</div>';
  };

  /* --- 관리자: 업체 평점 목록 --- */
  SCREENS['a-vendors'] = function () {
    titleEl.textContent = '업체 평점 관리';
    var list = DATA.bids.slice().sort(function (a, b) { return b.rating - a.rating; });
    var rows = list.map(function (b) {
      return '<button type="button" class="cqd-vrow" data-cqd-go="a-vendor" data-cqd-id="' + b.id + '">' +
        '<span class="cqd-avatar">' + esc(b.logo) + '</span>' +
        '<span class="cqd-vrow-main">' +
          '<span class="cqd-vrow-name">' + esc(b.name) + '</span>' +
          '<span class="cqd-vrow-sub">' + stars(b.rating) + '<em>' + b.rating.toFixed(1) + ' · 후기 ' + b.reviews.toLocaleString('ko-KR') + ' · 거래 ' + b.deals.toLocaleString('ko-KR') + '건</em></span>' +
        '</span>' +
        '<span class="cqd-vrow-amt"><small>›</small></span>' +
      '</button>';
    }).join('');
    return '<div class="cqd-screen">' +
      '<div class="cqd-subtabs">' +
        '<button type="button" data-cqd-go="a-dash">견적 현황</button>' +
        '<button type="button" class="is-on" data-cqd-go="a-vendors">업체 평점</button>' +
      '</div>' +
      '<p class="cqd-block-label">제휴 업체 (' + DATA.bids.length + ')</p>' +
      '<div class="cqd-vlist">' + rows + '</div>' +
    '</div>';
  };

  /* --- 관리자: 업체 상세 --- */
  SCREENS['a-vendor'] = function (id) {
    var b = bidById(id); if (!b) return '<p>정보 없음</p>';
    titleEl.textContent = '업체 상세';
    var news = (b.news || []).map(function (n) {
      return '<li class="cqd-newsitem"><span class="cqd-newsdot"></span>' + esc(n) + '</li>';
    }).join('') || '<li class="cqd-empty2">등록된 소식이 없습니다.</li>';
    return '<div class="cqd-screen">' +
      '<div class="cqd-shop">' +
        '<div class="cqd-shop-avatar">' + esc(b.logo) + '</div>' +
        '<p class="cqd-shop-name">' + esc(b.name) + '</p>' +
        '<p class="cqd-shop-rating">' + stars(b.rating) + ' <b>' + b.rating.toFixed(1) + '</b> · 후기 ' + b.reviews.toLocaleString('ko-KR') + ' · 거래 ' + b.deals.toLocaleString('ko-KR') + '건</p>' +
      '</div>' +
      '<dl class="cqd-rows cqd-contact">' +
        '<div><dt>주소</dt><dd>' + esc(b.address) + '</dd></div>' +
        '<div><dt>영업시간</dt><dd>' + esc(b.hours) + '</dd></div>' +
        '<div><dt>거래방식</dt><dd>' + esc(b.method) + '</dd></div>' +
        '<div><dt>최근 제안가</dt><dd>' + won(b.amount) + '</dd></div>' +
      '</dl>' +
      '<p class="cqd-block-label">업체 소식</p>' +
      '<ul class="cqd-news">' + news + '</ul>' +
    '</div>';
  };

  /* ===== 열기/닫기 ===== */
  function open(startRole) {
    build();
    role = startRole || 'customer';
    var bs = overlay.querySelectorAll('.cqd-roles button');
    for (var j = 0; j < bs.length; j++) bs[j].classList.toggle('is-on', bs[j].getAttribute('data-role') === role);
    stack = [];
    go(homeScreen(), null, true);
    overlay.hidden = false;
    document.body.style.overflow = 'hidden';
  }
  function close() {
    if (overlay) overlay.hidden = true;
    document.body.style.overflow = '';
  }

  window.CQDemo = { open: open, close: close };

  /* 마이페이지 진입 버튼 위임 */
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-cqd-open]');
    if (t) { e.preventDefault(); open(t.getAttribute('data-cqd-open') || 'customer'); }
  });
})();
