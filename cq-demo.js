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
  /* 사진 없을 때 쓰는 깔끔한 라인 아이콘(이모지 대신) */
  var ICON_WATCH = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<circle cx="12" cy="12" r="6"></circle><path d="M12 9v3l2 1.5"></path>' +
    '<path d="M9 5.2 9.5 2h5L15 5.2M9 18.8 9.5 22h5l.5-3.2"></path></svg>';
  var ICON_CHAT = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 9 9 0 0 1-3.8-.8L3 21l1.9-4.7A8.38 8.38 0 0 1 4 11.5 8.5 8.5 0 0 1 12.5 3 8.38 8.38 0 0 1 21 11.5z"></path></svg>';
  var ICON_SHARE = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle>' +
    '<path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"></path></svg>';
  var ICON_MAIL = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<rect x="3" y="5" width="18" height="14" rx="2"></rect><path d="m3 7 9 6 9-6"></path></svg>';
  var ICON_LINK = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"></path><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"></path></svg>';
  var ICON_SEND = '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M3.4 20.4 21 12 3.4 3.6 3 10l12 2-12 2z"></path></svg>';
  function svg24(p, sw) { return '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="' + (sw || 1.8) + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>'; }
  var ICON_SHIELD = svg24('<path d="M12 3l7 3v5c0 4.5-3 7.3-7 9-4-1.7-7-4.5-7-9V6z"></path>');
  var ICON_SEARCH = svg24('<circle cx="11" cy="11" r="6"></circle><path d="m20 20-3.2-3.2"></path>');
  var ICON_LOCK = svg24('<rect x="5" y="11" width="14" height="9" rx="2"></rect><path d="M8 11V8a4 4 0 0 1 8 0v3"></path>');
  var ICON_STORE = svg24('<path d="M4 9h16l-1-4H5zM5 9v10h14V9M9 19v-5h6v5"></path>');
  var ICON_CHECK = svg24('<path d="M5 12.5 10 17l9-10"></path>', 2.2);

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

  /* 신규 등록 폼에서 선택한 사진(File) 임시 보관 + 입력값(견적 미리보기용) */
  var newPhotos = [];     // 새로 추가한 File 목록
  var editPhotos = [];    // (수정 모드) 기존 사진 URL 목록
  var editId = null;      // (수정 모드) 대상 견적 id
  var newData = {};
  var vendLogoFile = null; // 업체 대표 이미지(직접 첨부한 File)
  var PART_OPTS = ['보증서', '정품 박스', '설명서/책자', '추가 링크', '정품 택', '구매 영수증'];
  var GRADE_OPTS = ['S등급 (미착용/신품급)', 'A등급 (사용감 적음)', 'B등급 (일반 사용감)', 'C등급 (사용감 많음)'];

  /* ===== 데이터 캐시 (구독으로 채움) ===== */
  var cust = { watches: [], loaded: false };
  var vend = { quotes: [], loaded: false };
  var adm = { pending: [], open: [], suspended: [], vendors: [], accounts: [], loaded: false };
  var reviews = [];
  var awardedVendorCache = {}; // quoteId → {company_name,...}
  var subs = [];

  /* 고객센터 채팅 상태 */
  var chat = { threadUser: null, messages: [], loaded: false, refQuote: null, draft: '' };
  var chatSub = null;
  var admChats = { threads: [], loaded: false };
  function openChat(threadUser, refQuote) {
    closeChat();
    chat = { threadUser: threadUser || myUid(), messages: [], loaded: false, refQuote: refQuote || null, draft: '' };
    if (B && B.subscribeSupportThread)
      chatSub = B.subscribeSupportThread(chat.threadUser, function (m) { chat.messages = m || []; chat.loaded = true; renderIfOpen(); });
  }
  function closeChat() { if (chatSub) { try { chatSub(); } catch (e) {} chatSub = null; } }

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
      if (B.subscribeSuspended) subs.push(B.subscribeSuspended(function (r) { adm.suspended = r || []; renderIfOpen(); }));
      if (B.subscribeVendors) subs.push(B.subscribeVendors(function (r) { adm.vendors = r || []; renderIfOpen(); }));
      if (B.subscribeAccounts) subs.push(B.subscribeAccounts(function (r) { adm.accounts = r || []; renderIfOpen(); }));
      if (B.subscribeSupportThreads) subs.push(B.subscribeSupportThreads(function (r) { admChats.threads = r || []; admChats.loaded = true; renderIfOpen(); }));
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
          '<span class="cqd-title">시계판매</span>' +
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
    overlay.addEventListener('input', onInput);
    overlay.addEventListener('keydown', onKey);
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
    var isChat = (cur.screen === 'c-chat' || cur.screen === 'a-chat');
    if (!isChat) closeChat();
    bodyEl.scrollTop = 0;
    bodyEl.innerHTML = SCREENS[cur.screen] ? SCREENS[cur.screen](cur.param) : '<p class="cqd-note">준비중</p>';
    if (cur.screen === 'c-new' || cur.screen === 'c-edit') wireCqBrand();
    if (isChat) afterChatRender();
  }
  function afterChatRender() {
    var inp = overlay.querySelector('#cqChatInput');
    if (inp) { inp.value = chat.draft || ''; }
    var sc = overlay.querySelector('#cqChatScroll');
    if (sc) sc.scrollTop = sc.scrollHeight;
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
  /* 예상견적 시세 차트(시안 2) — 그린 라인 + 도트 + y축 (디자인용) */
  function estimateChart() {
    var pts = '10,26 58,38 106,30 154,50 202,44 250,66 300,60';
    var arr = pts.split(' ');
    var dots = '';
    for (var i = 0; i < arr.length; i++) {
      var xy = arr[i].split(',');
      dots += '<circle cx="' + xy[0] + '" cy="' + xy[1] + '" r="3.4"></circle>';
    }
    return '<svg class="cqe-chart" viewBox="0 0 320 96" preserveAspectRatio="none" aria-hidden="true">' +
      '<defs><linearGradient id="cqeFill" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0" stop-color="#1f7a4d" stop-opacity=".18"></stop>' +
        '<stop offset="1" stop-color="#1f7a4d" stop-opacity="0"></stop>' +
      '</linearGradient></defs>' +
      '<polygon class="cqe-chart-area" points="10,26 58,38 106,30 154,50 202,44 250,66 300,60 300,96 10,96"></polygon>' +
      '<polyline class="cqe-chart-line" points="' + pts + '"></polyline>' +
      '<g class="cqe-chart-dots">' + dots + '</g>' +
    '</svg>';
  }
  function priceTrendCard() {
    // '예상 견적' 화면과 동일한 그린 차트로 통일(겹치는 워터마크 제거)
    return '<div class="cqe-card cqe-chart-card cqd-trend">' +
      '<div class="cqe-chart-head"><b>최근 시세 추이</b><span class="cqd-badge wait">데이터 준비중</span></div>' +
      estimateChart() +
      '<div class="cqe-chart-x"><span>1월</span><span>2월</span><span>3월</span><span>4월</span><span>5월</span><span>6월</span></div>' +
      '<p class="cqe-chart-note">※ 시세 데이터가 쌓이면 실제 그래프로 표시됩니다.</p>' +
    '</div>';
  }

  /* ===== 이메일(관리자 통지) ===== */
  function emailAdmin(q, bid, vName) {
    try {
      var payload = {
        _subject: '[벨로르] 시계판매 업체 선택 알림',
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

  /* ===== 카운트다운 / 조회수 (비교견적 페이지) ===== */
  var cdTimer = null;
  var viewedQuotes = {}; // 세션 내 중복 조회수 증가 방지

  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function cdLabel(ms) {
    if (ms <= 0) return '비교견적이 마감되었습니다';
    var s = Math.floor(ms / 1000);
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
    return h + '시간 ' + pad2(m) + '분 ' + pad2(ss) + '초 남음';
  }
  function tickCountdowns() {
    if (!overlay || overlay.hidden) return;
    var els = overlay.querySelectorAll('[data-exp]');
    var now = Date.now();
    for (var i = 0; i < els.length; i++) {
      var rem = Number(els[i].getAttribute('data-exp')) - now;
      els[i].textContent = cdLabel(rem);
      if (rem <= 0) els[i].classList.add('is-over');
    }
  }
  function startCdTimer() { if (!cdTimer) cdTimer = setInterval(tickCountdowns, 1000); }
  function stopCdTimer() { if (cdTimer) { clearInterval(cdTimer); cdTimer = null; } }

  // 자동 조회수: 10분당 5명, 최초 2시간(최대 60명)까지 자동 증가. 이후·중간 실제 조회수는 합산.
  function autoViews(createdMs) {
    var min = (Date.now() - (createdMs || Date.now())) / 60000;
    if (min < 0) min = 0;
    return Math.min(Math.floor(min / 10) * 5, 60);
  }
  function totalViews(q) { return autoViews(q.createdAtMs) + (q.viewCount || 0); }

  function gradeText(q) { return q.grade || '실물 감정 후 산정'; }
  function partsText(q) { return q.parts || '미입력'; }
  function modelLine(q) {
    var t = ((q.brand || '') + ' ' + (q.model || '')).trim();
    return t || '시계';
  }

  /* ===== 공유하기 (Web Share + 폴백 시트) ===== */
  var shareCtx = null;
  function shareText(q) {
    var t = q ? ((brandDisplay(q) || '') + ' ' + (q.model || '')).trim() : '벨로르 명품시계';
    return t + ' — 벨로르에서 여러 업체 비교견적으로 안전하게 거래하세요.';
  }
  function shareUrl() { try { return location.origin + location.pathname; } catch (e) { return 'https://bellore.kr'; } }
  function cqShare(q) {
    shareCtx = { title: '벨로르 비교견적', text: shareText(q), url: shareUrl() };
    if (navigator.share) {
      navigator.share(shareCtx).catch(function () { openShareSheet(); });
    } else { openShareSheet(); }
  }
  function openShareSheet() {
    closeShareSheet();
    var el = document.createElement('div');
    el.className = 'cq-share-wrap'; el.id = 'cqShareWrap';
    el.innerHTML =
      '<div class="cq-share-mask" id="cqShareMask"></div>' +
      '<div class="cq-share-sheet" role="dialog" aria-label="공유하기">' +
        '<div class="cq-share-head"><b>공유하기</b><button type="button" id="cqShareClose" aria-label="닫기">×</button></div>' +
        '<p class="cq-share-pre">' + esc(shareCtx.text) + '</p>' +
        '<div class="cq-share-grid">' +
          '<button type="button" class="cq-share-opt kakao" data-cqd-shareact="kakao"><span>K</span>카카오톡</button>' +
          '<button type="button" class="cq-share-opt mail" data-cqd-shareact="mail">' + ICON_MAIL + '이메일</button>' +
          '<button type="button" class="cq-share-opt link" data-cqd-shareact="copy">' + ICON_LINK + '링크 복사</button>' +
          '<button type="button" class="cq-share-opt sms" data-cqd-shareact="sms">' + ICON_CHAT + '문자</button>' +
        '</div>' +
      '</div>';
    overlay.appendChild(el);
    requestAnimationFrame(function () { el.classList.add('on'); });
  }
  function closeShareSheet() {
    var el = overlay && overlay.querySelector('#cqShareWrap');
    if (el) el.parentNode.removeChild(el);
  }
  function shareAct(kind) {
    if (!shareCtx) return;
    var u = shareCtx.url, t = shareCtx.text;
    if (kind === 'copy') {
      var done = function () { alert('링크를 복사했습니다.'); closeShareSheet(); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(u + '\n' + t).then(done, done);
      else { try { var ta = document.createElement('textarea'); ta.value = u + '\n' + t; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); } catch (e) {} done(); }
      return;
    }
    if (kind === 'mail') { window.location.href = 'mailto:?subject=' + encodeURIComponent(shareCtx.title) + '&body=' + encodeURIComponent(t + '\n\n' + u); closeShareSheet(); return; }
    if (kind === 'sms') { window.location.href = 'sms:?body=' + encodeURIComponent(t + ' ' + u); closeShareSheet(); return; }
    if (kind === 'kakao') {
      if (window.Kakao && window.Kakao.Share) {
        try { window.Kakao.Share.sendDefault({ objectType: 'text', text: t + '\n' + u, link: { mobileWebUrl: u, webUrl: u } }); closeShareSheet(); return; } catch (e) {}
      }
      window.open('https://accounts.kakao.com/weblogin/sharer.html?url=' + encodeURIComponent(u), '_blank');
      closeShareSheet();
      return;
    }
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

  /* 목록 썸네일 — 실제 등록 사진(없으면 ⌚) */
  function photoOf(q) { return (q.photos && q.photos[0]) || ''; }
  function rowThumb(q) {
    var p = photoOf(q);
    return p
      ? '<span class="cqd-thumb"><img src="' + esc(p) + '" alt="" onerror="this.remove();this.parentNode.classList.add(\'ph\')">' + ICON_WATCH + '</span>'
      : '<span class="cqd-thumb ph">' + ICON_WATCH + '</span>';
  }

  /* 브랜드 영문 표기(시안의 ROLEX 처럼) — brands.js slug 기준 */
  var BRAND_EN = {
    rolex: 'ROLEX', patek: 'PATEK PHILIPPE', ap: 'AUDEMARS PIGUET', vacheron: 'VACHERON CONSTANTIN',
    cartier: 'CARTIER', omega: 'OMEGA', hublot: 'HUBLOT', tagheuer: 'TAG HEUER', iwc: 'IWC',
    breitling: 'BREITLING', panerai: 'PANERAI', tudor: 'TUDOR', gucci: 'GUCCI', chanel: 'CHANEL',
    franckmuller: 'FRANCK MULLER', richardmille: 'RICHARD MILLE', jaegerlecoultre: 'JAEGER-LECOULTRE',
    rogerdubuis: 'ROGER DUBUIS', breguet: 'BREGUET', blancpain: 'BLANCPAIN', alange: 'A. LANGE & SÖHNE',
    piaget: 'PIAGET', hermes: 'HERMÈS', bulgari: 'BVLGARI', longines: 'LONGINES', rado: 'RADO',
    mido: 'MIDO', oris: 'ORIS', seiko: 'SEIKO', tissot: 'TISSOT', hamilton: 'HAMILTON', frederique: 'FREDERIQUE CONSTANT'
  };
  function brandDisplay(q) {
    var b = window.BELLORE_BRAND_BY_NAME && window.BELLORE_BRAND_BY_NAME(q.brand);
    if (b && BRAND_EN[b.slug]) return BRAND_EN[b.slug];
    return (q.brand || '시계').replace(/\s*\(.*\)\s*/, '').trim() || '시계';
  }
  function gradeShort(q) { return (q.grade || '').replace(/\s*\(.*\)\s*/, '').trim(); }

  /* 시안 공통 — 시계 정보 카드(브랜드/모델/레퍼런스 + 실제 사진) */
  function quoteSpecCard(q, full) {
    var ph = photoOf(q);
    var spec = full
      ? '<dl class="cqs-spec">' +
          '<div><dt>레퍼런스</dt><dd>' + esc(q.ref || '-') + '</dd></div>' +
          '<div><dt>구매일</dt><dd>' + esc(q.year || '-') + '</dd></div>' +
          '<div><dt>상태</dt><dd>' + esc(gradeShort(q) || '-') + '</dd></div>' +
        '</dl>'
      : '';
    return '<div class="cqs-card">' +
      '<div class="cqs-top">' +
        '<div class="cqs-txt">' +
          '<p class="cqs-brand">' + esc(brandDisplay(q)) + '</p>' +
          '<p class="cqs-model">' + esc(q.model || '') + '</p>' +
          (q.ref ? '<p class="cqs-ref">' + esc(q.ref) + '</p>' : '') +
        '</div>' +
        (ph ? '<img class="cqs-photo" src="' + esc(ph) + '" alt="" onerror="this.style.visibility=\'hidden\'">' : '<div class="cqs-photo ph">' + ICON_WATCH + '</div>') +
      '</div>' + spec +
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
      var chips = [];
      if (q.ref) chips.push('Ref. ' + esc(q.ref));
      if (gradeShort(q)) chips.push(esc(gradeShort(q)));
      if (q.year) chips.push(esc(q.year));
      chips.push('입찰 ' + n + '건');
      return '<button type="button" class="cqd-vrow" data-cqd-go="c-detail" data-cqd-id="' + esc(q.id) + '">' +
        rowThumb(q) +
        '<span class="cqd-vrow-main">' +
          '<span class="cqd-vrow-name">' + esc((q.brand || '') + ' ' + (q.model || '')) + ' ' + statusBadge(q) + '</span>' +
          '<span class="cqd-vrow-sub"><em>' + chips.join(' · ') + '</em></span>' +
        '</span>' + right +
      '</button>';
    }).join('');
    if (!rows) {
      return '<div class="cqd-screen">' +
        '<p class="cqd-note">아직 판매 등록한 시계가 없습니다.</p>' +
        '<div class="cqd-empty-cta">' +
          '<p>시계를 등록하면 여러 업체가 금액을 제시해요.<br>여기에서 받은 견적을 확인하고 선택할 수 있어요.</p>' +
          '<button type="button" class="cqd-cta primary" data-cqd-new>＋ 시계 등록하러 가기</button>' +
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
    titleEl.textContent = '비교견적';

    if (q.status === 'pending')
      return '<div class="cqd-screen">' + watchCard(q) + '<p class="cqd-state wait">정·가품 감정 및 승인 검토 중입니다.<br><span>승인되면 업체 비교견적이 시작됩니다.</span></p></div>';
    if (q.status === 'suspended')
      return '<div class="cqd-screen">' + watchCard(q) + '<p class="cqd-state stop">관리자에 의해 정지된 견적입니다.</p></div>';
    if (q.status === 'closed')
      return '<div class="cqd-screen">' + watchCard(q) + '<p class="cqd-state stop">종료된 견적입니다.</p></div>';
    if (q.status === 'awarded')
      return SCREENS['c-offer'](q.id + '|' + q.awarded_bid);

    /* open — 비교견적 결과 (시안 1) */
    var bids = q.bids || [];
    var views = totalViews(q);
    var card = quoteSpecCard(q, true);
    var statBar = '<div class="cqc-stat">' +
      '<span><b>' + num(views) + '</b>조회</span>' +
      '<span><b>' + bids.length + '</b>입찰</span>' +
      '<span class="cqc-stat-cd"><i class="cqc-cd" data-exp="' + q.expiresMs + '">' + cdLabel(q.expiresMs - Date.now()) + '</i></span>' +
    '</div>';

    if (!bids.length)
      return '<div class="cqd-screen cqc">' + card + statBar +
        '<p class="cqd-state wait" style="margin-top:14px">업체 입찰을 기다리는 중입니다.<br><span>입찰이 들어오면 이 화면에 실시간으로 표시됩니다.</span></p></div>';

    var top0 = Number(bids[0].amount) || 0;
    var rows = bids.map(function (b, i) {
      var top = i === 0;
      var diff = top ? 0 : (Number(b.amount) - top0);
      return '<button type="button" class="cqc-row' + (top ? ' is-top' : '') + '" data-cqd-go="c-offer" data-cqd-id="' + esc(q.id) + '|' + esc(b.id) + '">' +
        '<span class="cqc-rank' + (top ? ' top' : '') + '">' + (i + 1) + '<small>위</small></span>' +
        '<span class="cqc-row-main">' +
          '<span class="cqc-row-name">' + (top ? '최고 견적' : '비공개 업체') +
            (top ? '<em class="cqc-best">최고가</em>' : '') + '</span>' +
          '<span class="cqc-row-sub">' + (top ? '업체명·상세는 선택 시 공개' : '최고가 대비 ' + man(diff) + '원') + '</span>' +
        '</span>' +
        '<span class="cqc-row-amt">' + num(b.amount) + '<small>원</small></span>' +
      '</button>';
    }).join('');
    return '<div class="cqd-screen cqc">' + card + statBar +
      '<p class="cqc-result-h">비교견적 결과 <span>' + bids.length + '곳</span></p>' +
      '<div class="cqc-list">' + rows + '</div>' +
      '<p class="cqc-guide">업체명·후기·상세 페이지는 <b>판매 확정 시에만</b> 공개됩니다.<br>지금은 제시 금액만 비교해 선택하세요.</p>' +
    '</div>';
  };

  /* --- 고객: 견적 상세 / 업체 카드 (두 번째 이미지) ---
     확정 전: 업체 식별정보 비공개(금액·사양만) / 확정 후: 업체 전체 공개 */
  SCREENS['c-offer'] = function (param) {
    if (!cust.loaded) return loadingBlock();
    var arr = String(param || '').split('|');
    var q = findIn(cust.watches, arr[0]);
    if (!q) return '<div class="cqd-screen"><p class="cqd-note">정보를 찾을 수 없습니다.</p></div>';
    var bidId = arr[1];
    var bid = null;
    (q.bids || []).forEach(function (b) { if (String(b.id) === String(bidId)) bid = b; });
    if (!bid) bid = (q.bids || [])[0];
    if (!bid) return '<div class="cqd-screen"><p class="cqd-note">입찰 정보가 없습니다.</p></div>';
    titleEl.textContent = '견적 상세';

    var isAwarded = q.status === 'awarded';
    var isThisAwarded = isAwarded && String(q.awarded_bid) === String(bid.id);
    var isTop = (q.bids || [])[0] && String((q.bids || [])[0].id) === String(bid.id);
    var reveal = isThisAwarded; // 확정된 입찰만 업체 공개

    /* 확정 업체 공개 정보(필요 시 1회 로드) */
    var vp = null;
    if (reveal) {
      vp = awardedVendorCache[q.id];
      if (vp === undefined && B && B.getVendorPublic && bid.vendor_id) {
        awardedVendorCache[q.id] = null;
        B.getVendorPublic(bid.vendor_id).then(function (p) { awardedVendorCache[q.id] = p; renderIfOpen(); });
      }
    }
    var vName = (vp && (vp.company_name || vp.display_name)) || '벨로르 인증 업체';
    var vLogo = vp && vp.logo_url;
    var revCount = reviews.length;
    var revAvg = revCount ? (reviews.reduce(function (s, r) { return s + (Number(r.rating) || 5); }, 0) / revCount) : 0;

    /* 업체 카드 */
    var shop = '<div class="cqo-shop' + (reveal ? '' : ' masked') + '">' +
      '<div class="cqo-shop-photo">' + (reveal && vLogo ? '<img src="' + esc(vLogo) + '" alt="" onerror="this.style.display=\'none\'">' : '<span class="cqo-shop-ph">' + (reveal ? ICON_STORE : ICON_LOCK) + '</span>') + '</div>' +
      '<div class="cqo-shop-logo">' + (reveal && vLogo ? '<img src="' + esc(vLogo) + '" alt="" onerror="this.parentNode.textContent=\'' + esc(vName.charAt(0)) + '\'">' : (reveal ? esc(vName.charAt(0)) : ICON_LOCK)) + '</div>' +
      '<p class="cqo-shop-name">' + (reveal ? esc(vName) : '비공개 업체') + '</p>' +
      '<p class="cqo-shop-partner"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l8 4v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6z"></path></svg>' + (reveal ? '공식 파트너' : '확정 시 공개') + '</p>' +
      (reveal && revCount
        ? '<p class="cqo-shop-rating"><b>★ ' + revAvg.toFixed(1) + '</b><span>고객 후기 ' + revCount + '</span></p>'
        : '') +
      '<div class="cqo-trust">' +
        '<div><span>' + ICON_SHIELD + '</span><b>정품 보장</b><small>100% 정품 보장</small></div>' +
        '<div><span>' + ICON_SEARCH + '</span><b>전문 감정</b><small>전문 감정사 검수</small></div>' +
        '<div><span>' + ICON_LOCK + '</span><b>안전 결제</b><small>안전한 거래 보장</small></div>' +
      '</div>' +
    '</div>';

    /* 제안 견적 카드 */
    var sellBtns;
    if (isThisAwarded) {
      sellBtns = '<div class="cqo-confirmed">' + ICON_CHECK + ' 이 견적으로 판매가 확정되었습니다</div>' +
        '<p class="cqo-locked">' + ICON_LOCK + ' 업체 연락처·주소는 공개되지 않습니다. 모든 거래는 <b>벨로르를 통해</b> 안전하게 진행됩니다.</p>';
    } else if (isAwarded) {
      sellBtns = '<p class="cqd-note" style="text-align:center">이미 다른 견적으로 판매가 확정되었습니다.</p>' +
        '<button type="button" class="cqd-cta ghost" data-cqd-go="c-bids" data-cqd-id="' + esc(q.id) + '">‹ 목록으로</button>';
    } else {
      sellBtns = '<button type="button" class="cqo-sell" data-cqd-award data-cqd-q="' + esc(q.id) + '" data-cqd-bid="' + esc(bid.id) + '" data-cqd-vendor="' + esc(bid.vendor_id) + '" data-cqd-amt="' + Number(bid.amount) + '">이 견적으로 판매하기</button>' +
        '<button type="button" class="cqo-compare" data-cqd-go="c-bids" data-cqd-id="' + esc(q.id) + '">다른 견적 비교하기</button>';
    }
    var offer = '<div class="cqo-offer">' +
      '<div class="cqo-offer-top"><span>제안 견적</span>' + (isTop ? '<span class="cqo-best">최고가</span>' : '') + '</div>' +
      '<p class="cqo-amt">' + num(bid.amount) + '<span>원</span></p>' +
      '<dl class="cqo-rows">' +
        '<div><dt>모델</dt><dd>' + esc(modelLine(q)) + (q.ref ? '<br>' + esc(q.ref) : '') + '</dd></div>' +
        '<div><dt>평가 등급</dt><dd>' + esc(gradeText(q)) + '</dd></div>' +
        '<div><dt>구성품</dt><dd>' + esc(partsText(q)) + '</dd></div>' +
        '<div><dt>감정 방식</dt><dd>실물 감정</dd></div>' +
        '<div><dt>입금 예정</dt><dd>당일 입금</dd></div>' +
      '</dl>' +
      sellBtns +
      '<p class="cqo-foot">' + ICON_LOCK + ' 개인 정보와 거래 내역은 안전하게 보호됩니다.</p>' +
    '</div>';

    var revBlock = isThisAwarded
      ? '<p class="cqd-block-label">벨로르 거래 후기</p><ul class="cqd-news">' + reviewList() + '</ul>'
      : '';
    return '<div class="cqd-screen cqo">' + shop + offer + revBlock + '</div>';
  };

  /* --- 고객: 새 시계 등록(비교견적 신청) — 앱 내 전체화면 페이지 --- */
  var ICON_CAM = svg24('<rect x="3" y="6.5" width="18" height="13" rx="2.5"></rect><circle cx="12" cy="13" r="3.4"></circle><path d="M8 6.5l1.4-2.2h5.2L16 6.5"></path>', 1.7);
  function photoGrid() {
    var items = [];
    var e, i;
    for (e = 0; e < editPhotos.length; e++) items.push({ src: esc(editPhotos[e]), rm: 'data-cqd-rmexist="' + e + '"' });
    for (i = 0; i < newPhotos.length; i++) {
      var url = '';
      try { url = URL.createObjectURL(newPhotos[i]); } catch (e2) {}
      items.push({ src: url, rm: 'data-cqd-rmphoto="' + i + '"' });
    }
    if (!items.length) {
      return '<button type="button" class="cqd-photo-add main" data-cqd-addphoto>' + ICON_CAM +
          '<small>대표사진<em>필수</em></small></button>' +
        '<button type="button" class="cqd-photo-add" data-cqd-addphoto>＋<small>추가 사진</small></button>';
    }
    var cells = items.map(function (p, idx) {
      return '<div class="cqd-photo' + (idx === 0 ? ' is-main' : '') + '">' +
        (p.src ? '<img src="' + p.src + '" alt="" onerror="this.style.visibility=\'hidden\'">' : '') +
        (idx === 0 ? '<span class="cqd-photo-tag">대표</span>' : '') +
        '<button type="button" class="cqd-photo-rm" ' + p.rm + ' aria-label="삭제">×</button>' +
      '</div>';
    }).join('');
    return cells + '<button type="button" class="cqd-photo-add" data-cqd-addphoto>＋<small>추가</small></button>';
  }
  /* 촬영 가이드 + 예시 (시안풍 — 문구는 자체 톤으로) */
  function photoGuide() {
    var tips = [
      '대표 사진은 시계 정면이 또렷하게 나오도록 담아주세요.',
      '흠집·눌림 등 상태가 보이는 부분도 함께 올려주세요.',
      '보증서·박스 등 함께 보내는 구성품도 빠짐없이 촬영해 주세요.',
      '시리얼·일련번호가 그대로 노출되지 않게 가려주세요.',
      '시계와 무관하거나 흐릿한 사진은 반려될 수 있어요.'
    ];
    var ex = [
      { name: '앞면', img: 'assets/cq-guide/front.jpg' },
      { name: '구성품', img: 'assets/cq-guide/parts.jpg' },
      { name: '뒷면', img: 'assets/cq-guide/back.jpg' },
      { name: '좌측면', img: 'assets/cq-guide/left.jpg' },
      { name: '우측면', img: 'assets/cq-guide/right.jpg' },
      { name: '클라스프', img: 'assets/cq-guide/clasp.jpg' }
    ];
    return '<ul class="cqd-photo-tips">' + tips.map(function (t) { return '<li>' + t + '</li>'; }).join('') + '</ul>' +
      '<p class="cqd-photo-ex-h">이렇게 찍어주시면 좋아요</p>' +
      '<div class="cqd-photo-ex">' + ex.map(function (e) {
        return '<div class="cqd-photo-ex-cell"><span class="cqd-photo-ex-ic">' +
          '<img src="' + e.img + '" alt="' + e.name + ' 예시" loading="lazy" onerror="this.style.display=\'none\'">' +
          '</span><em>' + e.name + '</em></div>';
      }).join('') + '</div>';
  }
  function refreshPhotoGrid() {
    var g = overlay && overlay.querySelector('#cqdNewPhotos');
    if (g) g.innerHTML = photoGrid();
  }

  /* 업체 대표 이미지 미리보기 (직접 첨부 파일 우선, 없으면 기존 logo_url) */
  function vendorLogoPreview(logo) {
    var src = '';
    if (vendLogoFile) { try { src = URL.createObjectURL(vendLogoFile); } catch (e) {} }
    else if (logo) src = logo;
    var thumb = src
      ? '<span class="cqd-logo-thumb"><img src="' + esc(src) + '" alt="" onerror="this.style.visibility=\'hidden\'">' +
        (vendLogoFile ? '<button type="button" class="cqd-photo-rm" data-cqd-vlogorm aria-label="삭제">×</button>' : '') + '</span>'
      : '';
    return thumb +
      '<button type="button" class="cqd-logo-add" data-cqd-vlogopick>' +
        svg24('<rect x="3" y="5" width="18" height="14" rx="2"></rect><circle cx="9" cy="11" r="2"></circle><path d="m4 18 5-4 4 3 3-2 4 3"></path>') +
        '<small>' + (src ? '이미지 변경' : '이미지 선택') + '</small>' +
      '</button>';
  }
  function refreshVendorLogo() {
    var info = AUTH.info || {};
    var box = overlay && overlay.querySelector('#cqdVLogoPick');
    if (box) box.innerHTML = vendorLogoPreview(info.logoUrl || '');
  }

  /* ===== 브랜드 선택(이미지) + 모델 추천 — brands.js 연동 ===== */
  function brandOptHTML(b) {
    return '<button type="button" class="cqd-brand-opt" data-cqbrand="' + esc(b.name) + '">' +
      '<img src="' + window.BELLORE_BRAND_LOGO(b.slug) + '" alt="" loading="lazy" onerror="this.style.visibility=\'hidden\'">' +
      '<span>' + esc(b.name) + '</span></button>';
  }
  function brandSheetHTML(q) {
    var brands = window.BELLORE_BRANDS || [];
    var ql = String(q || '').trim().toLowerCase();
    var hit = brands.filter(function (b) {
      return !ql || b.name.toLowerCase().indexOf(ql) > -1 || (b.slug || '').toLowerCase().indexOf(ql) > -1;
    });
    // 목록에 없는 브랜드를 위한 '기타' 옵션 (검색어가 없거나 '기타/etc' 일 때 노출)
    var showEtc = !ql || '기타'.indexOf(ql) > -1 || 'etc'.indexOf(ql) > -1 || '기타'.indexOf(q) > -1;
    var etcOpt = showEtc ? '<button type="button" class="cqd-brand-opt cqd-brand-etc" data-cqbrand="기타">' +
        '<span class="cqd-brand-etc-ic">＋</span><span>기타 (목록에 없는 브랜드)</span></button>' : '';
    var opts = (hit.length ? hit.map(brandOptHTML).join('') : (showEtc ? '' : '<p class="cqd-brand-none">검색 결과가 없습니다.</p>')) + etcOpt;
    return '<div class="cqd-brand-search">' +
        '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#999" stroke-width="2"><circle cx="11" cy="11" r="7"></circle><path d="m21 21-4-4"></path></svg>' +
        '<input type="text" id="cqdBrandQ" placeholder="브랜드 검색 (예: 롤렉스, rolex)" autocomplete="off"></div>' +
      '<div class="cqd-brand-list">' + opts + '</div>';
  }
  function fillCqModels(name) {
    var dl = overlay && overlay.querySelector('#cqdModelList'); if (!dl) return;
    var b = window.BELLORE_BRAND_BY_NAME && window.BELLORE_BRAND_BY_NAME(name);
    var base = ((b && b.models) || []).slice();
    function paint(list) {
      var seen = {}, out = [];
      list.forEach(function (m) { var k = String(m || '').trim(); if (k && !seen[k.toLowerCase()]) { seen[k.toLowerCase()] = 1; out.push(k); } });
      dl.innerHTML = out.map(function (m) { return '<option value="' + esc(m) + '">'; }).join('');
    }
    paint(base);
    // 등록된 매물에서 모델명 자동완성 후보를 추가로 합친다
    if (B && B.suggestModels) {
      B.suggestModels(name).then(function (models) {
        if (overlay && overlay.querySelector('#cqdModelList') === dl) paint(base.concat(models || []));
      });
    }
  }
  function setBrandLogo(name) {
    var box = overlay && overlay.querySelector('#cqdBrandLogo'); if (!box) return;
    var b = window.BELLORE_BRAND_BY_NAME && window.BELLORE_BRAND_BY_NAME(name);
    box.innerHTML = b ? '<img src="' + window.BELLORE_BRAND_LOGO(b.slug) + '" alt="" onerror="this.remove()">' : '';
  }
  function wireCqBrand() {
    var sheet = overlay.querySelector('#cqdBrandSheet');
    var hidden = overlay.querySelector('#cqdNewBrand');
    if (sheet) sheet.innerHTML = brandSheetHTML('');
    if (hidden) { fillCqModels(hidden.value); setBrandLogo(hidden.value); }
  }
  /* 신청/수정 공통 입력 필드 (브랜드는 이미지 선택, 모델은 추천 datalist) */
  function formFields(d, nm, ph) {
    var brandName = d.brand || '';
    var gradeChips = GRADE_OPTS.map(function (g) {
      var on = d.grade === g ? ' is-on' : '';
      var main = g.replace(/\s*\(.*\)\s*/, '');
      var subm = (g.match(/\(([^)]*)\)/) || [])[1] || '';
      return '<label class="cqd-grade-chip' + on + '"><input type="radio" name="cqdgrade" value="' + esc(g) + '"' + (d.grade === g ? ' checked' : '') + '>' +
        '<b>' + esc(main) + '</b>' + (subm ? '<em>' + esc(subm) + '</em>' : '') + '</label>';
    }).join('');
    var savedParts = (d.parts || '').split(',').map(function (s) { return s.trim(); });
    var partBoxes = PART_OPTS.map(function (p) {
      var on = savedParts.indexOf(p) >= 0;
      return '<label class="cqd-part-box' + (on ? ' is-on' : '') + '">' +
        '<input type="checkbox" name="cqdpart" value="' + esc(p) + '"' + (on ? ' checked' : '') + ' hidden>' +
        '<span class="cqd-part-ic">' + partIcon(p) + '</span>' +
        '<span class="cqd-part-txt">' + esc(p) + '</span>' +
        '<span class="cqd-part-check" aria-hidden="true"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"></path></svg></span>' +
      '</label>';
    }).join('');
    return '<div class="cqd-form">' +
      '<label>사진 등록 <small class="cqd-lbl-sub">최대 20장 · 첫 장이 대표사진</small></label>' +
      '<div class="cqd-photos" id="cqdNewPhotos">' + photoGrid() + '</div>' +
      '<input type="file" id="cqdNewFile" accept="image/*" multiple hidden>' +
      photoGuide() +
      // 브랜드 · 모델명 (2단)
      '<div class="cqd-row2">' +
        '<div class="cqd-field">' +
          '<label>브랜드 * <small class="cqd-lbl-sub">눌러서 선택</small></label>' +
          '<button type="button" class="cqd-brandbtn' + (brandName ? ' on' : '') + '" id="cqdBrandBtn">' +
            (brandName ? '<span class="cqd-brandbtn-logo" id="cqdBrandLogo"></span>' + esc(brandName) : '브랜드 선택') +
          '</button>' +
          '<input type="hidden" id="cqdNewBrand" value="' + esc(brandName) + '">' +
        '</div>' +
        '<div class="cqd-field">' +
          '<label>모델명 *</label>' +
          '<input type="text" id="cqdNewModel" list="cqdModelList" value="' + esc(d.model || '') + '" placeholder="모델명 입력 · 등록 모델 추천" autocomplete="off">' +
          '<datalist id="cqdModelList"></datalist>' +
        '</div>' +
      '</div>' +
      '<div class="cqd-brandsheet" id="cqdBrandSheet" hidden></div>' +
      // 레퍼런스 · 스템핑 (2단)
      '<div class="cqd-row2">' +
        '<div class="cqd-field">' +
          '<label>레퍼런스</label>' +
          '<input type="text" id="cqdNewRef" value="' + esc(d.ref || '') + '" placeholder="예: 126610LN">' +
        '</div>' +
        '<div class="cqd-field">' +
          '<label>스템핑(각인)</label>' +
          '<input type="text" id="cqdNewStamp" value="' + esc(d.stamping || '') + '" placeholder="시리얼 · 보증서 번호">' +
        '</div>' +
      '</div>' +
      '<label>구매일 / 구입 시기</label>' +
      '<input type="text" id="cqdNewYear" value="' + esc(d.year || '') + '" placeholder="예: 2023년 05월">' +
      '<label>상태 및 등급</label>' +
      '<div class="cqd-gradegrid">' + gradeChips + '</div>' +
      '<label>구성품 <small class="cqd-lbl-sub">해당 항목을 모두 선택</small></label>' +
      '<div class="cqd-partgrid">' + partBoxes + '</div>' +
      '<label>특이사항 (수리이력 · 흠집 · 정품여부 등)</label>' +
      '<textarea id="cqdNewMemo" rows="4" placeholder="시계 상태를 자세히 적어주실수록 정확한 견적이 가능합니다.">' + esc(d.memo || '') + '</textarea>' +
      '<div class="cqd-row2">' +
        '<div class="cqd-field">' +
          '<label>성함 *</label>' +
          '<input type="text" id="cqdNewName" value="' + esc(nm) + '" placeholder="홍길동">' +
        '</div>' +
        '<div class="cqd-field">' +
          '<label>연락처 *</label>' +
          '<input type="tel" id="cqdNewPhone" value="' + esc(ph) + '" placeholder="010-0000-0000">' +
        '</div>' +
      '</div>';
  }
  // 구성품 아이콘(이미지 제공 전 임시 — 추후 이미지로 교체 가능)
  function partIcon(p) {
    var map = {
      '보증서': '📄', '정품 박스': '📦', '설명서/책자': '📖',
      '추가 링크': '🔗', '정품 택': '🏷️', '구매 영수증': '🧾'
    };
    return map[p] || '✔';
  }

  SCREENS['c-new'] = function () {
    titleEl.textContent = '비교견적 신청';
    var info = AUTH.info || {};
    var d = newData || {};
    var nm = d.name || (AUTH.user && AUTH.user.displayName) || '';
    var ph = d.phone || info.phone || '';
    return '<div class="cqd-screen">' +
      '<div class="cqd-newhero">' +
        '<p class="cqd-newhero-eyebrow">REQUEST QUOTE</p>' +
        '<h2 class="cqd-newhero-title">내 시계 비교견적 신청</h2>' +
        '<p class="cqd-newhero-sub">사진과 정보만 등록하면 여러 업체가 금액을 제시합니다.<br>업체명·정보는 <b>확정 시에만</b> 공개됩니다.</p>' +
      '</div>' +
      formFields(d, nm, ph) +
        '<button type="button" class="cqd-cta primary" data-cqd-preview>예상 견적 확인하기</button>' +
        '<button type="button" class="cqd-cta ghost" data-cqd-go="c-watches">취소</button>' +
        '<p class="cqd-offer-foot">* 시작 후 정·가품 구별 및 감정 승인 절차가 진행됩니다.</p>' +
      '</div>' +
    '</div>';
  };

  /* --- 고객: 등록 시계 수정 (수정 시 재승인 필요) --- */
  SCREENS['c-edit'] = function () {
    titleEl.textContent = '등록 시계 수정';
    var d = newData || {};
    var nm = d.name || '';
    var ph = d.phone || '';
    return '<div class="cqd-screen">' +
      '<p class="cqd-state wait" style="margin-bottom:14px">✏️ 등록 정보를 수정합니다.<br><span>수정하면 <b>다시 감정 승인(재승인)</b>을 거치며, 그동안 받은 입찰은 초기화됩니다.</span></p>' +
      formFields(d, nm, ph) +
        '<button type="button" class="cqd-cta primary" data-cqd-editsave>수정 후 재승인 요청</button>' +
        '<button type="button" class="cqd-cta ghost" data-cqd-go="c-watches">취소</button>' +
        '<p class="cqd-offer-foot">* 저장 시 관리자에게 재승인 요청 메일이 전송됩니다.</p>' +
      '</div>' +
    '</div>';
  };

  /* --- 고객: 예상 견적 확인 (시안 2) — 시작 전 미리보기 --- */
  SCREENS['c-estimate'] = function () {
    titleEl.textContent = '예상 견적';
    var d = newData || {};
    if (!d.brand && !d.model) {
      return '<div class="cqd-screen"><p class="cqd-note">먼저 시계 정보를 입력해주세요.</p>' +
        '<button type="button" class="cqd-cta ghost" data-cqd-go="c-new">‹ 신청서로</button></div>';
    }
    var ph = '';
    try { if (newPhotos[0]) ph = URL.createObjectURL(newPhotos[0]); } catch (e) {}
    var pseudo = { brand: d.brand, model: d.model, ref: d.ref, year: d.year, grade: d.grade, photos: ph ? [ph] : [] };
    return '<div class="cqd-screen cqe">' +
      '<div class="cqe-brandmark">' +
        '<p class="cqe-bm-name">BELLORE</p>' +
        '<p class="cqe-bm-sub">L &nbsp; O &nbsp; R &nbsp; E</p>' +
      '</div>' +
      '<p class="cqe-section">선택 조회 결과</p>' +
      quoteSpecCard(pseudo, false) +
      '<div class="cqe-card cqe-price">' +
        '<p class="cqe-price-label">예상 견적가</p>' +
        '<p class="cqe-price-val">데이터 수집중</p>' +
        '<p class="cqe-price-sub">현재 모델은 시세 데이터를 수집중입니다.<br>비교견적을 시작하면 실제 업체들이 금액을 제시합니다.</p>' +
      '</div>' +
      '<div class="cqe-card cqe-chart-card">' +
        '<div class="cqe-chart-head"><b>수집 시세</b><span>최근 6개월</span></div>' +
        estimateChart() +
        '<div class="cqe-chart-x"><span>1월</span><span>2월</span><span>3월</span><span>4월</span><span>5월</span><span>6월</span></div>' +
        '<p class="cqe-chart-note">※ 시세 데이터가 쌓이면 실제 그래프로 표시됩니다.</p>' +
      '</div>' +
      '<button type="button" class="cqe-start" data-cqd-start>내 시계 비교견적 시작하기</button>' +
      '<button type="button" class="cqd-cta ghost" data-cqd-go="c-new">‹ 정보 수정</button>' +
    '</div>';
  };

  /* --- 고객: 등록 시계 정보(첫 번째 이미지 스타일) — 비교견적 진입 화면 ---
     여기서 입찰 업체 확인하기 / 등록 정보 수정 으로 이동 */
  SCREENS['c-detail'] = function (id) {
    if (!cust.loaded) return loadingBlock();
    var q = findIn(cust.watches, id);
    if (!q) return '<div class="cqd-screen"><p class="cqd-note">정보를 찾을 수 없습니다.</p></div>';
    titleEl.textContent = '등록 시계 정보';
    var ph = (q.photos && q.photos[0]) || '';
    var brandShort = (q.brand || '').replace(/\s*\(.*\)\s*/, '').trim() || '시계';
    var n = (q.bids || []).length;

    var card = '<div class="cqe-card">' +
      '<div class="cqe-head">' +
        '<div class="cqe-head-txt"><p class="cqe-brand">' + esc(brandShort) + '</p><p class="cqe-model">' + esc(q.model || '') + '</p></div>' +
        (ph ? '<img class="cqe-photo" src="' + esc(ph) + '" alt="" onerror="this.style.visibility=\'hidden\'">' : '<div class="cqe-photo ph">' + ICON_WATCH + '</div>') +
      '</div>' +
      '<dl class="cqe-spec">' +
        '<div><dt>레퍼런스</dt><dd>' + esc(q.ref || '-') + '</dd></div>' +
        '<div><dt>구매일</dt><dd>' + esc(q.year || '-') + '</dd></div>' +
        '<div><dt>상태</dt><dd>' + esc((q.grade || '-').replace(/\s*\(.*\)\s*/, '')) + '</dd></div>' +
        '<div><dt>스템핑</dt><dd>' + esc(q.stamping || '-') + '</dd></div>' +
        '<div><dt>구성품</dt><dd>' + esc(q.parts || '-') + '</dd></div>' +
      '</dl>' +
      '<div class="cqe-status-row">' + statusBadge(q) + '</div>' +
    '</div>';

    var info = '';
    if (q.status === 'pending') info = '<p class="cqd-state wait">정·가품 감정 및 승인 검토 중입니다.<br><span>승인되면 업체 비교견적이 시작됩니다.</span></p>';
    else if (q.status === 'suspended') info = '<p class="cqd-state stop">관리자에 의해 정지된 견적입니다.</p>';
    else if (q.status === 'closed') info = '<p class="cqd-state stop">종료된 견적입니다.</p>';
    else if (q.status === 'awarded') info = '<p class="cqd-state ok">' + ICON_CHECK + ' 판매가 확정된 시계입니다.</p>';
    else {
      var views = totalViews(q);
      info = '<div class="cqc-head" style="margin-top:6px">' +
        '<p class="cqc-head-stat">지금까지 총 <b>' + num(views) + '명</b>이 조회했고,<br><b>' + n + '명</b>이 입찰했습니다.</p>' +
        '<p class="cqc-timer"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path></svg>' +
        '<span class="cqc-cd" data-exp="' + q.expiresMs + '">' + cdLabel(q.expiresMs - Date.now()) + '</span></p>' +
      '</div>';
    }

    var btns = '';
    if (q.status === 'open' || q.status === 'awarded')
      btns += '<button type="button" class="cqe-start" data-cqd-go="c-bids" data-cqd-id="' + esc(q.id) + '">' +
        (q.status === 'awarded' ? '확정 업체 확인하기' : '입찰 업체 확인하기' + (n ? ' (' + n + '건)' : '')) + '</button>';
    if (q.status !== 'awarded' && q.status !== 'closed')
      btns += '<button type="button" class="cqd-cta ghost" data-cqd-edit="' + esc(q.id) + '">등록 정보 수정</button>';
    btns += '<div class="cqd-btn-row">' +
      '<button type="button" class="cqd-cta ghost half" data-cqd-inquire="' + esc(q.id) + '">' + ICON_CHAT + '이 시계 문의</button>' +
      '<button type="button" class="cqd-cta ghost half" data-cqd-share="' + esc(q.id) + '">' + ICON_SHARE + '공유하기</button>' +
    '</div>';
    btns += '<button type="button" class="cqd-cta ghost" data-cqd-go="c-watches">‹ 목록으로</button>';

    return '<div class="cqd-screen cqe">' + card + info + priceTrendCard() + btns + '</div>';
  };

  /* ===== 고객센터 채팅 화면 ===== */
  function quoteById(id) {
    return findIn(cust.watches, id) || findIn(vend.quotes, id) ||
           findIn(adm.open, id) || findIn(adm.pending, id) || null;
  }
  function chatTime(ms) { var d = new Date(ms); return pad2(d.getHours()) + ':' + pad2(d.getMinutes()); }
  function chatWatchBox(q, nav) {
    if (!q) return '';
    var ph = photoOf(q);
    var inner =
      (ph ? '<img src="' + esc(ph) + '" alt="" onerror="this.style.visibility=\'hidden\'">' : '<span class="cq-chat-watch-ph">' + ICON_WATCH + '</span>') +
      '<span class="cq-chat-watch-txt"><b>' + esc((brandDisplay(q) + ' ' + (q.model || '')).trim()) + '</b>' +
        '<em>' + (q.ref ? 'Ref. ' + esc(q.ref) : '등록 시계') + '</em></span>' +
      (nav ? '<span class="cq-chat-watch-go">›</span>' : '');
    return nav
      ? '<button type="button" class="cq-chat-watch" data-cqd-go="c-detail" data-cqd-id="' + esc(q.id) + '">' + inner + '</button>'
      : '<div class="cq-chat-watch static">' + inner + '</div>';
  }
  function chatBubbles(mineIsAdmin) {
    if (!chat.loaded) return '<p class="cqd-note" style="text-align:center">불러오는 중…</p>';
    if (!chat.messages.length)
      return '<div class="cq-chat-empty">아직 대화가 없습니다.<br>궁금한 점을 남겨주시면 관리자가 답변드립니다.</div>';
    return chat.messages.map(function (m) {
      var mine = mineIsAdmin ? (m.role === 'admin') : (m.role !== 'admin');
      var box = m.refQuote ? chatWatchBox(quoteById(m.refQuote), !mineIsAdmin) : '';
      return '<div class="cq-msg ' + (mine ? 'me' : 'other') + '">' +
        (mine ? '' : '<span class="cq-msg-who">' + (m.role === 'admin' ? '고객센터' : '고객') + '</span>') +
        box +
        '<div class="cq-msg-bubble">' + esc(m.body).replace(/\n/g, '<br>') + '</div>' +
        '<time class="cq-msg-time">' + chatTime(m.createdAtMs) + '</time>' +
      '</div>';
    }).join('');
  }
  function chatInputBar() {
    return '<div class="cq-chat-bar">' +
      '<input type="text" id="cqChatInput" placeholder="메시지를 입력하세요" autocomplete="off">' +
      '<button type="button" class="cq-chat-send" data-cqd-chatsend aria-label="전송">' + ICON_SEND + '</button>' +
    '</div>';
  }
  function sendChat() {
    var inp = overlay.querySelector('#cqChatInput');
    var body = inp ? inp.value.trim() : '';
    if (!body) return;
    if (!B || !B.sendSupportMessage) { alert('로그인이 필요합니다.'); return; }
    var ref = chat.refQuote || null;
    chat.draft = ''; if (inp) inp.value = '';
    B.sendSupportMessage({ threadUser: chat.threadUser, body: body, refQuote: ref })
      .then(function () { chat.refQuote = null; })
      .catch(function (err) { alert('전송 실패: ' + msg(err)); chat.draft = body; if (inp) { inp.value = body; inp.focus(); } });
  }

  SCREENS['c-chat'] = function (quoteId) {
    titleEl.textContent = '고객센터';
    if (!myUid()) return '<div class="cqd-screen"><p class="cqd-note">로그인 후 이용할 수 있습니다.</p></div>';
    if (!chatSub) openChat(myUid(), quoteId || null);
    var refQ = chat.refQuote ? quoteById(chat.refQuote) : null;
    var attach = refQ ? '<div class="cq-chat-attach"><span>문의 시계</span>' + chatWatchBox(refQ, true) + '</div>' : '';
    return '<div class="cq-chat">' +
      '<div class="cq-chat-scroll" id="cqChatScroll">' +
        '<div class="cq-chat-intro">벨로르 고객센터입니다. 비교견적·판매·계정 등 무엇이든 문의해 주세요.<br>평일 11:00~19:00 순차 답변드립니다.</div>' +
        attach +
        chatBubbles(false) +
      '</div>' +
      chatInputBar() +
    '</div>';
  };

  SCREENS['a-chats'] = function () {
    titleEl.textContent = '관리자 · 고객센터';
    if (!admChats.loaded) return '<div class="cqd-screen">' + adminSubtabs('chats') + loadingBody();
    var rows = admChats.threads.map(function (t) {
      var c = accById(t.user);
      var who = c ? (c.display_name || c.email || '회원') : '회원';
      var preview = (t.last.role === 'admin' ? '나: ' : '') + (t.last.body || '');
      return '<button type="button" class="cqd-vrow" data-cqd-chat="' + esc(t.user) + '">' +
        '<span class="cqd-thumb ph">' + ICON_CHAT + '</span>' +
        '<span class="cqd-vrow-main">' +
          '<span class="cqd-vrow-name">' + esc(who) + '</span>' +
          '<span class="cqd-vrow-sub"><em>' + esc(preview) + '</em></span>' +
        '</span>' +
        '<span class="cqd-vrow-amt"><small>' + chatTime(t.last.createdAtMs) + '</small></span>' +
      '</button>';
    }).join('') || '<p class="cqd-note">아직 들어온 문의가 없습니다.</p>';
    return '<div class="cqd-screen">' + adminSubtabs('chats') +
      '<p class="cqd-block-label">고객 문의 목록</p>' +
      '<div class="cqd-vlist">' + rows + '</div>' +
    '</div>';
  };

  SCREENS['a-chat'] = function (userId) {
    var c = accById(userId);
    titleEl.textContent = (c ? (c.display_name || c.email || '고객') : '고객') + ' · 문의';
    if (!chatSub || chat.threadUser !== userId) openChat(userId, null);
    return '<div class="cq-chat">' +
      '<div class="cq-chat-scroll" id="cqChatScroll">' +
        chatBubbles(true) +
      '</div>' +
      chatInputBar() +
    '</div>';
  };

  /* --- 업체: 들어온 비교견적 --- */
  SCREENS['v-watches'] = function () {
    titleEl.textContent = '들어온 비교견적';
    var approved = !!(AUTH.info && AUTH.info.isApprovedVendor);
    var suspended = !!(AUTH.info && AUTH.info.suspended);
    var notice = '';
    if (suspended) notice = '<p class="cqd-state stop">사용정지된 업체 계정입니다. 입찰이 제한됩니다.</p>';
    else if (!approved) notice = '<p class="cqd-state wait">업체 승인 대기중입니다. 승인 후 입찰할 수 있어요.</p>';
    if (!vend.loaded) return '<div class="cqd-screen">' + vendorSubtabs('v-watches') + loadingBody();
    var rows = vend.quotes.map(function (q) {
      var mine = myBidOf(q);
      return '<button type="button" class="cqd-vrow" data-cqd-go="v-bid" data-cqd-id="' + esc(q.id) + '">' +
        rowThumb(q) +
        '<span class="cqd-vrow-main">' +
          '<span class="cqd-vrow-name">' + esc((q.brand || '') + ' ' + (q.model || '')) + '</span>' +
          '<span class="cqd-vrow-sub"><em>' + (q.ref ? 'Ref. ' + esc(q.ref) + ' · ' : '') + '입찰 ' + (q.bids || []).length + '건' + (mine ? ' · 내 입찰 ' + man(mine.amount) + '원' : '') + '</em></span>' +
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
    /* 업체가 실제로 견적을 열어볼 때 조회수 +1 (세션당 1회) */
    if (!viewedQuotes[q.id]) { viewedQuotes[q.id] = 1; if (B && B.bumpQuoteView) B.bumpQuoteView(q.id); }
    var mine = myBidOf(q);
    var approved = !!(AUTH.info && AUTH.info.isApprovedVendor);
    return '<div class="cqd-screen">' +
      watchCard(q) + priceTrendCard() +
      (approved ? '' : '<p class="cqd-state wait">업체 승인 후 입찰이 저장됩니다.</p>') +
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
        '<label>대표 이미지 <small class="cqd-lbl-sub">PC·모바일에서 바로 첨부</small></label>' +
        '<div class="cqd-logopick" id="cqdVLogoPick">' + vendorLogoPreview(logo) + '</div>' +
        '<input type="file" id="cqdVLogoFile" accept="image/*" hidden>' +
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
      '<button type="button" class="' + (cur === 'chats' ? 'is-on' : '') + '" data-cqd-go="a-chats">고객센터</button>' +
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
  function allAdminQuotes() { return adm.pending.concat(adm.open).concat(adm.suspended); }

  SCREENS['a-dash'] = function () {
    titleEl.textContent = '관리자 · 비교견적';
    if (!adm.loaded) return '<div class="cqd-screen">' + adminSubtabs('quotes') + loadingBody();
    function admRow(q) {
      var c = accById(q.uid);
      var chips = [];
      if (q.ref) chips.push('Ref. ' + esc(q.ref));
      chips.push('고객 ' + esc(c ? (c.display_name || c.email || '회원') : '회원'));
      chips.push('입찰 ' + (q.bids || []).length + '건');
      return '<button type="button" class="cqd-vrow" data-cqd-go="a-quote" data-cqd-id="' + esc(q.id) + '">' +
        rowThumb(q) +
        '<span class="cqd-vrow-main">' +
          '<span class="cqd-vrow-name">' + esc((q.brand || '') + ' ' + (q.model || '')) + ' ' + statusBadge(q) + '</span>' +
          '<span class="cqd-vrow-sub"><em>' + chips.join(' · ') + '</em></span>' +
        '</span>' +
        '<span class="cqd-vrow-amt">' + (q.bidAmount ? man(q.bidAmount) + '원' : '-') + '<small>›</small></span>' +
      '</button>';
    }
    var pend = adm.pending.slice();
    var pendRows = pend.map(admRow).join('');
    var openRows = adm.open.map(admRow).join('') || '<p class="cqd-note">진행중 견적이 없습니다.</p>';
    var suspRows = adm.suspended.map(admRow).join('');
    var pendBlock = pend.length
      ? '<p class="cqd-block-label hot">승인 대기 <span class="cqd-cnt">' + pend.length + '</span></p>' +
        '<div class="cqd-vlist cqd-vlist-pend">' + pendRows + '</div>'
      : '<div class="cqd-state ok" style="margin:8px 0 4px">승인 대기중인 시계가 없습니다.</div>';
    var suspBlock = adm.suspended.length
      ? '<p class="cqd-block-label stop">정지된 견적 <span class="cqd-cnt stop">' + adm.suspended.length + '</span></p>' +
        '<div class="cqd-vlist cqd-vlist-stop">' + suspRows + '</div>'
      : '';
    return '<div class="cqd-screen">' + adminSubtabs('quotes') +
      '<div class="cqd-stats">' +
        '<div class="cqd-stat"><b>' + adm.pending.length + '</b><span>승인 대기</span></div>' +
        '<div class="cqd-stat"><b>' + adm.open.length + '</b><span>입찰 진행</span></div>' +
        '<div class="cqd-stat"><b>' + adm.suspended.length + '</b><span>정지</span></div>' +
      '</div>' +
      pendBlock +
      '<p class="cqd-block-label">입찰 진행중</p>' +
      '<div class="cqd-vlist">' + openRows + '</div>' +
      suspBlock +
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
    for (var i = 0; i < arr.length; i++) if (String(arr[i].id) === String(id)) return arr[i];
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

    /* 공유하기 */
    var shr = e.target.closest('[data-cqd-share]');
    if (shr) { cqShare(findIn(cust.watches, shr.getAttribute('data-cqd-share'))); return; }
    /* 이 시계 문의(고객센터 채팅) */
    var iq = e.target.closest('[data-cqd-inquire]');
    if (iq) { openChat(myUid(), iq.getAttribute('data-cqd-inquire')); go('c-chat', iq.getAttribute('data-cqd-inquire')); return; }
    /* 일반 고객센터 채팅 진입 */
    if (e.target.closest('[data-cqd-cs]')) { openChat(myUid(), null); go('c-chat', null); return; }
    /* 관리자: 고객 문의 스레드 열기 */
    var ach = e.target.closest('[data-cqd-chat]');
    if (ach) { openChat(ach.getAttribute('data-cqd-chat'), null); go('a-chat', ach.getAttribute('data-cqd-chat')); return; }
    /* 채팅 전송 */
    if (e.target.closest('[data-cqd-chatsend]')) { sendChat(); return; }
    /* 공유 시트 액션 */
    var sa = e.target.closest('[data-cqd-shareact]');
    if (sa) { shareAct(sa.getAttribute('data-cqd-shareact')); return; }
    if (e.target.closest('#cqShareClose') || e.target.closest('#cqShareMask')) { closeShareSheet(); return; }

    /* 상단 + 버튼 / 빈목록 CTA → 새 시계 등록(상태 초기화) */
    if (e.target.closest('.cqd-add') || e.target.closest('[data-cqd-new]')) {
      editId = null; editPhotos = []; newPhotos = []; newData = {};
      go('c-new'); return;
    }

    /* 브랜드 선택 시트 토글 */
    if (e.target.closest('#cqdBrandBtn')) {
      var sh = overlay.querySelector('#cqdBrandSheet');
      if (sh) {
        sh.hidden = !sh.hidden;
        if (!sh.hidden) {
          sh.innerHTML = brandSheetHTML('');
          var qq = sh.querySelector('#cqdBrandQ');
          if (qq) setTimeout(function () { qq.focus(); }, 30);
        }
      }
      return;
    }
    /* 브랜드 선택 */
    var bopt = e.target.closest('[data-cqbrand]');
    if (bopt) {
      var bname = bopt.getAttribute('data-cqbrand');
      var hb = overlay.querySelector('#cqdNewBrand');
      var bb = overlay.querySelector('#cqdBrandBtn');
      var sh2 = overlay.querySelector('#cqdBrandSheet');
      if (hb) hb.value = bname;
      if (bb) { bb.innerHTML = '<span class="cqd-brandbtn-logo" id="cqdBrandLogo"></span>' + esc(bname); bb.classList.add('on'); }
      setBrandLogo(bname);
      fillCqModels(bname);
      if (sh2) sh2.hidden = true;
      return;
    }

    /* 신규 등록: 사진 추가/삭제 */
    if (e.target.closest('[data-cqd-addphoto]')) {
      var fileEl = overlay.querySelector('#cqdNewFile');
      if (fileEl) fileEl.click();
      return;
    }
    var rmph = e.target.closest('[data-cqd-rmphoto]');
    if (rmph) { newPhotos.splice(Number(rmph.getAttribute('data-cqd-rmphoto')), 1); refreshPhotoGrid(); return; }
    var rmex = e.target.closest('[data-cqd-rmexist]');
    if (rmex) { editPhotos.splice(Number(rmex.getAttribute('data-cqd-rmexist')), 1); refreshPhotoGrid(); return; }

    /* 등록 시계 수정 진입 (기존 값 채워넣기) */
    var ed = e.target.closest('[data-cqd-edit]');
    if (ed) {
      var qe = findIn(cust.watches, ed.getAttribute('data-cqd-edit')); if (!qe) return;
      editId = qe.id;
      editPhotos = (qe.photos || []).slice();
      newPhotos = [];
      var cm = String(qe.memo || '').match(/\[연락처\]\s*([^\/\n]*)\/\s*([^\n]*)/);
      newData = {
        brand: qe.brand || '', model: qe.model || '', ref: qe.ref || '',
        stamping: qe.stamping || '', year: qe.year || '', grade: qe.grade || '',
        parts: qe.parts || '', memo: cleanMemo(qe.memo),
        name: cm ? cm[1].trim() : '', phone: cm ? cm[2].trim() : ''
      };
      go('c-edit', qe.id);
      return;
    }
    /* 등록 시계 수정 저장 → 재승인 */
    var es = e.target.closest('[data-cqd-editsave]');
    if (es) { if (collectNew()) submitEdit(es); return; }

    /* 신규 등록: 예상 견적 미리보기로 이동 */
    var pv = e.target.closest('[data-cqd-preview]');
    if (pv) { if (collectNew()) go('c-estimate'); return; }

    /* 예상 견적 페이지: 비교견적 시작(실제 등록) */
    var st = e.target.closest('[data-cqd-start]');
    if (st) { submitNew(st); return; }

    /* 고객: 견적 선택(확정) */
    var aw = e.target.closest('[data-cqd-award]');
    if (aw) {
      var qid = aw.getAttribute('data-cqd-q');
      var bidId = aw.getAttribute('data-cqd-bid');
      var vendorId = aw.getAttribute('data-cqd-vendor');
      var amt = Number(aw.getAttribute('data-cqd-amt'));
      var qa = findIn(cust.watches, qid); if (!qa) return;
      bellConfirm(won(amt) + ' 견적으로 판매를 확정할까요?\n확정 후 해당 업체 정보가 공개되며, 관리자에게 전송됩니다.').then(function (ok) {
        if (!ok) return;
        B.awardBid(qid, bidId, vendorId).then(function () {
          var vp = awardedVendorCache[qid];
          emailAdmin(qa, { amount: amt, id: bidId }, vp && (vp.company_name || vp.display_name));
          alert('판매가 확정되었습니다. 관리자(' + ADMIN_EMAIL + ')에게 선택 내역을 전송했습니다.');
          go('c-offer', qid + '|' + bidId, true);
        }).catch(function (err) { alert('확정 실패: ' + msg(err)); });
      });
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

    /* 업체: 대표 이미지 직접 첨부 */
    if (e.target.closest('[data-cqd-vlogopick]')) {
      var lf = overlay.querySelector('#cqdVLogoFile'); if (lf) lf.click(); return;
    }
    if (e.target.closest('[data-cqd-vlogorm]')) { vendLogoFile = null; refreshVendorLogo(); return; }

    /* 업체: 내 업체 정보 저장 */
    var vs = e.target.closest('[data-cqd-vsave]');
    if (vs) {
      var nm = overlay.querySelector('#cqdVName');
      vs.disabled = true;
      B.updateMyVendorProfile({ company_name: nm ? nm.value.trim() : null, logoFile: vendLogoFile || undefined })
        .then(function () { vendLogoFile = null; alert('업체 정보가 저장되었습니다.'); render(); })
        .catch(function (err) { alert('저장 실패: ' + msg(err)); })
        .then(function () { vs.disabled = false; });
      return;
    }

    /* 관리자: 견적 승인/거부/정지/삭제 */
    var ap = e.target.closest('[data-cqd-approve]');
    if (ap) { B.approveListing(ap.getAttribute('data-cqd-approve')).then(function(){ alert('승인했습니다. 업체 입찰이 시작됩니다.'); }).catch(function (err) { alert('실패: ' + msg(err)); }); return; }
    var rj = e.target.closest('[data-cqd-reject]');
    if (rj) { bellConfirm('이 견적을 거부할까요?').then(function (ok) { if (ok) B.rejectListing(rj.getAttribute('data-cqd-reject')).then(function(){ go('a-dash', null, true); }).catch(function (err) { alert('실패: ' + msg(err)); }); }); return; }
    var sq = e.target.closest('[data-cqd-suspendq]');
    if (sq) { bellConfirm('이 견적을 정지할까요?').then(function (ok) { if (ok) B.suspendQuote(sq.getAttribute('data-cqd-suspendq')).catch(function (err) { alert('실패: ' + msg(err)); }); }); return; }
    var usq = e.target.closest('[data-cqd-unsuspendq]');
    if (usq) { B.unsuspendQuote(usq.getAttribute('data-cqd-unsuspendq')).catch(function (err) { alert('실패: ' + msg(err)); }); return; }
    var dq = e.target.closest('[data-cqd-delq]');
    if (dq) { bellConfirm('이 견적을 삭제할까요? 되돌릴 수 없습니다.').then(function (ok) { if (ok) B.deleteQuote(dq.getAttribute('data-cqd-delq')).then(function(){ go('a-dash', null, true); }).catch(function (err) { alert('실패: ' + msg(err)); }); }); return; }

    /* 관리자: 업체 승인/VIP/정지/삭제 */
    var apv = e.target.closest('[data-cqd-approvev]');
    if (apv) { B.setVendorApproved(apv.getAttribute('data-cqd-approvev'), true).catch(function (err) { alert('실패: ' + msg(err)); }); return; }
    var uapv = e.target.closest('[data-cqd-unapprovev]');
    if (uapv) { bellConfirm('승인을 취소할까요?').then(function (ok) { if (ok) B.setVendorApproved(uapv.getAttribute('data-cqd-unapprovev'), false).catch(function (err) { alert('실패: ' + msg(err)); }); }); return; }
    var vip = e.target.closest('[data-cqd-vipv]');
    if (vip) { B.setVip(vip.getAttribute('data-cqd-vipv'), true).catch(function (err) { alert('실패: ' + msg(err)); }); return; }
    var uvip = e.target.closest('[data-cqd-unvipv]');
    if (uvip) { B.setVip(uvip.getAttribute('data-cqd-unvipv'), false).catch(function (err) { alert('실패: ' + msg(err)); }); return; }
    var sv = e.target.closest('[data-cqd-suspendv]');
    if (sv) { bellConfirm('이 업체를 사용정지할까요?').then(function (ok) { if (ok) B.setVendorSuspended(sv.getAttribute('data-cqd-suspendv'), true).catch(function (err) { alert('실패: ' + msg(err)); }); }); return; }
    var usv = e.target.closest('[data-cqd-unsuspendv]');
    if (usv) { B.setVendorSuspended(usv.getAttribute('data-cqd-unsuspendv'), false).catch(function (err) { alert('실패: ' + msg(err)); }); return; }
    var dv = e.target.closest('[data-cqd-delv]');
    if (dv) { bellConfirm('이 업체를 삭제할까요? (Auth 계정 완전 삭제는 콘솔에서)').then(function (ok) { if (ok) B.deleteAccount(dv.getAttribute('data-cqd-delv')).then(function(){ go('a-vendors', null, true); }).catch(function (err) { alert('실패: ' + msg(err)); }); }); return; }
    var dc = e.target.closest('[data-cqd-delc]');
    if (dc) { bellConfirm('이 고객 계정을 삭제할까요?').then(function (ok) { if (ok) B.deleteAccount(dc.getAttribute('data-cqd-delc')).catch(function (err) { alert('실패: ' + msg(err)); }); }); return; }
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
    } else if (e.target && e.target.id === 'cqdVLogoFile') {
      if (e.target.files && e.target.files[0]) vendLogoFile = e.target.files[0];
      e.target.value = '';
      refreshVendorLogo();
    } else if (e.target && e.target.name === 'cqdgrade') {
      var chips = overlay.querySelectorAll('.cqd-grade-chip');
      for (var g = 0; g < chips.length; g++) chips[g].classList.toggle('is-on', chips[g].contains(e.target) && e.target.checked);
    } else if (e.target && e.target.name === 'cqdpart') {
      var box = e.target.closest('.cqd-part-box');
      if (box) box.classList.toggle('is-on', e.target.checked);
    }
  }

  /* 브랜드 검색어 입력 → 리스트만 갱신 */
  function onInput(e) {
    if (e.target && e.target.id === 'cqdBrandQ') {
      var listEl = overlay.querySelector('.cqd-brand-list'); if (!listEl) return;
      var tmp = document.createElement('div');
      tmp.innerHTML = brandSheetHTML(e.target.value);
      var nl = tmp.querySelector('.cqd-brand-list');
      if (nl) listEl.innerHTML = nl.innerHTML;
    } else if (e.target && e.target.id === 'cqChatInput') {
      chat.draft = e.target.value;
    }
  }
  function onKey(e) {
    if (e.target && e.target.id === 'cqChatInput' && e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault(); sendChat();
    }
  }

  /* item_detail 에서 태그/연락처 줄을 제거한 순수 메모만 추출 */
  function cleanMemo(detail) {
    return String(detail || '').split('\n').filter(function (l) {
      var t = l.trim();
      return t && t.charAt(0) !== '[';
    }).join('\n').trim();
  }

  /* 관리자 메일 — 신규 신청 / 수정(재승인) 시 발송(필수) */
  function emailAdminSubmit(d, isEdit) {
    try {
      var payload = {
        _subject: '[벨로르] 시계판매 ' + (isEdit ? '견적 수정(재승인 요청)' : '신규 비교견적 신청'),
        _template: 'table', _captcha: 'false',
        구분: isEdit ? '수정·재승인 요청' : '신규 신청',
        시계: (d.brand || '') + ' ' + (d.model || ''),
        레퍼런스: d.ref || '-', 구매일: d.year || '-', 상태등급: d.grade || '-',
        구성품: d.parts || '-', 신청자: (d.name || '') + ' / ' + (d.phone || '')
      };
      fetch('https://formsubmit.co/ajax/' + ADMIN_EMAIL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(payload)
      }).catch(function () {});
    } catch (e) {}
  }

  /* 신청서 입력값 수집 → newData (예상견적 미리보기 전 검증) */
  function collectNew() {
    var parts = [];
    var chk = overlay.querySelectorAll('input[name="cqdpart"]:checked');
    for (var i = 0; i < chk.length; i++) parts.push(chk[i].value);
    var gradeEl = overlay.querySelector('input[name="cqdgrade"]:checked');
    var d = {
      brand: valOf('#cqdNewBrand'),
      model: valOf('#cqdNewModel'),
      ref: valOf('#cqdNewRef'),
      stamping: valOf('#cqdNewStamp'),
      year: valOf('#cqdNewYear'),
      grade: gradeEl ? gradeEl.value : '',
      parts: parts.join(', '),
      memo: valOf('#cqdNewMemo'),
      name: valOf('#cqdNewName'),
      phone: valOf('#cqdNewPhone')
    };
    if (!newPhotos.length && !editPhotos.length) { alert('시계 사진을 1장 이상 등록해주세요.'); return false; }
    if (!d.brand) { alert('브랜드를 선택해주세요.'); return false; }
    if (!d.model) { alert('모델명을 입력해주세요.'); return false; }
    if (!d.name || !d.phone) { alert('성함과 연락처를 입력해주세요.'); return false; }
    newData = d;
    return true;
  }

  /* 비교견적 시작 → 실제 백엔드(quote_requests) 저장 */
  function submitNew(btn) {
    var d = newData || {};
    if (!d.brand || !d.model) { go('c-new'); return; }
    if (!newPhotos.length) { alert('시계 사진을 1장 이상 등록해주세요.'); return; }
    if (!B.addListing) { alert('등록 기능을 사용할 수 없습니다.'); return; }
    btn.disabled = true; btn.textContent = '시작하는 중…';
    B.addListing({
      photos: newPhotos,
      brand: d.brand, model: d.model, ref: d.ref, stamping: d.stamping,
      year: d.year, grade: d.grade, parts: d.parts,
      memo: d.memo, name: d.name, phone: d.phone
    })
      .then(function () {
        emailAdminSubmit(d, false);
        newPhotos = []; editPhotos = []; editId = null; newData = {};
        alert('비교견적이 시작되었습니다.\n정·가품 감정 승인 후 업체 비교견적이 진행됩니다.');
        go('c-watches', null, true);
      })
      .catch(function (err) { alert('시작 실패: ' + msg(err)); })
      .then(function () { btn.disabled = false; btn.textContent = '내 시계 비교견적 시작하기'; });
  }

  /* 등록 시계 수정 → updateListing (status=pending 재승인) + 관리자 메일 */
  function submitEdit(btn) {
    var d = newData || {};
    if (!d.brand || !d.model) { alert('브랜드와 모델명을 확인해주세요.'); return; }
    var photos = editPhotos.concat(newPhotos);
    if (!photos.length) { alert('시계 사진을 1장 이상 등록해주세요.'); return; }
    if (!B.updateListing) { alert('수정 기능을 사용할 수 없습니다.'); return; }
    bellConfirm('수정하면 다시 정·가품 감정 승인(재승인) 절차를 거칩니다.\n그동안 받은 입찰은 초기화됩니다. 계속할까요?').then(function (ok) {
      if (!ok) return;
      btn.disabled = true; btn.textContent = '수정 중…';
      B.updateListing(editId, {
        photos: photos,
        brand: d.brand, model: d.model, ref: d.ref, stamping: d.stamping,
        year: d.year, grade: d.grade, parts: d.parts,
        memo: d.memo, name: d.name, phone: d.phone
      })
        .then(function () {
          emailAdminSubmit(d, true);
          newPhotos = []; editPhotos = []; editId = null; newData = {};
          alert('수정되었습니다. 재승인 후 비교견적이 다시 시작됩니다.\n관리자에게 재승인 요청 메일을 전송했습니다.');
          go('c-watches', null, true);
        })
        .catch(function (err) { alert('수정 실패: ' + msg(err)); })
        .then(function () { btn.disabled = false; btn.textContent = '수정 후 재승인 요청'; });
    });
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
    startCdTimer();
  }
  function close() {
    clearSubs();
    closeChat();
    closeShareSheet();
    stopCdTimer();
    if (overlay) overlay.hidden = true;
    document.body.style.overflow = '';
  }

  window.CQDemo = { open: open, close: close };

  /* 마이페이지 진입 버튼 위임 */
  document.addEventListener('click', function (e) {
    var cs = e.target.closest('[data-cqd-cs-open]');
    if (cs) { e.preventDefault(); open({ screen: 'c-chat' }); return; }
    var t = e.target.closest('[data-cqd-open]');
    if (t) { e.preventDefault(); open(); }
  });
})();
