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
  // 표시용 금액 — 단위 없이 "5,200,000원" (사장님 지침: 표시 화면엔 한글단위 X)
  function won(n) { return fmt(n) + '원'; }
  // 금액을 만/억 읽기로 — 금액 '입력칸' 보조 표기에서만 사용. 예: 1,400,000 → "140만원"
  function korMoney(n) {
    n = Math.floor(Math.abs(Number(n) || 0));
    if (n < 1) return '';
    var eok = Math.floor(n / 100000000);
    var man = Math.floor((n % 100000000) / 10000);
    var won0 = n % 10000;
    var s = '';
    if (eok) s += eok.toLocaleString('ko-KR') + '억';
    if (man) s += (s ? ' ' : '') + man.toLocaleString('ko-KR') + '만';
    if (won0) s += (s ? ' ' : '') + won0.toLocaleString('ko-KR') + '원';
    else s += '원';
    return s;
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
    if (st === 'ended' || st === 'canceled') return '';
    var target = st === 'scheduled' ? Date.parse(a.start_at) : Date.parse(a.end_at);
    var d = target - Date.now();
    if (d <= 0) return '';
    var pre = st === 'scheduled' ? '시작까지 ' : '종료까지 ';
    var days = Math.floor(d / 86400000); d -= days * 86400000;
    var h = Math.floor(d / 3600000); d -= h * 3600000;
    var m = Math.floor(d / 60000); d -= m * 60000;
    var s = Math.floor(d / 1000);
    // 초 단위까지 항상 표시
    if (days > 0) return pre + days + '일 ' + h + '시간 ' + m + '분 ' + s + '초';
    if (h > 0)    return pre + h + '시간 ' + m + '분 ' + s + '초';
    if (m > 0)    return pre + m + '분 ' + s + '초';
    return pre + s + '초';
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
  function updateAuction(id, patch) {
    return sb().from('auctions').update(patch).eq('id', id).select().single()
      .then(function (res) { if (res.error) throw res.error; return res.data; });
  }
  // 종료 시각 연장: 현재 종료시각(이미 지났으면 지금)에서 분 단위 추가
  function extendAuction(a, minutes) {
    var base = Math.max(Date.parse(a.end_at), Date.now());
    var end = new Date(base + minutes * 60000).toISOString();
    var patch = { end_at: end };
    if (a.status === 'ended') patch.status = 'live'; // 종료된 걸 다시 열며 연장
    return updateAuction(a.id, patch);
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
    if (!isAdmin()) { alert('관리자만 이용할 수 있습니다.'); return; }
    ensureRoot();
    root.hidden = false;
    document.body.style.overflow = 'hidden';
    tab = 'live';
    $$('.auc-tab', root).forEach(function (x) { x.classList.toggle('on', x.dataset.atab === 'live'); });
    renderLoading();
    refreshData().then(render);
    if (tick) clearInterval(tick);
    var beat = 0;
    tick = setInterval(function () {
      if (root.hidden) return;
      updateCountdowns();               // 매초 카운트다운(초 단위)
      if (++beat % 8 === 0 && tab === 'live') {  // 8초마다 데이터 갱신
        refreshData().then(function () { if (!root.hidden && tab === 'live') render(); });
      }
    }, 1000);
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
        '<p class="auc-empty">등록된 경매가 없습니다.<br>‘시계 목록에서 예약’ 탭에서 경매를 등록하세요.</p>';
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
            (a.eligibility === 'adult' ? '<span class="auc-badge auc-badge--adult">19세 이상</span>' : '') + '</div>' +
          '<p class="auc-name">' + esc((a.brand || '') + ' ' + (a.model || '')) + '</p>' +
          '<p class="auc-when">' + fmtWhen(a.start_at) + ' ~ ' + fmtWhen(a.end_at) +
            ' <span class="auc-remain" data-remain="' + esc(a.id) + '">' + remainText(a) + '</span></p>' +
        '</div>' +
      '</div>' +
      '<div class="auc-figures">' +
        fig('시세', a.retail_price ? won(a.retail_price) : '-') +
        fig('시작가', won(a.start_price)) +
        fig('현재가', cur ? won(cur) : '입찰 전') +
        fig('입찰', (a.bid_count || 0) + '회') +
        (floor ? fig(a.owner_role === 'partner' ? '최소낙찰' : '매입보장', won(floor)) : '') +
      '</div>' +
      (st === 'ended' && a.winner_id ? '<p class="auc-won">낙찰 ' + won(a.final_price) + '</p>' :
       st === 'ended' ? '<p class="auc-fail">유찰</p>' : '') +
      '<div class="auc-bidlist" data-bids="' + esc(a.id) + '" hidden></div>' +
      '<div class="auc-card-acts">' +
        '<button type="button" class="auc-mini" data-showbids="' + esc(a.id) + '">입찰 내역</button>' +
        '<button type="button" class="auc-mini" data-edit="' + esc(a.id) + '">수정 · 연장</button>' +
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
              '<span class="auc-bidwho">' + (b.is_floor ? '매입보장' : '응찰자 ' + String(b.bidder_id).slice(0, 6)) + '</span>' +
              '<b>' + won(b.amount) + '</b>' +
              '<span class="auc-bidtime">' + fmtWhen(b.created_at) + '</span>' +
            '</div>';
          }).join('') : '<p class="auc-empty">아직 입찰이 없어요.</p>';
        }).catch(function () { panel.innerHTML = '<p class="auc-empty">불러오기 실패</p>'; });
      });
    });
    $$('[data-edit]', box).forEach(function (btn) {
      btn.addEventListener('click', function () {
        var a = auctionsCache.filter(function (x) { return x.id === btn.dataset.edit; })[0];
        if (a) openEdit(a);
      });
    });
    $$('[data-end]', box).forEach(function (btn) {
      btn.addEventListener('click', function () {
        bellConfirm('이 경매를 지금 종료하시겠습니까? 현재 최고가로 낙찰 처리됩니다.', { title: '경매 종료', okText: '종료하기' }).then(function (ok) {
          if (!ok) return;
          endAuction(btn.dataset.end).then(function () { refreshData().then(render); })
            .catch(function (e) { alert('종료 실패: ' + (e.message || e)); });
        });
      });
    });
    $$('[data-cancel]', box).forEach(function (btn) {
      btn.addEventListener('click', function () {
        bellConfirm('예약된 경매를 취소하시겠습니까?', { title: '예약 취소', okText: '취소하기', cancelText: '닫기' }).then(function (ok) {
          if (!ok) return;
          cancelAuction(btn.dataset.cancel).then(function () { refreshData().then(render); })
            .catch(function (e) { alert('취소 실패: ' + (e.message || e)); });
        });
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
      box.innerHTML = '<p class="auc-empty">등록된 시계가 없습니다. 먼저 판매시계를 등록해 주세요.</p>';
      return;
    }
    // 진행중/예약된 경매가 이미 있는 매물 표시
    var activeByListing = {};
    auctionsCache.forEach(function (a) {
      var st = auctionState(a);
      if (st === 'live' || st === 'scheduled') activeByListing[a.listing_id] = st;
    });
    box.innerHTML =
      '<p class="auc-pick-hint">시계를 선택하면 경매 설정이 열립니다. 등록된 모든 시계가 자동 연동됩니다.</p>' +
      '<div class="auc-grid">' + listingsCache.map(function (l) {
        var badge = activeByListing[l.id];
        return '<button type="button" class="auc-pick" data-lid="' + esc(l.id) + '">' +
          '<div class="auc-pick-img">' + (l.img ? '<img src="' + esc(l.img) + '" alt="" loading="lazy">' : '') +
            (badge ? '<span class="auc-pick-flag auc-pick-flag--' + badge + '">' + STATE_LABEL[badge] + '</span>' : '') + '</div>' +
          '<p class="auc-pick-brand">' + esc(l.brand) + '</p>' +
          '<p class="auc-pick-model">' + esc(l.model) + '</p>' +
          '<p class="auc-pick-price">' + (l.price ? won(l.price) : '가격 미정') + '</p>' +
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
          '<p class="auc-when">시세 ' + (l.price ? won(l.price) : '-') + '</p></div>' +
          '<button type="button" class="auc-sheet-x" aria-label="닫기">×</button>' +
        '</div>' +
        '<div class="auc-sheet-body">' +
          field('판매가(입찰 시작가)', '<input type="number" id="aucStart" class="auc-money" value="' + startDefault + '" min="0" step="10000"><span class="auc-hint">비우면 시세의 30%로 자동 산정됩니다.</span>') +
          field('진행 시간', chips('aucDur', [['1','1시간'],['6','6시간'],['12','12시간'],['24','1일'],['72','3일']], '24')) +
          field('시작 시각', '<input type="datetime-local" id="aucStartAt" value="' + nowLocalInput() + '"><span class="auc-hint">지금으로 두면 즉시 시작, 미래 시각은 예약됩니다.</span>') +
          field('최소 입찰 단위', chips('aucInc', [['10000','1만'],['50000','5만'],['100000','10만'],['500000','50만']], '10000')) +
          field('최소 판매가 <em class="auc-sub">(이 금액 미만은 낙찰되지 않음 · 선택)</em>', '<input type="number" id="aucReserve" class="auc-money" placeholder="예: ' + (l.price ? Math.floor(l.price*0.6) : '') + '" min="0" step="10000"><span class="auc-hint">벨로르 매물은 매입 보장가, 파트너 매물은 최소 낙찰가로 적용됩니다.</span>') +
          field('누가 참여하나요?', chips('aucElig', [['all','누구나 참여'],['adult','19세 이상만(본인인증)']], 'all')) +
        '</div>' +
        '<div class="auc-sheet-acts">' +
          '<button type="button" class="auc-cancel" id="aucSheetCancel">취소</button>' +
          '<button type="button" class="auc-submit" id="aucSheetGo">경매 예약하기</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(sheet);
    bindChips(sheet);
    $$('.auc-money', sheet).forEach(moneyHintFor);
    var closeSheet = function () { if (sheet.parentNode) sheet.parentNode.removeChild(sheet); };
    sheet.querySelector('.auc-sheet-x').addEventListener('click', closeSheet);
    $('#aucSheetCancel', sheet).addEventListener('click', closeSheet);
    sheet.addEventListener('click', function (e) { if (e.target === sheet) closeSheet(); });
    $('#aucSheetGo', sheet).addEventListener('click', function () {
      submitConfig(l, sheet, closeSheet);
    });
  }

  // 금액 '입력칸'(.lp-money=상품등록, .auc-money=경매 설정) 오른쪽에 "= 140만원" 보조 표기
  function moneyHintFor(inp) {
    if (!inp) return;
    var n = parseInt(String(inp.value || '').replace(/[^0-9]/g, ''), 10) || 0;
    var host = (inp.closest && inp.closest('label')) || inp.parentNode;
    if (!host) return;
    var hint = host.querySelector('.money-kor-hint');
    if (!hint) { hint = document.createElement('span'); hint.className = 'money-kor-hint'; host.appendChild(hint); }
    hint.textContent = n > 0 ? '= ' + korMoney(n) : '';
  }
  // 금액 입력칸 어디서든(상품등록 .lp-money / 경매 .auc-money) 타이핑·포커스 시 보조표기
  document.addEventListener('input', function (e) {
    var inp = e.target && e.target.closest && e.target.closest('.lp-money, .auc-money');
    if (inp) moneyHintFor(inp);
  });
  document.addEventListener('focusin', function (e) {
    var inp = e.target && e.target.closest && e.target.closest('.lp-money, .auc-money');
    if (inp) moneyHintFor(inp);
  });

  /* ----- 경매 수정 · 연장 시트 (기존 경매) ----- */
  function openEdit(a) {
    var st = auctionState(a);
    var hasBids = (a.bid_count || 0) > 0;
    var sheet = document.createElement('div');
    sheet.className = 'auc-sheet';
    sheet.innerHTML =
      '<div class="auc-sheet-card">' +
        '<div class="auc-sheet-head">' +
          '<div class="auc-thumb">' + (a.image_url ? '<img src="' + esc(a.image_url) + '" alt="">' : '') + '</div>' +
          '<div><p class="auc-name">' + esc((a.brand || '') + ' ' + (a.model || '')) + '</p>' +
          '<p class="auc-when">' + STATE_LABEL[st] + ' · 현재가 ' + (a.current_price ? won(a.current_price) : '입찰 전') + '</p></div>' +
          '<button type="button" class="auc-sheet-x" aria-label="닫기">×</button>' +
        '</div>' +
        '<div class="auc-sheet-body">' +
          '<div class="auc-field"><label>종료 시각 연장</label>' +
            '<p class="auc-hint" style="margin:0 0 8px">현재 종료 ' + fmtWhen(a.end_at) + ' · <span data-endpreview></span></p>' +
            chips('edtExt', [['0','그대로'],['10','+10분'],['30','+30분'],['60','+1시간'],['1440','+1일']], '0') +
          '</div>' +
          (hasBids ? '' : field('판매가(시작가)', '<input type="number" id="edtStart" class="auc-money" value="' + (a.start_price || 0) + '" min="0" step="10000">')) +
          field('최소 입찰 단위', '<input type="number" id="edtInc" class="auc-money" value="' + (a.min_increment || 10000) + '" min="1000" step="1000">') +
          field('최소 판매가 <em class="auc-sub">(이 금액 미만은 낙찰되지 않음 · 선택)</em>', '<input type="number" id="edtReserve" class="auc-money" value="' + (a.reserve_price || '') + '" min="0" step="10000">') +
          field('누가 참여하나요?', chips('edtElig', [['all','누구나 참여'],['adult','19세 이상만(본인인증)']], a.eligibility === 'adult' ? 'adult' : 'all')) +
          (hasBids ? '<p class="auc-hint">이미 입찰이 있어 시작가는 변경할 수 없습니다. 연장·최소단위·최소판매가·참여자격은 변경 가능합니다.</p>' : '') +
        '</div>' +
        '<div class="auc-sheet-acts">' +
          '<button type="button" class="auc-cancel" data-edtcancel>닫기</button>' +
          '<button type="button" class="auc-submit" data-edtsave>저장하기</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(sheet);
    bindChips(sheet);
    $$('.auc-money', sheet).forEach(moneyHintFor);
    // 연장 미리보기
    var extHidden = sheet.querySelector('#edtExt');
    var preview = sheet.querySelector('[data-endpreview]');
    function updPreview() {
      var mins = parseInt(extHidden.value, 10) || 0;
      if (!mins) { preview.textContent = '연장 안 함'; return; }
      var base = Math.max(Date.parse(a.end_at), Date.now());
      preview.textContent = '→ ' + fmtWhen(new Date(base + mins * 60000).toISOString()) + ' 까지';
    }
    $$('.auc-chips[data-chip="edtExt"] .auc-chip', sheet).forEach(function (c) {
      c.addEventListener('click', function () { setTimeout(updPreview, 0); });
    });
    updPreview();
    var close = function () { if (sheet.parentNode) sheet.parentNode.removeChild(sheet); };
    sheet.querySelector('.auc-sheet-x').addEventListener('click', close);
    sheet.querySelector('[data-edtcancel]').addEventListener('click', close);
    sheet.addEventListener('click', function (e) { if (e.target === sheet) close(); });
    sheet.querySelector('[data-edtsave]').addEventListener('click', function () {
      var patch = {
        min_increment: parseInt($('#edtInc', sheet).value, 10) || 10000,
        reserve_price: parseInt($('#edtReserve', sheet).value, 10) || null,
        eligibility: $('#edtElig', sheet).value || 'all'
      };
      if (!hasBids) {
        var sp = parseInt($('#edtStart', sheet).value, 10) || 0;
        if (sp > 0) patch.start_price = sp;
      }
      var mins = parseInt($('#edtExt', sheet).value, 10) || 0;
      var save = sheet.querySelector('[data-edtsave]');
      save.disabled = true; save.textContent = '저장 중…';
      var chain = mins > 0 ? extendAuction(a, mins).then(function () { return updateAuction(a.id, patch); })
                           : updateAuction(a.id, patch);
      chain.then(function () {
        close(); toast('경매 설정이 저장되었습니다.' + (mins > 0 ? ' 종료 시각이 연장되었습니다.' : ''));
        refreshData().then(render);
      }).catch(function (e) {
        save.disabled = false; save.textContent = '저장하기';
        alert('저장 실패: ' + (e.message || e));
      });
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
      toast('경매가 등록되었습니다. 관심 고객에게 알림이 발송됩니다.');
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

  /* ============================================================
     고객용 경매 페이지 (누구나 · 쉬운 입찰)
     ============================================================ */
  var croot = null, cAuctions = [], cTick = null, cAmt = {}; // cAmt[auctionId] = 입찰하려는 금액

  function nextMin(a) {
    if (!a.current_price || (a.bid_count || 0) === 0) return a.start_price;
    return a.current_price + (a.min_increment || 10000);
  }
  function fetchPublicAuctions() {
    if (!sb()) return Promise.resolve([]);
    return sb().from('auctions').select('*')
      .neq('status', 'canceled')
      .order('start_at', { ascending: true }).limit(100)
      .then(function (res) { if (res.error) throw res.error; return res.data || []; });
  }
  function bidInsertDirect(auctionId, amount) {
    return sb().from('auction_bids').insert({
      auction_id: auctionId, bidder_id: myUid(), amount: amount, is_floor: false
    }).select().single().then(function (res) { if (res.error) throw res.error; return res.data; });
  }
  // wallet.sql 이 아직 안 올라간 경우(함수 없음)에만 직접 insert 로 폴백.
  function fnMissing(err) {
    var c = (err && err.code) || '', m = (err && err.message || '') + '';
    return c === 'PGRST202' || /Could not find the function|does not exist|schema cache/i.test(m);
  }
  function placeBid(auctionId, amount) {
    if (!sb()) return Promise.reject(new Error('NO_BACKEND'));
    if (walletCfg().enabled) {
      return sb().rpc('place_auction_bid', { p_auction: auctionId, p_amount: amount })
        .then(function (res) {
          if (res.error) {
            if (fnMissing(res.error)) return bidInsertDirect(auctionId, amount); // 스키마 미적용 폴백
            throw res.error;
          }
          return res.data;
        });
    }
    return bidInsertDirect(auctionId, amount);
  }

  /* ---------- 지갑(충전금) ---------- */
  var cWallet = null;
  function walletCfg() {
    return window.BELLORE_WALLET || { enabled: false, depositRate: 0.05, charge: {}, chargePresets: [] };
  }
  function depositFor(amount) { return Math.ceil((amount || 0) * (walletCfg().depositRate || 0.05)); }
  function fetchWallet() {
    if (!sb() || !myUid()) return Promise.resolve(null);
    return sb().from('wallets').select('balance,held').eq('user_id', myUid()).maybeSingle()
      .then(function (res) { return res.data || { balance: 0, held: 0 }; })
      .catch(function () { return null; });
  }
  function walletCharge(amount) {
    return sb().rpc('wallet_charge', { p_uid: myUid(), p_amount: amount, p_memo: '충전' })
      .then(function (res) { if (res.error) throw res.error; return res.data; });
  }
  function walletRefund(amount) {
    return sb().rpc('wallet_refund_request', { p_amount: amount })
      .then(function (res) { if (res.error) throw res.error; return res.data; });
  }

  function ensureCRoot() {
    if (croot) return croot;
    croot = document.createElement('div');
    croot.className = 'auc-cust';
    croot.hidden = true;
    croot.innerHTML =
      '<header class="auc-top">' +
        '<button type="button" class="auc-back" aria-label="닫기">' +
          '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>' +
        '</button>' +
        '<span class="auc-title">지금 경매</span><span style="width:22px"></span>' +
      '</header>' +
      '<div class="auc-cust-intro">벨로르가 정품을 검증한 시계 경매입니다. 원하시는 상품에 입찰하세요.</div>' +
      '<div class="auc-wallet" hidden></div>' +
      '<div class="auc-body auc-cust-body"></div>';
    document.body.appendChild(croot);
    croot.querySelector('.auc-back').addEventListener('click', closeCust);
    return croot;
  }

  function openCust() {
    ensureCRoot();
    croot.hidden = false;
    document.body.style.overflow = 'hidden';
    $('.auc-cust-body', croot).innerHTML = '<p class="auc-empty">불러오는 중…</p>';
    refreshCust();
    if (cTick) clearInterval(cTick);
    cTick = setInterval(function () {
      if (croot.hidden) return;
      // 카운트다운은 매초, 데이터는 6초마다
      updateCustCountdowns();
      if (Date.now() % 6000 < 1100) refreshCust(true);
    }, 1000);
  }
  function closeCust() {
    if (croot) croot.hidden = true;
    document.body.style.overflow = '';
    if (cTick) { clearInterval(cTick); cTick = null; }
  }
  function refreshCust(silent) {
    return Promise.all([fetchPublicAuctions(), fetchWallet()]).then(function (r) {
      cAuctions = r[0]; cWallet = r[1]; renderWallet(); renderMypageCash(); renderCust();
    }).catch(function () { if (!silent) $('.auc-cust-body', croot).innerHTML = dbHelp(); });
  }

  function renderWallet() {
    var bar = $('.auc-wallet', croot); if (!bar) return;
    if (!walletCfg().enabled || !myUid()) { bar.hidden = true; return; }
    bar.hidden = false;
    var bal = (cWallet && cWallet.balance) || 0, held = (cWallet && cWallet.held) || 0;
    bar.innerHTML =
      '<div class="auc-w-left"><span>벨로르 캐시</span><b>' + won(bal) + '</b>' +
        (held > 0 ? '<em>예약금 ' + fmt(held) + '원 잠김</em>' : '') + '</div>' +
      '<div class="auc-w-acts">' +
        '<button type="button" class="auc-w-btn" data-wcharge>충전</button>' +
        (bal > 0 ? '<button type="button" class="auc-w-btn auc-w-btn--ghost" data-wrefund>환불</button>' : '') +
      '</div>';
  }

  // 마이페이지 벨로르 캐시 카드
  function renderMypageCash() {
    var box = document.getElementById('mpCashCard'); if (!box) return;
    if (!walletCfg().enabled || !myUid()) { box.hidden = true; return; }
    box.hidden = false;
    var bal = (cWallet && cWallet.balance) || 0, held = (cWallet && cWallet.held) || 0;
    box.innerHTML =
      '<div class="mpcash-row">' +
        '<div class="mpcash-left"><span>벨로르 캐시</span>' +
          '<b>' + fmt(bal) + '<em>원</em></b>' +
          (held > 0 ? '<i class="mpcash-held">예약금 ' + fmt(held) + '원 잠김</i>' : '') + '</div>' +
        '<div class="mpcash-acts">' +
          '<button type="button" class="mpcash-btn" data-wcharge>충전</button>' +
          (bal > 0 ? '<button type="button" class="mpcash-btn mpcash-btn--ghost" data-wrefund>환불</button>' : '') +
        '</div>' +
      '</div>' +
      '<p class="mpcash-note">충전 후 경매 예약금 및 상품 구매에 사용할 수 있으며, 캐시 결제 시 1% 즉시 할인이 적용됩니다.</p>';
  }

  // 지갑 데이터 1회 조회 → 경매 바 + 마이페이지 카드 동시 갱신
  function refreshWalletUI() {
    if (!walletCfg().enabled) return Promise.resolve();
    return fetchWallet().then(function (w) { cWallet = w; renderWallet(); renderMypageCash(); });
  }

  /* ---------- 충전 시트 ---------- */
  function openChargeSheet() {
    if (!myUid()) { toast('로그인 후 이용하실 수 있습니다.'); openLoginIfPossible(); return; }
    var W = walletCfg();
    var presets = W.chargePresets || [50000, 100000, 300000, 500000];
    var isAdm = isAdmin();
    var canPay = !!(W.charge && (W.charge.card || W.charge.transfer));
    var sheet = document.createElement('div');
    sheet.className = 'auc-sheet';
    sheet.innerHTML =
      '<div class="auc-sheet-card">' +
        '<div class="auc-sheet-head"><div><p class="auc-name">벨로르 캐시 충전</p>' +
          '<p class="auc-when">현재 잔액 ' + fmt((cWallet && cWallet.balance) || 0) + '원</p></div>' +
          '<button type="button" class="auc-sheet-x" aria-label="닫기">×</button></div>' +
        '<div class="auc-sheet-body">' +
          field('충전 금액', chips('chgAmt', presets.map(function (p) { return [String(p), fmt(p) + '원']; }), String(presets[1] || presets[0])) +
            '<span class="auc-hint">벨로르 캐시는 언제든 환불 가능하며, 경매 예약금 및 상품 구매에 사용됩니다.</span>') +
          (canPay ? field('결제 수단', chips('chgPay', [['card', '신용·체크카드'], ['transfer', '계좌이체']].filter(function (o) { return W.charge[o[0]]; }), (W.charge.card ? 'card' : 'transfer'))) : '') +
          (!canPay && !isAdm ? '<p class="auc-note">카드·계좌이체 충전은 결제 연동 승인 후 제공됩니다.</p>' : '') +
          (isAdm ? '<p class="auc-hint">관리자 전용 · 즉시 충전(테스트)</p>' : '') +
        '</div>' +
        '<div class="auc-sheet-acts">' +
          '<button type="button" class="auc-cancel" data-chgcancel>취소</button>' +
          '<button type="button" class="auc-submit" data-chggo>' + (isAdm ? '즉시 충전(테스트)' : '충전하기') + '</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(sheet);
    bindChips(sheet);
    var close = function () { if (sheet.parentNode) sheet.parentNode.removeChild(sheet); };
    sheet.querySelector('.auc-sheet-x').addEventListener('click', close);
    sheet.querySelector('[data-chgcancel]').addEventListener('click', close);
    sheet.addEventListener('click', function (e) { if (e.target === sheet) close(); });
    sheet.querySelector('[data-chggo]').addEventListener('click', function () {
      var amt = parseInt($('#chgAmt', sheet).value, 10) || 0;
      if (amt <= 0) { toast('충전 금액을 선택해 주세요.'); return; }
      if (isAdm) {
        walletCharge(amt).then(function () { close(); toast(fmt(amt) + '원이 충전되었습니다.'); refreshWalletUI(); })
          .catch(function (e) { alert('충전 실패: ' + (e.message || e) + '\n(wallet.sql 실행 여부 확인)'); });
      } else if (canPay) {
        // 포트원 충전 연동 지점(승인 후): 결제창 → 검증 → wallet_charge(service_role)
        toast('카드 결제 연동 준비 중입니다.');
      } else {
        toast('카드 충전은 결제 연동 승인 후 제공됩니다.');
      }
    });
  }

  function doRefund() {
    var bal = (cWallet && cWallet.balance) || 0;
    if (bal <= 0) { toast('환불 가능한 벨로르 캐시가 없습니다.'); return; }
    bellConfirm('벨로르 캐시 ' + won(bal) + ' 전액을 환불 신청하시겠습니까?\n(예치된 예약금은 제외됩니다)',
      { title: '캐시 환불', okText: '환불 신청', cancelText: '닫기' }).then(function (ok) {
      if (!ok) return;
      walletRefund(bal).then(function () { toast('환불 신청이 접수되었습니다. 등록된 계좌로 지급됩니다.'); refreshWalletUI(); })
        .catch(function (e) { alert('환불 실패: ' + (e.message || e)); });
    });
  }

  function renderCust() {
    if (!croot) return;
    var box = $('.auc-cust-body', croot);
    var live = [], soon = [], done = [];
    cAuctions.forEach(function (a) {
      var st = auctionState(a);
      if (st === 'live') live.push(a);
      else if (st === 'scheduled') soon.push(a);
      else done.push(a);
    });
    done.sort(function (a, b) { return Date.parse(b.end_at) - Date.parse(a.end_at); });
    var html = '';
    if (live.length) html += '<h3 class="auc-cust-sec">진행 중</h3>' + live.map(custCard).join('');
    if (soon.length) html += '<h3 class="auc-cust-sec">곧 시작</h3>' + soon.map(custCard).join('');
    if (done.length) html += '<h3 class="auc-cust-sec">지난 경매</h3>' + done.slice(0, 6).map(custCard).join('');
    box.innerHTML = html || '<p class="auc-empty">현재 진행 중인 경매가 없습니다.<br>관심 상품을 찜해 두시면 경매 시작 시 알림을 보내드립니다.</p>';
    bindCustActions(box);
    updateCustCountdowns();
  }

  function discountPct(a) {
    if (!a.retail_price) return 0;
    var base = a.current_price || a.start_price;
    return Math.max(0, Math.round((1 - base / a.retail_price) * 100));
  }
  function custCard(a) {
    var st = auctionState(a);
    var mine = myUid() && a.current_bidder === myUid();
    var nm = nextMin(a);
    var want = cAmt[a.id] || nm;
    if (want < nm) want = nm;
    var pct = discountPct(a);
    var name = esc((a.brand || '') + ' ' + (a.model || ''));
    var body;
    if (st === 'live') {
      var curp = a.current_price || a.start_price;
      body =
        '<div class="auc-c-pricebox">' +
          '<span class="auc-c-plabel">현재가</span>' +
          '<span class="auc-c-price">' + fmt(curp) + '<em>원</em></span>' +
          (pct > 0 ? '<span class="auc-c-off">시세 대비 ' + pct + '% 낮음</span>' : '') +
        '</div>' +
        (mine ? '<p class="auc-c-mine">현재 최고 입찰자입니다.</p>' : '') +
        '<div class="auc-c-stepper">' +
          '<button type="button" class="auc-c-step" data-step="-" data-aid="' + esc(a.id) + '">－</button>' +
          '<div class="auc-c-stepamt"><span>입찰가</span><b data-wantamt="' + esc(a.id) + '">' + won(want) + '</b></div>' +
          '<button type="button" class="auc-c-step" data-step="+" data-aid="' + esc(a.id) + '">＋</button>' +
        '</div>' +
        '<button type="button" class="auc-c-bid" data-bid="' + esc(a.id) + '">이 금액으로 입찰하기</button>' +
        '<p class="auc-c-hint">＋/－ 버튼으로 ' + fmt(a.min_increment || 10000) + '원씩 조정 · 최소 입찰가 ' + fmt(nm) + '원</p>' +
        (walletCfg().enabled ? '<p class="auc-c-deposit">입찰 시 예약금 5%(' + fmt(depositFor(want)) + '원)가 예치되며, 상위 입찰 시 자동 환불됩니다. 낙찰 후 구매 취소 시에만 환불되지 않습니다.</p>' : '');
    } else if (st === 'scheduled') {
      body =
        '<div class="auc-c-pricebox">' +
          '<span class="auc-c-plabel">시작가</span>' +
          '<span class="auc-c-price">' + fmt(a.start_price) + '<em>원</em></span>' +
          (a.retail_price ? '<span class="auc-c-off">시세 ' + won(a.retail_price) + '</span>' : '') +
        '</div>' +
        '<p class="auc-c-soon">' + fmtWhen(a.start_at) + ' 시작 예정</p>';
    } else {
      body = a.winner_id
        ? '<p class="auc-c-result auc-c-result--won">' + won(a.final_price) + '에 낙찰 완료</p>'
        : '<p class="auc-c-result">유찰 (낙찰자 없음)</p>';
    }
    return '<div class="auc-c-card" data-cardid="' + esc(a.id) + '">' +
      '<div class="auc-c-top">' +
        '<div class="auc-c-thumb">' + (a.image_url ? '<img src="' + esc(a.image_url) + '" alt="">' : '') + '</div>' +
        '<div class="auc-c-info">' +
          '<div class="auc-badges">' +
            '<span class="auc-badge auc-badge--' + st + '">' + STATE_LABEL[st] + '</span>' +
            (a.eligibility === 'adult' ? '<span class="auc-badge auc-badge--adult">19세 이상</span>' : '') + '</div>' +
          '<p class="auc-c-name">' + name + '</p>' +
          (st !== 'ended' ? '<p class="auc-c-remain" data-cremain="' + esc(a.id) + '">' + remainText(a) + '</p>' : '') +
        '</div>' +
      '</div>' + body +
    '</div>';
  }

  function bindCustActions(box) {
    $$('.auc-c-step', box).forEach(function (btn) {
      btn.addEventListener('click', function () {
        var a = cAuctions.filter(function (x) { return x.id === btn.dataset.aid; })[0]; if (!a) return;
        var nm = nextMin(a), inc = a.min_increment || 10000;
        var cur = cAmt[a.id] || nm;
        cur = btn.dataset.step === '+' ? cur + inc : Math.max(nm, cur - inc);
        cAmt[a.id] = cur;
        var el = box.querySelector('[data-wantamt="' + a.id + '"]');
        if (el) el.innerHTML = won(cur);
      });
    });
    $$('[data-bid]', box).forEach(function (btn) {
      btn.addEventListener('click', function () { doCustBid(btn.dataset.bid, btn); });
    });
  }

  function doCustBid(auctionId, btn) {
    var a = cAuctions.filter(function (x) { return x.id === auctionId; })[0]; if (!a) return;
    if (!myUid()) { toast('로그인 후 이용하실 수 있습니다.'); openLoginIfPossible(); return; }
    if (a.eligibility === 'adult') {
      var ok = false; try { ok = !!(B() && B().phoneVerified && B().phoneVerified()); } catch (e) {}
      if (!ok) { alert('본 경매는 만 19세 이상만 참여할 수 있습니다.\n휴대폰 본인인증 후 이용해 주세요.'); return; }
    }
    var amount = cAmt[auctionId] || nextMin(a);
    var msg = won(amount) + '에 입찰하시겠습니까?';
    if (walletCfg().enabled) {
      msg += '\n\n입찰 시 예약금 ' + won(depositFor(amount)) + '(5%)이 벨로르 캐시에서 예치됩니다.' +
             '\n· 상위 입찰 시 또는 낙찰되지 않으면 전액 환불됩니다' +
             '\n· 낙찰 후 구매를 취소하는 경우에만 환불되지 않습니다';
    } else {
      msg += '\n낙찰 시 결제가 진행됩니다.';
    }
    bellConfirm(msg, { title: '입찰 확인', okText: '입찰하기', cancelText: '취소' }).then(function (agree) {
      if (!agree) return;
      btn.disabled = true; btn.textContent = '입찰 중…';
      placeBid(auctionId, amount).then(function () {
        delete cAmt[auctionId];
        toast('입찰이 완료되었습니다. 현재 최고 입찰가입니다.');
        refreshCust();
      }).catch(function (e) {
        btn.disabled = false; btn.textContent = '이 금액으로 입찰하기';
        var m = (e && e.message) ? e.message : '입찰에 실패했어요.';
        if (m.indexOf('NEED_CHARGE') >= 0) {
          toast(m.replace(/^.*NEED_CHARGE:/, ''));
          refreshCust(); openChargeSheet(); return;
        }
        alert(m);
        refreshCust();
      });
    });
  }
  function openLoginIfPossible() {
    var t = document.querySelector('[data-nav="mypage"], #headerProfile, #myPageBtn');
    if (t) { closeCust(); t.click(); }
  }

  function updateCustCountdowns() {
    if (!croot || croot.hidden) return;
    var map = {}; cAuctions.forEach(function (a) { map[a.id] = a; });
    $$('[data-cremain]', croot).forEach(function (el) {
      var a = map[el.dataset.cremain]; if (a) el.textContent = remainText(a);
    });
  }

  /* ---------- 진입점 ---------- */
  document.addEventListener('click', function (e) {
    if (e.target.closest('#adminAuctionBtn')) { e.preventDefault(); open(); return; }
    if (e.target.closest('[data-wcharge]')) { e.preventDefault(); openChargeSheet(); return; }
    if (e.target.closest('[data-wrefund]')) { e.preventDefault(); doRefund(); return; }
    if (e.target.closest('[data-auction-open]')) { e.preventDefault(); openCust(); return; }
  });

  // 마이페이지 진입/로그인 변화 시 캐시 카드 갱신
  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-nav="mypage"], #headerProfile, #myPageBtn')) setTimeout(refreshWalletUI, 120);
  }, true);
  function initWallet() {
    if (B() && B().onAuthChange) { B().onAuthChange(function () { refreshWalletUI(); }); return true; }
    return false;
  }
  if (!initWallet()) {
    var wtries = 0, wt = setInterval(function () { if (initWallet() || ++wtries > 20) clearInterval(wt); }, 200);
  }
  setTimeout(refreshWalletUI, 800);

  window.BELLOREAuctionAdmin = { open: open, close: close };
  window.BELLOREAuction = { open: openCust, close: closeCust, refreshWallet: refreshWalletUI };
})();
