/* ============================================================
   벨로르(BELLORE) · 경매 관제소 (관리자)
   - 우리가 등록한 모든 시계가 사진+이름으로 자동 나열 → 클릭하면 경매 설정
     (판매가=시작가 / 진행 시간 / 최소 입찰단위 / 최소 판매가 / 참여자격 / 예약시작)
   - 진행중·예약된 경매의 입찰 현황·진행 상황을 한눈에 보는 관측소
   - self-contained: window.sbClient(Supabase) + window.NWBackend(인증)만 사용.
     auction.sql 미실행 시엔 "DB 준비 필요" 안내로 안전하게 폴백.
   ============================================================ */
(function () {
  'use strict';
  function $(s, c) { return (c || document).querySelector(s); }
  function $$(s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); }
  function fmt(n) { return Number(n || 0).toLocaleString('ko-KR'); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function B() { return window.NWBackend; }
  function sb() { return window.sbClient; }
  function isAdmin() { try { return !!(B() && B().isAdmin && B().isAdmin()); } catch (e) { return false; } }
  function myUid() { try { var u = B() && B().currentUser && B().currentUser(); return u && u.uid; } catch (e) { return null; } }

  /* ---------- 시간/상태 헬퍼 ---------- */
  function auctionState(a) {
    if (a.status === 'canceled') return 'canceled';
    if (a.status === 'ended') return 'ended';
    var now = Date.now();
    if (now >= Date.parse(a.end_at)) return 'ended';
    if (now < Date.parse(a.start_at)) return 'scheduled';
    return 'live';
  }
  var STATE_LABEL = { scheduled: '예약됨', live: '진행중', ended: '종료', canceled: '취소' };
  function remainText(a) {
    var st = auctionState(a);
    var target = st === 'scheduled' ? Date.parse(a.start_at) : Date.parse(a.end_at);
    var d = target - Date.now();
    if (st === 'ended' || st === 'canceled') return '';
    if (d <= 0) return '';
    var h = Math.floor(d / 3600000), m = Math.floor((d % 3600000) / 60000), s = Math.floor((d % 60000) / 1000);
    var pre = st === 'scheduled' ? '시작까지 ' : '종료까지 ';
    if (h >= 24) return pre + Math.floor(h / 24) + '일 ' + (h % 24) + '시간';
    return pre + (h > 0 ? h + '시간 ' : '') + m + '분 ' + (h > 0 ? '' : s + '초');
  }
  function fmtWhen(iso) {
    var t = new Date(iso);
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return (t.getMonth() + 1) + '월 ' + t.getDate() + '일 ' + p(t.getHours()) + ':' + p(t.getMinutes());
  }
  // datetime-local 값(로컬시간) → ISO
  function localInputToISO(v) { return v ? new Date(v).toISOString() : null; }
  function nowLocalInput() {
    var t = new Date(Date.now() - new Date().getTimezoneOffset() * 60000);
    return t.toISOString().slice(0, 16);
  }
  function priceGrade30(p) { return Math.max(Math.floor((Number(p) || 0) * 0.30), 10000); }

  /* ---------- 데이터 ---------- */
  function fetchListings() {
    if (!sb()) return Promise.resolve([]);
    return sb().from('listings')
      .select('id,title,description,price,sale_price,image_url,image_urls,product_no,category,status')
      .order('created_at', { ascending: false }).limit(500)
      .then(function (res) {
        if (res.error) throw res.error;
        return (res.data || []).map(function (l) {
          return {
            id: l.id, brand: l.title || '', model: l.description || '',
            price: l.price || 0, product_no: l.product_no || '',
            category: l.category || '', status: l.status || '',
            img: l.image_url || (l.image_urls && l.image_urls[0]) || ''
          };
        });
      });
  }
  function fetchAuctions() {
    if (!sb()) return Promise.resolve([]);
    return sb().from('auctions').select('*').order('created_at', { ascending: false }).limit(300)
      .then(function (res) { if (res.error) throw res.error; return res.data || []; });
  }
  function fetchBids(auctionId) {
    if (!sb()) return Promise.resolve([]);
    return sb().from('auction_bids').select('amount,bidder_id,is_floor,created_at')
      .eq('auction_id', auctionId).order('amount', { ascending: false }).limit(50)
      .then(function (res) { if (res.error) throw res.error; return res.data || []; });
  }
  function createAuction(payload) {
    if (!sb()) return Promise.reject(new Error('NO_BACKEND'));
    return sb().from('auctions').insert(payload).select().single()
      .then(function (res) { if (res.error) throw res.error; return res.data; });
  }
  function endAuction(id) {
    return sb().from('auctions').update({ status: 'ended' }).eq('id', id)
      .then(function (res) { if (res.error) throw res.error; });
  }
  function cancelAuction(id) {
    return sb().from('auctions').update({ status: 'canceled' }).eq('id', id)
      .then(function (res) { if (res.error) throw res.error; });
  }

  /* ---------- 오버레이 DOM ---------- */
  var root = null, listingsCache = [], auctionsCache = [], tab = 'live', tick = null;

  function ensureRoot() {
    if (root) return root;
    root = document.createElement('div');
    root.className = 'auc-admin';
    root.hidden = true;
    root.innerHTML =
      '<header class="auc-top">' +
        '<button type="button" class="auc-back" aria-label="닫기">' +
          '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>' +
        '</button>' +
        '<span class="auc-title">경매 관제소</span><span style="width:22px"></span>' +
      '</header>' +
      '<div class="auc-tabs">' +
        '<button type="button" class="auc-tab on" data-atab="live">진행 · 예약</button>' +
        '<button type="button" class="auc-tab" data-atab="pick">시계 목록에서 예약</button>' +
      '</div>' +
      '<div class="auc-body"></div>';
    document.body.appendChild(root);

    root.querySelector('.auc-back').addEventListener('click', close);
    $$('.auc-tab', root).forEach(function (t) {
      t.addEventListener('click', function () { switchTab(t.dataset.atab); });
    });
    return root;
  }

  function switchTab(t) {
    tab = t;
    $$('.auc-tab', root).forEach(function (x) { x.classList.toggle('on', x.dataset.atab === t); });
    render();
  }

  function open() {
    if (!isAdmin()) { alert('관리자만 이용할 수 있어요.'); return; }
    ensureRoot();
    root.hidden = false;
    document.body.style.overflow = 'hidden';
    tab = 'live';
    $$('.auc-tab', root).forEach(function (x) { x.classList.toggle('on', x.dataset.atab === 'live'); });
    renderLoading();
    refreshData().then(render);
    if (tick) clearInterval(tick);
    tick = setInterval(function () {
      // 라이브 카운트다운/현황 자동 갱신
      if (tab === 'live') refreshData().then(function () { if (!root.hidden) render(); });
      else updateCountdowns();
    }, 8000);
  }
  function close() {
    if (root) { root.hidden = true; }
    document.body.style.overflow = '';
    if (tick) { clearInterval(tick); tick = null; }
  }

  function refreshData() {
    return Promise.all([fetchListings().catch(function () { return null; }),
                        fetchAuctions().catch(function () { return null; })])
      .then(function (r) {
        if (r[0] != null) listingsCache = r[0];
        if (r[1] != null) auctionsCache = r[1];
        return { listErr: r[0] == null, aucErr: r[1] == null };
      });
  }

  function renderLoading() { $('.auc-body', root).innerHTML = '<p class="auc-empty">불러오는 중…</p>'; }
  function dbHelp() {
    return '<div class="auc-note">경매 테이블이 아직 없습니다. Supabase SQL Editor에서 <b>auction.sql</b>을 실행해 주세요.</div>';
  }

  function render() {
    if (!root) return;
    if (tab === 'live') renderLive();
    else renderPick();
  }

  /* ----- 탭1: 진행·예약 경매 현황 ----- */
  function renderLive() {
    var box = $('.auc-body', root);
    var list = auctionsCache.slice().sort(function (a, b) {
      var order = { live: 0, scheduled: 1, ended: 2, canceled: 3 };
      return order[auctionState(a)] - order[auctionState(b)] ||
             Date.parse(b.start_at) - Date.parse(a.start_at);
    });
    if (!list.length) {
      box.innerHTML = (sb() ? '' : dbHelp()) +
        '<p class="auc-empty">아직 예약된 경매가 없어요.<br>‘시계 목록에서 예약’ 탭에서 시작해보세요.</p>';
      return;
    }
    box.innerHTML = list.map(auctionCard).join('');
    bindLiveActions(box);
    updateCountdowns();
  }

  function auctionCard(a) {
    var st = auctionState(a);
    var floor = a.reserve_price || a.guaranteed_price || 0;
    var cur = a.current_price;
    return '<div class="auc-card" data-aid="' + esc(a.id) + '">' +
      '<div class="auc-card-head">' +
        '<div class="auc-thumb">' + (a.image_url ? '<img src="' + esc(a.image_url) + '" alt="">' : '') + '</div>' +
        '<div class="auc-card-main">' +
          '<div class="auc-badges"><span class="auc-badge auc-badge--' + st + '">' + STATE_LABEL[st] + '</span>' +
            (a.eligibility === 'adult' ? '<span class="auc-badge auc-badge--adult">성인만</span>' : '') + '</div>' +
          '<p class="auc-name">' + esc((a.brand || '') + ' ' + (a.model || '')) + '</p>' +
          '<p class="auc-when">' + fmtWhen(a.start_at) + ' ~ ' + fmtWhen(a.end_at) +
            ' <span class="auc-remain" data-remain="' + esc(a.id) + '">' + remainText(a) + '</span></p>' +
        '</div>' +
      '</div>' +
      '<div class="auc-figures">' +
        fig('시세', a.retail_price ? fmt(a.retail_price) + '원' : '-') +
        fig('시작가', fmt(a.start_price) + '원') +
        fig('현재가', cur ? fmt(cur) + '원' : '입찰 전') +
        fig('입찰', (a.bid_count || 0) + '회') +
        (floor ? fig(a.owner_role === 'partner' ? '최소낙찰' : '매입보장', fmt(floor) + '원') : '') +
      '</div>' +
      (st === 'ended' && a.winner_id ? '<p class="auc-won">낙찰 ' + fmt(a.final_price) + '원</p>' :
       st === 'ended' ? '<p class="auc-fail">유찰</p>' : '') +
      '<div class="auc-bidlist" data-bids="' + esc(a.id) + '" hidden></div>' +
      '<div class="auc-card-acts">' +
        '<button type="button" class="auc-mini" data-showbids="' + esc(a.id) + '">입찰 내역</button>' +
        (st === 'live' ? '<button type="button" class="auc-mini auc-mini--end" data-end="' + esc(a.id) + '">지금 종료</button>' : '') +
        (st === 'scheduled' ? '<button type="button" class="auc-mini auc-mini--end" data-cancel="' + esc(a.id) + '">예약 취소</button>' : '') +
      '</div>' +
    '</div>';
  }
  function fig(label, val) {
    return '<div class="auc-fig"><span>' + label + '</span><b>' + val + '</b></div>';
  }

  function bindLiveActions(box) {
    $$('[data-showbids]', box).forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.dataset.showbids;
        var panel = box.querySelector('[data-bids="' + id + '"]');
        if (!panel) return;
        if (!panel.hidden) { panel.hidden = true; return; }
        panel.hidden = false;
        panel.innerHTML = '<p class="auc-empty">불러오는 중…</p>';
        fetchBids(id).then(function (rows) {
          panel.innerHTML = rows.length ? rows.map(function (b, i) {
            return '<div class="auc-bidrow">' +
              '<span class="auc-bidrank">' + (i + 1) + '</span>' +
              '<span class="auc-bidwho">' + (b.is_floor ? '🏷 매입보장' : '응찰자 ' + String(b.bidder_id).slice(0, 6)) + '</span>' +
              '<b>' + fmt(b.amount) + '원</b>' +
              '<span class="auc-bidtime">' + fmtWhen(b.created_at) + '</span>' +
            '</div>';
          }).join('') : '<p class="auc-empty">아직 입찰이 없어요.</p>';
        }).catch(function () { panel.innerHTML = '<p class="auc-empty">불러오기 실패</p>'; });
      });
    });
    $$('[data-end]', box).forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (!confirm('이 경매를 지금 종료할까요? 현재 최고가로 낙찰 처리됩니다.')) return;
        endAuction(btn.dataset.end).then(function () { refreshData().then(render); })
          .catch(function (e) { alert('종료 실패: ' + (e.message || e)); });
      });
    });
    $$('[data-cancel]', box).forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (!confirm('예약된 경매를 취소할까요?')) return;
        cancelAuction(btn.dataset.cancel).then(function () { refreshData().then(render); })
          .catch(function (e) { alert('취소 실패: ' + (e.message || e)); });
      });
    });
  }

  function updateCountdowns() {
    if (!root || root.hidden) return;
    var map = {};
    auctionsCache.forEach(function (a) { map[a.id] = a; });
    $$('[data-remain]', root).forEach(function (el) {
      var a = map[el.dataset.remain]; if (a) el.textContent = remainText(a);
    });
  }

  /* ----- 탭2: 시계 목록에서 예약 ----- */
  function renderPick() {
    var box = $('.auc-body', root);
    if (!sb()) { box.innerHTML = dbHelp(); return; }
    if (!listingsCache.length) {
      box.innerHTML = '<p class="auc-empty">등록된 시계가 없어요. 먼저 판매시계를 등록해 주세요.</p>';
      return;
    }
    // 진행중/예약된 경매가 이미 있는 매물 표시
    var activeByListing = {};
    auctionsCache.forEach(function (a) {
      var st = auctionState(a);
      if (st === 'live' || st === 'scheduled') activeByListing[a.listing_id] = st;
    });
    box.innerHTML =
      '<p class="auc-pick-hint">시계를 누르면 경매 설정이 열려요. 등록된 모든 시계가 자동으로 연동됩니다.</p>' +
      '<div class="auc-grid">' + listingsCache.map(function (l) {
        var badge = activeByListing[l.id];
        return '<button type="button" class="auc-pick" data-lid="' + esc(l.id) + '">' +
          '<div class="auc-pick-img">' + (l.img ? '<img src="' + esc(l.img) + '" alt="" loading="lazy">' : '') +
            (badge ? '<span class="auc-pick-flag auc-pick-flag--' + badge + '">' + STATE_LABEL[badge] + '</span>' : '') + '</div>' +
          '<p class="auc-pick-brand">' + esc(l.brand) + '</p>' +
          '<p class="auc-pick-model">' + esc(l.model) + '</p>' +
          '<p class="auc-pick-price">' + (l.price ? fmt(l.price) + '원' : '가격 미정') + '</p>' +
        '</button>';
      }).join('') + '</div>';
    $$('.auc-pick', box).forEach(function (btn) {
      btn.addEventListener('click', function () { openConfig(btn.dataset.lid); });
    });
  }

  /* ----- 경매 설정 시트 ----- */
  function openConfig(lid) {
    var l = listingsCache.filter(function (x) { return x.id === lid; })[0];
    if (!l) return;
    var startDefault = priceGrade30(l.price);
    var sheet = document.createElement('div');
    sheet.className = 'auc-sheet';
    sheet.innerHTML =
      '<div class="auc-sheet-card">' +
        '<div class="auc-sheet-head">' +
          '<div class="auc-thumb">' + (l.img ? '<img src="' + esc(l.img) + '" alt="">' : '') + '</div>' +
          '<div><p class="auc-name">' + esc(l.brand + ' ' + l.model) + '</p>' +
          '<p class="auc-when">시세 ' + (l.price ? fmt(l.price) + '원' : '-') + '</p></div>' +
          '<button type="button" class="auc-sheet-x" aria-label="닫기">×</button>' +
        '</div>' +
        '<div class="auc-sheet-body">' +
          field('판매가(입찰 시작가)', '<input type="number" id="aucStart" value="' + startDefault + '" min="0" step="10000"><span class="auc-hint">비우면 시세의 30%로 시작 · 낮을수록 “싸게 잡을 기회”가 커집니다</span>') +
          field('진행 시간', chips('aucDur', [['1','1시간'],['6','6시간'],['12','12시간'],['24','1일'],['72','3일']], '24')) +
          field('시작 시각', '<input type="datetime-local" id="aucStartAt" value="' + nowLocalInput() + '"><span class="auc-hint">지금으로 두면 즉시 시작, 미래로 두면 예약</span>') +
          field('최소 입찰 단위', chips('aucInc', [['10000','1만'],['50000','5만'],['100000','10만'],['500000','50만']], '10000')) +
          field('최소 판매가 <em class="auc-sub">(이 밑으론 낙찰 안 됨 · 선택)</em>', '<input type="number" id="aucReserve" placeholder="예: ' + (l.price ? Math.floor(l.price*0.6) : '') + '" min="0" step="10000"><span class="auc-hint">벨로르 물건은 “매입 보장가”, 파트너 물건은 “최소 낙찰가”로 바닥을 받쳐요</span>') +
          field('참여 자격', chips('aucElig', [['all','모든 회원'],['adult','성인 인증 회원만']], 'all')) +
        '</div>' +
        '<div class="auc-sheet-acts">' +
          '<button type="button" class="auc-cancel" id="aucSheetCancel">취소</button>' +
          '<button type="button" class="auc-submit" id="aucSheetGo">경매 예약하기</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(sheet);
    bindChips(sheet);
    var closeSheet = function () { if (sheet.parentNode) sheet.parentNode.removeChild(sheet); };
    sheet.querySelector('.auc-sheet-x').addEventListener('click', closeSheet);
    $('#aucSheetCancel', sheet).addEventListener('click', closeSheet);
    sheet.addEventListener('click', function (e) { if (e.target === sheet) closeSheet(); });
    $('#aucSheetGo', sheet).addEventListener('click', function () {
      submitConfig(l, sheet, closeSheet);
    });
  }

  function field(label, inner) {
    return '<div class="auc-field"><label>' + label + '</label>' + inner + '</div>';
  }
  function chips(name, opts, def) {
    return '<div class="auc-chips" data-chip="' + name + '">' + opts.map(function (o) {
      return '<button type="button" class="auc-chip' + (o[0] === def ? ' on' : '') + '" data-val="' + o[0] + '">' + o[1] + '</button>';
    }).join('') + '<input type="hidden" id="' + name + '" value="' + def + '"></div>';
  }
  function bindChips(scope) {
    $$('.auc-chips', scope).forEach(function (grp) {
      var hidden = grp.querySelector('input[type=hidden]');
      $$('.auc-chip', grp).forEach(function (c) {
        c.addEventListener('click', function () {
          $$('.auc-chip', grp).forEach(function (x) { x.classList.remove('on'); });
          c.classList.add('on'); if (hidden) hidden.value = c.dataset.val;
        });
      });
    });
  }

  function submitConfig(l, sheet, closeSheet) {
    var startPrice = parseInt($('#aucStart', sheet).value, 10) || 0;
    var durH = parseInt($('#aucDur', sheet).value, 10) || 24;
    var startLocal = $('#aucStartAt', sheet).value;
    var inc = parseInt($('#aucInc', sheet).value, 10) || 10000;
    var reserve = parseInt($('#aucReserve', sheet).value, 10) || null;
    var elig = $('#aucElig', sheet).value || 'all';

    var startISO = localInputToISO(startLocal) || new Date().toISOString();
    var endISO = new Date(Date.parse(startISO) + durH * 3600000).toISOString();

    var payload = {
      listing_id: l.id,
      created_by: myUid() || null,
      start_price: startPrice > 0 ? startPrice : null,  // null이면 트리거가 30% 자동
      min_increment: inc,
      reserve_price: reserve,
      start_at: startISO,
      end_at: endISO,
      eligibility: elig
    };
    var go = $('#aucSheetGo', sheet);
    go.disabled = true; go.textContent = '예약 중…';
    createAuction(payload).then(function () {
      closeSheet();
      toast('경매를 예약했어요. 찜한 고객에게 알림이 나갑니다.');
      switchTab('live');
      refreshData().then(render);
    }).catch(function (e) {
      go.disabled = false; go.textContent = '경매 예약하기';
      alert('예약 실패: ' + (e.message || e) + '\n(auction.sql 실행 여부를 확인해 주세요.)');
    });
  }

  /* ---------- 토스트 ---------- */
  var tEl = null, tT = null;
  function toast(m) {
    if (!tEl) { tEl = document.createElement('div'); tEl.className = 'wish-toast'; document.body.appendChild(tEl); }
    tEl.textContent = m; tEl.classList.add('show');
    clearTimeout(tT); tT = setTimeout(function () { tEl.classList.remove('show'); }, 2200);
  }

  /* ---------- 진입점 ---------- */
  document.addEventListener('click', function (e) {
    if (e.target.closest('#adminAuctionBtn')) { e.preventDefault(); open(); }
  });

  window.BELLOREAuctionAdmin = { open: open, close: close };
})();
