/* 벨로르 비교견적(내시계팔기) 시스템 — 데모 모듈
   고객 / 업체 / 관리자 3개 시점. 로그인 역할에 따라 접근이 제한된다.
   - 고객: 고객 화면만 / 업체: 업체 화면만 / 관리자: 3개 전부(상단 탭으로 전환)
   데모용이라 백엔드에 쓰지 않고 메모리 상의 더미 데이터로 동작한다. */
(function () {
  'use strict';

  var ADMIN_EMAIL = 'bellorekr@gmail.com';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function won(n) { return Number(n).toLocaleString('ko-KR') + '원'; }
  function man(n) { return Math.round(n / 10000).toLocaleString('ko-KR') + '만'; }
  function num(n) { return Number(n).toLocaleString('ko-KR'); }

  /* ===== 더미 데이터 ===== */
  var DATA = {
    vendors: [
      { id: 'v1', name: 'WATCH & CO', logo: 'W', img: '', rating: 4.9, reviews: 1284, deals: 8210, suspended: false,
        address: '서울 강남구 테헤란로 152 7층', hours: '평일 10:00~20:00 · 주말 11:00~18:00',
        method: '당일 현금 / 실시간 계좌이체',
        revList: [
          { u: '김O준', r: 5, t: '설명대로 최고가에 빠르게 정산됐어요. 감정도 꼼꼼합니다.' },
          { u: '이O서', r: 5, t: '응대가 친절하고 입금까지 당일에 끝났습니다.' },
          { u: '박O현', r: 4, t: '전체적으로 만족스러운 거래였습니다.' }
        ],
        news: ['이번 주 롤렉스 스포츠 모델 고가 매입 진행중', '신규 고객 첫 거래 시 정산 수수료 0%'] },
      { id: 'v2', name: 'TIME DEGE', logo: 'T', img: '', rating: 4.8, reviews: 902, deals: 5140, suspended: false,
        address: '서울 종로구 종로 188', hours: '평일 10:30~19:30',
        method: '계좌이체',
        revList: [ { u: '정O우', r: 5, t: '정품 확인 후 바로 입금해주셨어요.' }, { u: '한O은', r: 5, t: '시세보다 좋은 가격에 거래했습니다.' } ],
        news: ['데이저스트 전 모델 매입 강화'] },
      { id: 'v3', name: 'THE HOUR', logo: 'H', img: '', rating: 4.7, reviews: 651, deals: 3320, suspended: false,
        address: '부산 부산진구 서면로 39', hours: '평일 11:00~20:00',
        method: '현금 / 계좌',
        revList: [ { u: '최O라', r: 5, t: '부산에서 방문 매입 가능해서 편했어요.' } ],
        news: [] },
      { id: 'v4', name: 'LUXE MARKET', logo: 'L', img: '', rating: 4.6, reviews: 430, deals: 2110, suspended: false,
        address: '대구 중구 동성로 12', hours: '평일 10:00~19:00',
        method: '계좌이체',
        revList: [ { u: '오O석', r: 4, t: '택배 매입도 잘 진행됐습니다.' } ],
        news: [] },
      { id: 'v5', name: 'HERITAGE SEOUL', logo: 'S', img: '', rating: 4.8, reviews: 1108, deals: 6730, suspended: false,
        address: '서울 중구 을지로 281', hours: '평일 10:00~20:00',
        method: '현금 / 계좌',
        revList: [ { u: '윤O진', r: 5, t: '20년 전통이라더니 응대가 프로페셔널했어요.' }, { u: '강O민', r: 5, t: '정품 보장에 안심하고 거래했습니다.' } ],
        news: ['VIP 고객 전용 픽업 서비스 운영'] }
    ],
    watches: [
      { id: 'w1', brand: 'ROLEX', model: '서브마리너 데이트', ref: '126610LN', parts: '풀세트 (보증서·박스)',
        img: 'assets/images.jpg', status: 'bidding', awardedVendorId: null,
        customer: { id: 'c1', name: '김O준', masked: 'kim***@gmail.com', phone: '010-****-3920', joined: '2024-08-12', grade: 'Gold' },
        bids: [
          { vendorId: 'v1', amount: 21200000, msg: '풀세트 기준 최고가로 모시겠습니다. 당일 현금 지급 가능합니다.', appraisal: '방문 실물 감정', pay: '당일 입금', viewed: true },
          { vendorId: 'v2', amount: 20600000, msg: '정품 확인 후 즉시 입금해드립니다.', appraisal: '실물 감정', pay: '당일 입금', viewed: true },
          { vendorId: 'v3', amount: 20050000, msg: '부산 지역 방문 매입 가능합니다.', appraisal: '실물 감정', pay: '익일 입금', viewed: true },
          { vendorId: 'v4', amount: 19900000, msg: '택배 매입도 가능합니다.', appraisal: '사진 감정 후 실물 확정', pay: '당일 입금', viewed: false },
          { vendorId: 'v5', amount: 19600000, msg: '20년 전통 정품 보장 매장입니다.', appraisal: '방문 실물 감정', pay: '당일 입금', viewed: false }
        ] },
      { id: 'w2', brand: 'OMEGA', model: '스피드마스터 프로페셔널', ref: '310.30.42', parts: '본체 + 보증서',
        img: '', status: 'review', awardedVendorId: null,
        customer: { id: 'c2', name: '이O서', masked: 'lee***@naver.com', phone: '010-****-1188', joined: '2025-01-03', grade: 'Family' },
        bids: [] },
      { id: 'w3', brand: 'CARTIER', model: '탱크 머스트 LM', ref: 'WSTA0041', parts: '풀세트',
        img: '', status: 'waiting', awardedVendorId: null,
        customer: { id: 'c3', name: '박O현', masked: 'park***@gmail.com', phone: '010-****-7765', joined: '2023-11-20', grade: 'VIP' },
        bids: [] }
    ],
    myVendorId: 'v1' // 업체 시점에서 '내 업체'
  };

  /* ===== 헬퍼 ===== */
  function vendorById(id) {
    for (var i = 0; i < DATA.vendors.length; i++) if (DATA.vendors[i].id === id) return DATA.vendors[i];
    return null;
  }
  function watchById(id) {
    for (var i = 0; i < DATA.watches.length; i++) if (DATA.watches[i].id === id) return DATA.watches[i];
    return null;
  }
  function sortedBids(w) {
    return (w.bids || []).slice().sort(function (a, b) { return b.amount - a.amount; });
  }
  function topAmount(w) { var s = sortedBids(w); return s.length ? s[0].amount : 0; }
  function viewedCount(w) { var n = 0; (w.bids || []).forEach(function (b) { if (b.viewed) n++; }); return n; }
  function myBid(w) {
    for (var i = 0; i < (w.bids || []).length; i++) if (w.bids[i].vendorId === DATA.myVendorId) return w.bids[i];
    return null;
  }
  function statusBadge(w) {
    if (w.status === 'review') return '<span class="cqd-badge wait">승인중</span>';
    if (w.status === 'waiting') return '<span class="cqd-badge wait">대기중</span>';
    if (w.status === 'bidding') return '<span class="cqd-badge live">입찰 ' + w.bids.length + '건</span>';
    if (w.status === 'awarded') return '<span class="cqd-badge done">판매확정</span>';
    if (w.status === 'suspended') return '<span class="cqd-badge stop">정지됨</span>';
    return '';
  }
  function stars(r) {
    var full = Math.round(r), s = '';
    for (var i = 1; i <= 5; i++) s += '<span class="cqd-star' + (i <= full ? ' on' : '') + '">★</span>';
    return '<span class="cqd-stars">' + s + '</span>';
  }
  function avatar(v, cls) {
    var inner = v.img ? '<img src="' + esc(v.img) + '" alt="" onerror="this.remove()">' : esc(v.logo);
    return '<span class="' + (cls || 'cqd-avatar') + '">' + inner + '</span>';
  }

  /* ===== 상태 ===== */
  var accountRole = 'customer'; // 로그인 역할(접근 권한)
  var viewRole = 'customer';    // 현재 보는 화면(관리자는 탭으로 전환)
  var stack = [];               // {screen, param}
  var overlay, bodyEl, titleEl, backBtn, rolesEl;

  function detectRole() {
    try {
      var B = window.NWBackend;
      if (B) {
        if (B.isAdmin && B.isAdmin()) return 'admin';
        if (B.isVendor && B.isVendor()) return 'vendor';
      }
    } catch (e) {}
    return 'customer';
  }

  function build() {
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.className = 'cqd-overlay'; overlay.id = 'cqdOverlay'; overlay.hidden = true;
    overlay.innerHTML =
      '<div class="cqd-frame">' +
        '<header class="cqd-bar">' +
          '<button type="button" class="cqd-back" aria-label="뒤로" hidden>‹</button>' +
          '<span class="cqd-title">내시계팔기</span>' +
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
    rolesEl = overlay.querySelector('#cqdRoles');

    overlay.addEventListener('click', onClick);
    var roleBtns = rolesEl.querySelectorAll('button');
    for (var i = 0; i < roleBtns.length; i++) {
      roleBtns[i].addEventListener('click', function () {
        viewRole = this.getAttribute('data-role');
        markRoleTabs();
        stack = [];
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

  function render() {
    var cur = stack[stack.length - 1];
    backBtn.hidden = stack.length <= 1;
    bodyEl.scrollTop = 0;
    bodyEl.innerHTML = SCREENS[cur.screen] ? SCREENS[cur.screen](cur.param) : '<p class="cqd-note">준비중</p>';
  }

  /* ===== 클릭 위임 ===== */
  function onClick(e) {
    if (e.target.closest('.cqd-close')) { close(); return; }
    if (e.target.closest('.cqd-back')) { back(); return; }

    var nav = e.target.closest('[data-cqd-go]');
    if (nav) { go(nav.getAttribute('data-cqd-go'), nav.getAttribute('data-cqd-id') || null); return; }

    /* 고객: 견적 선택(확정) */
    var sel = e.target.closest('[data-cqd-award-watch]');
    if (sel) {
      var wid = sel.getAttribute('data-cqd-award-watch');
      var bi = Number(sel.getAttribute('data-cqd-bid'));
      var w = watchById(wid); if (!w) return;
      var bids = sortedBids(w); var bid = bids[bi]; if (!bid) return;
      if (confirm(won(bid.amount) + ' 견적으로 판매를 확정할까요?\n확정 후 해당 업체 정보가 공개되며, 관리자에게 전송됩니다.')) {
        w.awardedVendorId = bid.vendorId; w.status = 'awarded';
        notifyAdmin(w, bid);
        render();
      }
      return;
    }

    /* 업체: 입찰 등록 */
    var bidForm = e.target.closest('[data-cqd-bidsave]');
    if (bidForm) {
      var bw = watchById(bidForm.getAttribute('data-cqd-bidsave')); if (!bw) return;
      var amtEl = overlay.querySelector('#cqdBidAmt');
      var msgEl = overlay.querySelector('#cqdBidMsg');
      var v = Number(String(amtEl && amtEl.value || '').replace(/[^0-9]/g, ''));
      if (!v) { alert('제안 금액을 입력해주세요.'); return; }
      var mine = myBid(bw);
      if (mine) { mine.amount = v; mine.msg = (msgEl && msgEl.value) || mine.msg; mine.viewed = true; }
      else { bw.bids.push({ vendorId: DATA.myVendorId, amount: v, msg: (msgEl && msgEl.value) || '', appraisal: '실물 감정', pay: '당일 입금', viewed: true }); }
      if (bw.status === 'waiting') bw.status = 'bidding';
      alert('입찰이 등록되었습니다. 고객 화면에 즉시 반영됩니다.');
      back();
      return;
    }

    /* 업체: 내 업체 정보 저장 */
    var vsave = e.target.closest('[data-cqd-vsave]');
    if (vsave) {
      var me = vendorById(DATA.myVendorId);
      var nm = overlay.querySelector('#cqdVName');
      var lg = overlay.querySelector('#cqdVLogo');
      var im = overlay.querySelector('#cqdVImg');
      if (nm && nm.value.trim()) me.name = nm.value.trim();
      if (lg && lg.value.trim()) me.logo = lg.value.trim().charAt(0).toUpperCase();
      if (im) me.img = im.value.trim();
      alert('업체 정보가 저장되었습니다.');
      render();
      return;
    }

    /* 업체: 소식 등록 */
    var newsForm = e.target.closest('[data-cqd-newssave]');
    if (newsForm) {
      var nt = overlay.querySelector('#cqdNewsTitle');
      if (nt && nt.value.trim()) {
        vendorById(DATA.myVendorId).news.unshift(nt.value.trim());
        alert('소식이 등록되었습니다.');
        render();
      } else { alert('소식 내용을 입력해주세요.'); }
      return;
    }

    /* 관리자: 견적 정지/해제 */
    var sq = e.target.closest('[data-cqd-suspendq]');
    if (sq) {
      var sw = watchById(sq.getAttribute('data-cqd-suspendq')); if (!sw) return;
      if (sw.status === 'suspended') { sw.status = sw.bids.length ? 'bidding' : 'waiting'; }
      else if (confirm('이 견적을 정지할까요? 고객/업체 화면에서 진행이 막힙니다.')) { sw.status = 'suspended'; }
      render();
      return;
    }
    /* 관리자: 견적 삭제 */
    var dq = e.target.closest('[data-cqd-delq]');
    if (dq) {
      var did = dq.getAttribute('data-cqd-delq');
      if (confirm('이 견적을 삭제할까요? 되돌릴 수 없습니다.')) {
        DATA.watches = DATA.watches.filter(function (x) { return x.id !== did; });
        go('a-dash', null, true);
      }
      return;
    }
    /* 관리자: 업체 사용정지/해제 */
    var svv = e.target.closest('[data-cqd-suspendv]');
    if (svv) {
      var vv = vendorById(svv.getAttribute('data-cqd-suspendv')); if (!vv) return;
      if (vv.suspended) vv.suspended = false;
      else if (confirm('이 업체를 사용정지할까요? 신규 입찰이 제한됩니다.')) vv.suspended = true;
      render();
      return;
    }
    /* 관리자: 업체 삭제 */
    var dvv = e.target.closest('[data-cqd-delv]');
    if (dvv) {
      var dvid = dvv.getAttribute('data-cqd-delv');
      if (confirm('이 업체를 삭제할까요? 입찰 내역도 함께 제거됩니다.')) {
        DATA.vendors = DATA.vendors.filter(function (x) { return x.id !== dvid; });
        DATA.watches.forEach(function (w2) {
          w2.bids = w2.bids.filter(function (b) { return b.vendorId !== dvid; });
          if (w2.awardedVendorId === dvid) { w2.awardedVendorId = null; w2.status = w2.bids.length ? 'bidding' : 'waiting'; }
        });
        go('a-vendors', null, true);
      }
      return;
    }
  }

  function notifyAdmin(w, bid) {
    /* 데모: 실제 메일 발송은 백엔드(Edge Function)가 필요해 시뮬레이션으로 처리한다. */
    var v = vendorById(bid.vendorId);
    alert('판매 요청이 접수되었습니다.\n관리자(' + ADMIN_EMAIL + ')에게 선택 내역이 전송되었습니다.\n\n시계: ' + w.brand + ' ' + w.model +
      '\n선택 업체: ' + (v ? v.name : '-') + '\n선택 금액: ' + won(bid.amount));
  }

  /* ===== 화면들 ===== */
  var SCREENS = {};
  var NO_TREND = '<div class="cqd-nodata"><b>최근 6개월 시세</b><span>최근 6개월 내 데이터가 없습니다.</span></div>';

  function watchCard(w, slim) {
    return '<div class="cqd-watchcard' + (slim ? ' slim' : '') + '">' +
      '<div class="cqd-watchcard-head">' +
        '<img src="' + esc(w.img || '') + '" alt="" onerror="this.style.visibility=\'hidden\'">' +
        '<div><p class="cqd-wc-brand">' + esc(w.brand) + '</p>' +
        '<p class="cqd-wc-model">' + esc(w.model) + '</p>' +
        '<p class="cqd-wc-ref">Ref. ' + esc(w.ref) + ' · ' + esc(w.parts) + '</p></div>' +
        statusBadge(w) +
      '</div>' +
    '</div>';
  }

  /* --- 고객: 내 시계 목록 --- */
  SCREENS['c-watches'] = function () {
    titleEl.textContent = '내 시계팔기';
    var rows = DATA.watches.map(function (w) {
      var right = w.status === 'bidding' ? '<span class="cqd-vrow-amt">' + man(topAmount(w)) + '원<small>›</small></span>'
        : '<span class="cqd-vrow-amt"><small>›</small></span>';
      return '<button type="button" class="cqd-vrow" data-cqd-go="c-bids" data-cqd-id="' + w.id + '">' +
        '<span class="cqd-avatar lite">⌚</span>' +
        '<span class="cqd-vrow-main">' +
          '<span class="cqd-vrow-name">' + esc(w.brand + ' ' + w.model) + ' ' + statusBadge(w) + '</span>' +
          '<span class="cqd-vrow-sub"><em>Ref. ' + esc(w.ref) + ' · ' + esc(w.parts) + '</em></span>' +
        '</span>' + right +
      '</button>';
    }).join('') || '<p class="cqd-note">등록한 시계가 없습니다.</p>';
    return '<div class="cqd-screen">' +
      '<p class="cqd-note">판매 등록한 내 시계입니다. 시계를 눌러 받은 견적을 확인하세요.</p>' +
      '<div class="cqd-vlist">' + rows + '</div>' +
    '</div>';
  };

  /* --- 고객: 받은 견적(금액만) / 상태 / 확정 업체 --- */
  SCREENS['c-bids'] = function (id) {
    var w = watchById(id); if (!w) return '<p class="cqd-note">정보를 찾을 수 없습니다.</p>';
    titleEl.textContent = '받은 견적';
    var head = watchCard(w) + NO_TREND;

    if (w.status === 'review')
      return '<div class="cqd-screen">' + head + '<p class="cqd-state wait">🕒 관리자 승인 대기중입니다.<br><span>승인 후 업체 입찰이 시작됩니다.</span></p></div>';
    if (w.status === 'suspended')
      return '<div class="cqd-screen">' + head + '<p class="cqd-state stop">⛔ 관리자에 의해 정지된 견적입니다.</p></div>';
    if (w.status === 'waiting')
      return '<div class="cqd-screen">' + head + '<p class="cqd-state wait">🕒 업체 입찰을 기다리는 중입니다.<br><span>입찰이 들어오면 알려드릴게요.</span></p></div>';

    if (w.status === 'awarded') {
      var v = vendorById(w.awardedVendorId);
      var ab = null; (w.bids || []).forEach(function (b) { if (b.vendorId === w.awardedVendorId) ab = b; });
      return '<div class="cqd-screen">' + head + awardedVendorBlock(v, ab) + '</div>';
    }

    /* bidding: 업체 정보 비공개, 금액만 순위로 표시 */
    var bids = sortedBids(w);
    var rows = bids.map(function (b, i) {
      var top = i === 0;
      return '<button type="button" class="cqd-vrow" data-cqd-award-watch="' + w.id + '" data-cqd-bid="' + i + '">' +
        '<span class="cqd-avatar lite">' + (i + 1) + '</span>' +
        '<span class="cqd-vrow-main">' +
          '<span class="cqd-vrow-name">' + (i + 1) + '순위 견적' + (top ? ' <span class="cqd-flag top">최고가</span>' : '') + '</span>' +
          '<span class="cqd-vrow-sub"><em>업체 정보 비공개 · 선택 시 공개</em></span>' +
        '</span>' +
        '<span class="cqd-vrow-amt">' + won(b.amount) + '<small>선택</small></span>' +
      '</button>';
    }).join('');
    return '<div class="cqd-screen">' + head +
      '<div class="cqd-statline">' +
        '<span><b>' + w.bids.length + '</b>건 입찰</span>' +
        '<span>최고 <b class="cqd-hi">' + won(topAmount(w)) + '</b></span>' +
      '</div>' +
      '<p class="cqd-note">업체명·정보는 공개되지 않습니다. <b>금액만 비교</b>해 선택하세요. 선택한 업체만 정보가 공개됩니다.</p>' +
      '<div class="cqd-vlist">' + rows + '</div>' +
    '</div>';
  };

  function awardedVendorBlock(v, ab) {
    if (!v) return '<p class="cqd-state stop">확정 업체 정보를 찾을 수 없습니다.</p>';
    var revs = (v.revList || []).map(function (rv) {
      return '<li class="cqd-rev"><div class="cqd-rev-top"><b>' + esc(rv.u) + '</b>' + stars(rv.r) + '</div><p>' + esc(rv.t) + '</p></li>';
    }).join('') || '<li class="cqd-empty2">후기가 없습니다.</li>';
    return '<p class="cqd-state done">✓ 판매가 확정되었습니다. 확정한 업체만 정보가 공개됩니다.</p>' +
      '<div class="cqd-shop">' +
        '<div class="cqd-shop-avatar">' + (v.img ? '<img src="' + esc(v.img) + '" alt="" onerror="this.remove()">' : esc(v.logo)) + '</div>' +
        '<p class="cqd-shop-name">' + esc(v.name) + '</p>' +
        '<p class="cqd-shop-rating">' + stars(v.rating) + ' <b>' + v.rating.toFixed(1) + '</b> · 후기 ' + num(v.reviews) + ' · 거래 ' + num(v.deals) + '건</p>' +
        '<div class="cqd-shop-trust">' +
          '<div><b>정품 보장</b><small>100% 정품</small></div>' +
          '<div><b>전문 감정</b><small>감정사 검수</small></div>' +
          '<div><b>안전 거래</b><small>벨로르 보증</small></div>' +
        '</div>' +
      '</div>' +
      '<div class="cqd-offer">' +
        '<p class="cqd-offer-label">확정 견적</p>' +
        '<p class="cqd-offer-amt">' + num(ab ? ab.amount : 0) + '<span>원</span></p>' +
        '<dl class="cqd-rows">' +
          '<div><dt>감정 방식</dt><dd>' + esc(ab ? ab.appraisal : '-') + '</dd></div>' +
          '<div><dt>입금 예정</dt><dd>' + esc(ab ? ab.pay : '-') + '</dd></div>' +
          '<div><dt>업체 메모</dt><dd>' + esc(ab ? ab.msg : '-') + '</dd></div>' +
        '</dl>' +
        '<p class="cqd-locked">🔒 업체 연락처·주소는 공개되지 않습니다. 모든 거래는 <b>벨로르를 통해</b> 안전하게 진행됩니다.</p>' +
      '</div>' +
      '<p class="cqd-block-label">' + esc(v.name) + ' 후기</p>' +
      '<ul class="cqd-news">' + revs + '</ul>';
  }

  /* --- 업체: 들어온 비교견적 --- */
  SCREENS['v-watches'] = function () {
    titleEl.textContent = '들어온 비교견적';
    var list = DATA.watches.filter(function (w) { return w.status === 'waiting' || w.status === 'bidding'; });
    var rows = list.map(function (w) {
      var mine = myBid(w);
      return '<button type="button" class="cqd-vrow" data-cqd-go="v-bid" data-cqd-id="' + w.id + '">' +
        '<span class="cqd-avatar lite">⌚</span>' +
        '<span class="cqd-vrow-main">' +
          '<span class="cqd-vrow-name">' + esc(w.brand + ' ' + w.model) + '</span>' +
          '<span class="cqd-vrow-sub"><em>Ref. ' + esc(w.ref) + ' · ' + esc(w.parts) + '</em></span>' +
        '</span>' +
        '<span class="cqd-vrow-amt">' + (mine ? '내 입찰 ' + man(mine.amount) + '원' : '입찰하기') + '<small>›</small></span>' +
      '</button>';
    }).join('') || '<p class="cqd-note">현재 입찰 가능한 견적이 없습니다.</p>';
    return '<div class="cqd-screen">' +
      vendorSubtabs('v-watches') +
      '<p class="cqd-note">승인된 업체에게만 보이는 화면입니다. 진행중인 견적에 제안가를 입력하세요.</p>' +
      '<div class="cqd-vlist">' + rows + '</div>' +
    '</div>';
  };

  function vendorSubtabs(cur) {
    return '<div class="cqd-subtabs">' +
      '<button type="button" class="' + (cur === 'v-watches' ? 'is-on' : '') + '" data-cqd-go="v-watches">입찰 요청</button>' +
      '<button type="button" class="' + (cur === 'v-manage' ? 'is-on' : '') + '" data-cqd-go="v-manage">내 업체 관리</button>' +
    '</div>';
  }

  /* --- 업체: 입찰 입력 --- */
  SCREENS['v-bid'] = function (id) {
    var w = watchById(id); if (!w) return '<p class="cqd-note">정보 없음</p>';
    titleEl.textContent = '제안가 입력';
    var mine = myBid(w);
    return '<div class="cqd-screen">' +
      watchCard(w, true) + NO_TREND +
      '<div class="cqd-form">' +
        '<label>제안 금액 (원)</label>' +
        '<input type="tel" id="cqdBidAmt" value="' + (mine ? mine.amount : '') + '" placeholder="예: 21000000">' +
        '<label>고객에게 전할 메모</label>' +
        '<textarea id="cqdBidMsg" rows="3" placeholder="당일 현금 지급 가능합니다.">' + esc(mine ? mine.msg : '') + '</textarea>' +
        '<button type="button" class="cqd-cta primary" data-cqd-bidsave="' + w.id + '">입찰 등록하기</button>' +
        '<button type="button" class="cqd-cta ghost" data-cqd-go="v-watches">‹ 취소</button>' +
      '</div>' +
    '</div>';
  };

  /* --- 업체: 내 업체 관리 (이미지·이름·후기·소식) --- */
  SCREENS['v-manage'] = function () {
    titleEl.textContent = '내 업체 관리';
    var me = vendorById(DATA.myVendorId);
    var revs = (me.revList || []).map(function (rv) {
      return '<li class="cqd-rev"><div class="cqd-rev-top"><b>' + esc(rv.u) + '</b>' + stars(rv.r) + '</div><p>' + esc(rv.t) + '</p></li>';
    }).join('') || '<li class="cqd-empty2">받은 후기가 없습니다.</li>';
    var news = (me.news || []).map(function (n) {
      return '<li class="cqd-newsitem"><span class="cqd-newsdot"></span>' + esc(n) + '</li>';
    }).join('') || '<li class="cqd-empty2">등록된 소식이 없습니다.</li>';
    return '<div class="cqd-screen">' +
      vendorSubtabs('v-manage') +
      '<div class="cqd-shop">' +
        '<div class="cqd-shop-avatar">' + (me.img ? '<img src="' + esc(me.img) + '" alt="" onerror="this.remove()">' : esc(me.logo)) + '</div>' +
        '<p class="cqd-shop-name">' + esc(me.name) + '</p>' +
        '<p class="cqd-shop-rating">' + stars(me.rating) + ' <b>' + me.rating.toFixed(1) + '</b> · 후기 ' + num(me.reviews) + ' · 거래 ' + num(me.deals) + '건</p>' +
        '<p class="cqd-mini">평점은 고객 후기로 자동 집계됩니다.</p>' +
      '</div>' +
      '<div class="cqd-form">' +
        '<label>업체명</label>' +
        '<input type="text" id="cqdVName" value="' + esc(me.name) + '" placeholder="업체명">' +
        '<label>로고 글자 (이미지 없을 때 표시)</label>' +
        '<input type="text" id="cqdVLogo" value="' + esc(me.logo) + '" maxlength="2" placeholder="예: W">' +
        '<label>업체 이미지 주소 (URL)</label>' +
        '<input type="text" id="cqdVImg" value="' + esc(me.img) + '" placeholder="https://...  (비우면 로고 글자 사용)">' +
        '<button type="button" class="cqd-cta primary" data-cqd-vsave>업체 정보 저장</button>' +
      '</div>' +
      '<p class="cqd-block-label">받은 후기 (' + (me.revList || []).length + ')</p>' +
      '<ul class="cqd-news">' + revs + '</ul>' +
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
  function adminSubtabs(cur) {
    return '<div class="cqd-subtabs">' +
      '<button type="button" class="' + (cur === 'quotes' ? 'is-on' : '') + '" data-cqd-go="a-dash">견적 현황</button>' +
      '<button type="button" class="' + (cur === 'vendors' ? 'is-on' : '') + '" data-cqd-go="a-vendors">업체 관리</button>' +
      '<button type="button" class="' + (cur === 'customers' ? 'is-on' : '') + '" data-cqd-go="a-customers">고객 관리</button>' +
    '</div>';
  }

  SCREENS['a-dash'] = function () {
    titleEl.textContent = '관리자 · 비교견적';
    var totalBids = 0, best = 0, bestName = '-';
    DATA.watches.forEach(function (w) {
      totalBids += w.bids.length;
      if (topAmount(w) > best) { best = topAmount(w); bestName = (sortedBids(w)[0] && vendorById(sortedBids(w)[0].vendorId) || {}).name || '-'; }
    });
    var rows = DATA.watches.map(function (w) {
      return '<button type="button" class="cqd-vrow" data-cqd-go="a-quote" data-cqd-id="' + w.id + '">' +
        '<span class="cqd-avatar lite">⌚</span>' +
        '<span class="cqd-vrow-main">' +
          '<span class="cqd-vrow-name">' + esc(w.brand + ' ' + w.model) + ' ' + statusBadge(w) + '</span>' +
          '<span class="cqd-vrow-sub"><em>고객 ' + esc(w.customer.name) + ' · 입찰 ' + w.bids.length + '건 · 확인 ' + viewedCount(w) + '</em></span>' +
        '</span>' +
        '<span class="cqd-vrow-amt">' + (topAmount(w) ? man(topAmount(w)) + '원' : '-') + '<small>›</small></span>' +
      '</button>';
    }).join('') || '<p class="cqd-note">견적이 없습니다.</p>';
    return '<div class="cqd-screen">' + adminSubtabs('quotes') +
      '<div class="cqd-stats">' +
        '<div class="cqd-stat"><b>' + DATA.watches.length + '</b><span>등록 시계</span></div>' +
        '<div class="cqd-stat"><b>' + totalBids + '</b><span>총 입찰</span></div>' +
        '<div class="cqd-stat"><b>' + DATA.vendors.length + '</b><span>제휴 업체</span></div>' +
        '<div class="cqd-stat wide"><b class="cqd-hi">' + won(best) + '</b><span>최고 입찰가 (' + esc(bestName) + ')</span></div>' +
      '</div>' +
      '<p class="cqd-block-label">견적 들어온 시계</p>' +
      '<div class="cqd-vlist">' + rows + '</div>' +
    '</div>';
  };

  /* --- 관리자: 견적 상세 (고객정보 + 전체 입찰 + 정지/삭제) --- */
  SCREENS['a-quote'] = function (id) {
    var w = watchById(id); if (!w) return '<p class="cqd-note">정보 없음</p>';
    titleEl.textContent = '견적 상세';
    var c = w.customer;
    var bids = sortedBids(w);
    var rows = bids.map(function (b, i) {
      var v = vendorById(b.vendorId) || { name: '삭제된 업체', logo: '?', rating: 0 };
      return '<button type="button" class="cqd-vrow" data-cqd-go="a-vendor" data-cqd-id="' + b.vendorId + '">' +
        avatar(v) +
        '<span class="cqd-vrow-main">' +
          '<span class="cqd-vrow-name">' + (i + 1) + '. ' + esc(v.name) +
            (w.awardedVendorId === b.vendorId ? ' <span class="cqd-flag awd">채택</span>' : (i === 0 ? ' <span class="cqd-flag top">최고가</span>' : '')) + '</span>' +
          '<span class="cqd-vrow-sub"><em>' + (b.viewed ? '확인함' : '미확인') + ' · 별점 ' + v.rating.toFixed(1) + '</em></span>' +
        '</span>' +
        '<span class="cqd-vrow-amt">' + won(b.amount) + '<small>›</small></span>' +
      '</button>';
    }).join('') || '<p class="cqd-note">아직 입찰이 없습니다.</p>';
    return '<div class="cqd-screen">' +
      watchCard(w, true) +
      '<div class="cqd-cust">' +
        '<p class="cqd-cust-h">등록 고객 정보</p>' +
        '<dl class="cqd-rows">' +
          '<div><dt>고객</dt><dd>' + esc(c.name) + ' (' + esc(c.grade) + ')</dd></div>' +
          '<div><dt>계정</dt><dd>' + esc(c.masked) + '</dd></div>' +
          '<div><dt>연락처</dt><dd>' + esc(c.phone) + '</dd></div>' +
          '<div><dt>가입일</dt><dd>' + esc(c.joined) + '</dd></div>' +
        '</dl>' +
      '</div>' +
      '<div class="cqd-actions">' +
        '<button type="button" class="cqd-actbtn stop" data-cqd-suspendq="' + w.id + '">' + (w.status === 'suspended' ? '견적 정지 해제' : '견적 정지') + '</button>' +
        '<button type="button" class="cqd-actbtn warn" data-cqd-delq="' + w.id + '">견적 삭제</button>' +
      '</div>' +
      '<p class="cqd-block-label">전체 업체 입찰 (관리자만 열람)</p>' +
      '<div class="cqd-vlist">' + rows + '</div>' +
    '</div>';
  };

  /* --- 관리자: 업체 목록 --- */
  SCREENS['a-vendors'] = function () {
    titleEl.textContent = '관리자 · 업체 관리';
    var list = DATA.vendors.slice().sort(function (a, b) { return b.rating - a.rating; });
    var rows = list.map(function (v) {
      return '<button type="button" class="cqd-vrow' + (v.suspended ? ' is-stop' : '') + '" data-cqd-go="a-vendor" data-cqd-id="' + v.id + '">' +
        avatar(v) +
        '<span class="cqd-vrow-main">' +
          '<span class="cqd-vrow-name">' + esc(v.name) + (v.suspended ? ' <span class="cqd-badge stop">정지</span>' : '') + '</span>' +
          '<span class="cqd-vrow-sub">' + stars(v.rating) + '<em>' + v.rating.toFixed(1) + ' · 후기 ' + num(v.reviews) + ' · 거래 ' + num(v.deals) + '건</em></span>' +
        '</span>' +
        '<span class="cqd-vrow-amt"><small>›</small></span>' +
      '</button>';
    }).join('') || '<p class="cqd-note">등록된 업체가 없습니다.</p>';
    return '<div class="cqd-screen">' + adminSubtabs('vendors') +
      '<p class="cqd-block-label">제휴 업체 (' + DATA.vendors.length + ')</p>' +
      '<div class="cqd-vlist">' + rows + '</div>' +
    '</div>';
  };

  /* --- 관리자: 업체 상세 (연락처 + 후기 + 소식 + 정지/삭제) --- */
  SCREENS['a-vendor'] = function (id) {
    var v = vendorById(id); if (!v) return '<p class="cqd-note">정보 없음</p>';
    titleEl.textContent = '업체 상세';
    var revs = (v.revList || []).map(function (rv) {
      return '<li class="cqd-rev"><div class="cqd-rev-top"><b>' + esc(rv.u) + '</b>' + stars(rv.r) + '</div><p>' + esc(rv.t) + '</p></li>';
    }).join('') || '<li class="cqd-empty2">후기가 없습니다.</li>';
    var news = (v.news || []).map(function (n) {
      return '<li class="cqd-newsitem"><span class="cqd-newsdot"></span>' + esc(n) + '</li>';
    }).join('') || '<li class="cqd-empty2">등록된 소식이 없습니다.</li>';
    return '<div class="cqd-screen">' +
      '<div class="cqd-shop">' +
        '<div class="cqd-shop-avatar">' + (v.img ? '<img src="' + esc(v.img) + '" alt="" onerror="this.remove()">' : esc(v.logo)) + '</div>' +
        '<p class="cqd-shop-name">' + esc(v.name) + (v.suspended ? ' <span class="cqd-badge stop">정지</span>' : '') + '</p>' +
        '<p class="cqd-shop-rating">' + stars(v.rating) + ' <b>' + v.rating.toFixed(1) + '</b> · 후기 ' + num(v.reviews) + ' · 거래 ' + num(v.deals) + '건</p>' +
      '</div>' +
      '<dl class="cqd-rows cqd-contact">' +
        '<div><dt>주소</dt><dd>' + esc(v.address) + '</dd></div>' +
        '<div><dt>영업시간</dt><dd>' + esc(v.hours) + '</dd></div>' +
        '<div><dt>거래방식</dt><dd>' + esc(v.method) + '</dd></div>' +
      '</dl>' +
      '<div class="cqd-actions">' +
        '<button type="button" class="cqd-actbtn stop" data-cqd-suspendv="' + v.id + '">' + (v.suspended ? '사용정지 해제' : '사용정지') + '</button>' +
        '<button type="button" class="cqd-actbtn warn" data-cqd-delv="' + v.id + '">업체 삭제</button>' +
      '</div>' +
      '<p class="cqd-block-label">받은 후기 (' + (v.revList || []).length + ')</p>' +
      '<ul class="cqd-news">' + revs + '</ul>' +
      '<p class="cqd-block-label">업체 소식</p>' +
      '<ul class="cqd-news">' + news + '</ul>' +
    '</div>';
  };

  /* --- 관리자: 고객 관리 --- */
  SCREENS['a-customers'] = function () {
    titleEl.textContent = '관리자 · 고객 관리';
    var rows = DATA.watches.map(function (w) {
      var c = w.customer;
      return '<button type="button" class="cqd-vrow" data-cqd-go="a-quote" data-cqd-id="' + w.id + '">' +
        '<span class="cqd-avatar">' + esc(c.name.charAt(0)) + '</span>' +
        '<span class="cqd-vrow-main">' +
          '<span class="cqd-vrow-name">' + esc(c.name) + ' <span class="cqd-flag top">' + esc(c.grade) + '</span></span>' +
          '<span class="cqd-vrow-sub"><em>' + esc(c.masked) + ' · ' + esc(w.brand + ' ' + w.model) + ' ' + (w.status === 'suspended' ? '(정지)' : '') + '</em></span>' +
        '</span>' +
        '<span class="cqd-vrow-amt"><small>›</small></span>' +
      '</button>';
    }).join('') || '<p class="cqd-note">견적을 등록한 고객이 없습니다.</p>';
    return '<div class="cqd-screen">' + adminSubtabs('customers') +
      '<p class="cqd-note">고객을 누르면 견적 상세에서 정보 확인 · 견적 정지/삭제가 가능합니다.</p>' +
      '<div class="cqd-vlist">' + rows + '</div>' +
    '</div>';
  };

  /* ===== 열기/닫기 ===== */
  function open() {
    build();
    accountRole = detectRole();
    if (accountRole === 'admin') { rolesEl.hidden = false; viewRole = 'admin'; }
    else { rolesEl.hidden = true; viewRole = accountRole; }
    markRoleTabs();
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
    if (t) { e.preventDefault(); open(); }
  });
})();
