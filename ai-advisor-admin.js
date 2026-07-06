/* ============================================================
   벨로르(BELLORE) · 관리자 "AI 고객비서" 화면
   ------------------------------------------------------------
   - 관리자 마이페이지 '관리' 메뉴에 'AI 고객비서' 항목을 주입하고,
     전체화면 패널(#aiAdminPanel)을 자체 렌더한다(기존 script.js 미수정).
   - 탭: 고객 프로필 / 대화 로그 / 알림 후보 / 전문가 지식 / 팀 메시지
   - 데이터는 window.sbClient(Supabase) 로 직접 조회. 관리자 RLS 가 전체 허용.
   ============================================================ */
(function () {
  'use strict';
  function $(s, c) { return (c || document).querySelector(s); }
  function $$(s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function B() { return window.NWBackend; }
  function sb() { return window.sbClient || null; }
  function isAdmin() {
    try {
      if (window.BELLORE_isAdmin) return true; // script.js 가 판정한 값(부트스트랩 이메일 포함)
      return !!(B() && B().isAdmin && B().isAdmin());
    } catch (e) { return false; }
  }
  function AI() { return window.BelloreAI || {}; }
  function krw(n) { return (AI().krwShort ? AI().krwShort(n) : (n == null ? '-' : Number(n).toLocaleString())); }
  function fmtDate(s) { var d = new Date(s); return isNaN(d) ? '-' : (d.getFullYear() + '.' + (d.getMonth() + 1) + '.' + d.getDate() + ' ' + ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2)); }

  var STAGE = (AI().STAGE_LABEL) || { browsing: '둘러보는 중', considering: '가격 비교 중', high_intent: '매물 찾는 중', ready_to_buy: '구매 임박', sell_intent: '판매 문의', unknown: '미상' };

  /* ---------------- 스타일 ---------------- */
  function injectStyles() {
    if ($('#bellore-aiadmin-style')) return;
    var css = ''
      + '#aiAdminPanel{position:fixed;top:0;bottom:0;left:50%;transform:translateX(-50%);width:100%;max-width:var(--app-w);z-index:6200;display:none;background:#fff;box-shadow:0 0 60px rgba(0,0,0,.28);font-family:Pretendard,-apple-system,sans-serif}'
      + '#aiAdminPanel.show{display:flex;flex-direction:column}'
      + '.aia-top{display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid #e5e3df}'
      + '.aia-top .aia-back{background:none;border:none;font-size:24px;color:#1a1a1a;cursor:pointer;line-height:1}'
      + '.aia-top b{font-size:16px;font-weight:700}'
      + '.aia-tabs{display:flex;gap:6px;padding:10px 12px;border-bottom:1px solid #e5e3df;overflow-x:auto}'
      + '.aia-tab{flex:0 0 auto;padding:8px 13px;border:1px solid #e5e3df;border-radius:18px;background:#fff;font:600 13px Pretendard;color:#6b6b6b;cursor:pointer;white-space:nowrap}'
      + '.aia-tab.on{background:#111;color:#fff;border-color:#111}'
      + '.aia-body{flex:1;overflow:auto;padding:14px 14px 40px;background:#f7f6f3}'
      + '.aia-card{background:#fff;border:1px solid #e5e3df;border-radius:14px;padding:14px;margin:0 auto 10px;max-width:720px;cursor:pointer}'
      + '.aia-card.nohover{cursor:default}'
      + '.aia-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}'
      + '.aia-name{font-size:15px;font-weight:700;color:#1a1a1a}'
      + '.aia-sub{font-size:12px;color:#6b6b6b;margin-top:3px;line-height:1.5}'
      + '.aia-tag{display:inline-block;padding:3px 9px;border-radius:12px;background:#f2f3f5;font:600 12px Pretendard;color:#1a1a1a}'
      + '.aia-tag.brand{background:#eef4ff;color:#2d5fd0}'
      + '.aia-tag.stage{background:#eafaf0;color:#16a34a}'
      + '.aia-tag.warn{background:#fff0e6;color:#d97326}'
      + '.aia-bar{height:6px;border-radius:3px;background:#eceae6;overflow:hidden;flex:1;min-width:80px}'
      + '.aia-bar > i{display:block;height:100%;background:#111}'
      + '.aia-meta{font-size:11px;color:#9a9a9a;margin-top:6px}'
      + '.aia-empty{text-align:center;color:#9a9a9a;font-size:13px;padding:40px 0}'
      + '.aia-sec{max-width:720px;margin:0 auto 14px}'
      + '.aia-sec h5{font-size:13px;font-weight:700;color:#6b6b6b;margin:14px auto 8px;max-width:720px}'
      + '.aia-msg{padding:9px 12px;border-radius:10px;margin:6px 0;font-size:13px;line-height:1.5;max-width:85%}'
      + '.aia-msg.user{background:#111;color:#fff;margin-left:auto}'
      + '.aia-msg.assistant,.aia-msg.admin{background:#fff;border:1px solid #e5e3df}'
      + '.aia-msg.system{background:#f2f3f5;color:#6b6b6b;font-size:12px}'
      + '.aia-btns{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}'
      + '.aia-btn{padding:8px 14px;border:1px solid #e5e3df;border-radius:10px;background:#fff;font:600 13px Pretendard;cursor:pointer}'
      + '.aia-btn.pri{background:#111;color:#fff;border-color:#111}'
      + '.aia-btn.dng{color:#d14343;border-color:#f0c9c9}'
      + '.aia-score{font:700 14px Pretendard;color:#111}'
      + '.aia-detail-back{font-size:13px;color:#2d5fd0;cursor:pointer;margin-bottom:10px;display:inline-block}'
      + '.aia-note{max-width:720px;margin:0 auto 10px;font-size:12px;color:#9a9a9a;line-height:1.6}'
      + '.aia-team-imgs{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}'
      + '.aia-team-imgs img{width:96px;height:96px;object-fit:cover;border-radius:10px;border:1px solid #e5e3df}'
      + '.aia-2col{max-width:720px;margin:0 auto;display:grid;grid-template-columns:1fr 1fr;gap:12px}'
      + '@media(max-width:560px){.aia-2col{grid-template-columns:1fr}}';
    var st = document.createElement('style'); st.id = 'bellore-aiadmin-style'; st.textContent = css;
    document.head.appendChild(st);
  }

  /* ---------------- 패널 골격 ---------------- */
  // '고객 프로필' 은 회원관리(회원관리 · AI 고객분석) 화면으로 흡수됨.
  // 여기(AI 상담 설정)에는 AI 세팅·운영 탭만 남긴다. 개별 고객 상세(renderProfileDetail)는
  // 회원 카드의 '상세·대화 보기'에서 openProfileDetail 로 진입한다.
  var TABS = [
    { k: 'settings', t: 'AI 상담 설정' },
    { k: 'conversations', t: '대화 로그' },
    { k: 'alerts', t: '알림 후보' },
    { k: 'knowledge', t: '전문가 지식' },
    { k: 'market', t: '시세 인사이트' },
    { k: 'team', t: '팀 메시지' },
    { k: 'guidelines', t: '답변 참고서' }
  ];
  var panel, bodyEl, curTab = 'settings', _fromMember = false;

  function buildPanel() {
    injectStyles();
    panel = document.createElement('div');
    panel.id = 'aiAdminPanel';
    panel.innerHTML =
      '<div class="aia-top">' +
        '<button class="aia-back" type="button" aria-label="닫기">‹</button>' +
        '<b>AI 고객비서</b>' +
      '</div>' +
      '<div class="aia-tabs">' +
        TABS.map(function (x) { return '<button class="aia-tab' + (x.k === curTab ? ' on' : '') + '" data-tab="' + x.k + '">' + x.t + '</button>'; }).join('') +
      '</div>' +
      '<div class="aia-body" id="aiaBody"></div>';
    document.body.appendChild(panel);
    bodyEl = $('#aiaBody');
    panel.querySelector('.aia-back').addEventListener('click', close);
    panel.addEventListener('click', function (e) {
      var tab = e.target.closest('.aia-tab');
      if (tab) { setTab(tab.dataset.tab); return; }
      var card = e.target.closest('[data-profile-id]');
      if (card && curTab === 'profiles') { renderProfileDetail(card.dataset.profileId); return; }
      var act = e.target.closest('[data-act]');
      if (act) handleAction(act);
    });
  }

  function open() {
    if (!panel) buildPanel();
    if (panel.classList.contains('show')) return;
    panel.classList.add('show');
    document.body.style.overflow = 'hidden';
    try { history.pushState({ aiAdmin: 1 }, ''); } catch (e) {}
    setTab(curTab);
  }
  // 회원관리(회원 · AI 고객분석) 카드의 '상세·대화 보기' → 특정 고객 AI 상세로 바로 진입.
  function openProfileDetail(pid) {
    if (!panel) buildPanel();
    _fromMember = true;
    if (!panel.classList.contains('show')) {
      panel.classList.add('show');
      document.body.style.overflow = 'hidden';
      try { history.pushState({ aiAdmin: 1 }, ''); } catch (e) {}
    }
    var tb = panel.querySelector('.aia-top b'); if (tb) tb.textContent = '고객 AI 분석';
    renderProfileDetail(pid);
  }
  function close(fromPop) {
    if (!panel || !panel.classList.contains('show')) return;
    panel.classList.remove('show'); document.body.style.overflow = '';
    if (!fromPop) { try { if (history.state && history.state.aiAdmin) history.back(); } catch (e) {} }
  }
  window.addEventListener('popstate', function () {
    if (panel && panel.classList.contains('show')) close(true);
  });

  function setTab(k) {
    curTab = k;
    _fromMember = false;
    var _tb = panel && panel.querySelector('.aia-top b'); if (_tb) _tb.textContent = 'AI 고객비서';
    $$('.aia-tab', panel).forEach(function (b) { b.classList.toggle('on', b.dataset.tab === k); });
    bodyEl.scrollTop = 0;
    bodyEl.innerHTML = '<div class="aia-empty">불러오는 중…</div>';
    if (k === 'settings') renderSettings();
    else if (k === 'profiles') renderProfiles();
    else if (k === 'conversations') renderConversations();
    else if (k === 'alerts') renderAlerts();
    else if (k === 'knowledge') renderKnowledge();
    else if (k === 'market') renderMarket();
    else if (k === 'team') renderTeam();
    else if (k === 'guidelines') renderGuidelines();
  }

  function guard() {
    if (!sb()) { bodyEl.innerHTML = '<div class="aia-empty">백엔드 연결이 필요합니다. (Supabase 미설정)</div>'; return false; }
    return true;
  }
  function sqlHint(err) {
    return '<div class="aia-empty">데이터를 불러오지 못했습니다.<br><span style="font-size:12px">' +
      esc((err && err.message) || '') + '<br>ai_advisor.sql 을 Supabase SQL Editor 에 실행했는지 확인하세요.</span></div>';
  }

  /* ---------------- 0) AI 상담 설정 (수집 데이터 + 참고서 + 개선점) ---------------- */
  function cnt(table, build) {
    var q = sb().from(table).select('*', { count: 'exact', head: true });
    if (build) q = build(q);
    return q.then(function (r) { return r.count || 0; }).catch(function () { return 0; });
  }
  function renderSettings() {
    if (!guard()) return;
    bodyEl.innerHTML = '<div class="aia-empty">수집 현황 집계 중…</div>';
    var stat = {};
    Promise.all([
      cnt('customer_ai_profiles'),
      cnt('ai_conversations'),
      cnt('customer_events'),
      cnt('ai_response_guidelines', function (q) { return q.eq('is_active', true); }),
      cnt('expert_knowledge_notes'),
      cnt('team_messages'),
      cnt('ai_alert_candidates', function (q) { return q.eq('status', 'pending'); })
    ]).then(function (c) {
      stat = { profiles: c[0], convs: c[1], events: c[2], guides: c[3], knowledge: c[4], team: c[5], alerts: c[6] };
      // 관심 브랜드 Top / 단계 분포 (표본 조회)
      return sb().from('customer_ai_profiles').select('preferred_brands,buying_stage').limit(500);
    }).then(function (res) {
      var rows = (res && res.data) || [];
      var brandCnt = {}, stageCnt = {};
      rows.forEach(function (p) {
        (p.preferred_brands || []).forEach(function (b) { brandCnt[b] = (brandCnt[b] || 0) + 1; });
        var s = p.buying_stage || 'unknown'; stageCnt[s] = (stageCnt[s] || 0) + 1;
      });
      var topBrands = Object.keys(brandCnt).sort(function (a, b) { return brandCnt[b] - brandCnt[a]; }).slice(0, 6);
      paintSettings(stat, topBrands, brandCnt, stageCnt);
    }).catch(function (e) { bodyEl.innerHTML = sqlHint(e); });
  }
  function statTile(label, val, sub) {
    return '<div style="flex:1;min-width:96px;background:#fff;border:1px solid #e5e3df;border-radius:12px;padding:12px">' +
      '<div style="font:700 22px Pretendard;color:#111">' + val + '</div>' +
      '<div class="aia-sub" style="margin-top:2px">' + esc(label) + '</div>' + (sub ? ('<div class="aia-meta">' + esc(sub) + '</div>') : '') + '</div>';
  }
  function paintSettings(s, topBrands, brandCnt, stageCnt) {
    var html = '<div class="aia-note">AI 상담의 두뇌 상태를 한눈에 보는 화면이에요. 수집 현황을 보고, 참고서를 관리하고, AI가 학습한 내용·궁금한 점을 확인하세요.</div>';
    html += '<h5>지금까지 수집·파악한 데이터</h5>';
    html += '<div class="aia-sec" style="display:flex;gap:8px;flex-wrap:wrap">' +
      statTile('고객 프로필', s.profiles) + statTile('대화', s.convs) + statTile('행동 로그', s.events) +
      statTile('전문가 지식', s.knowledge) + statTile('Discord 수집', s.team) + '</div>';
    html += '<div class="aia-2col">' +
      '<div><h5>관심 브랜드 Top</h5><div class="aia-card nohover">' +
        (topBrands.length ? topBrands.map(function (b) { return '<span class="aia-tag brand" style="margin:3px">' + esc(b) + ' ' + brandCnt[b] + '</span>'; }).join(' ') : '<span class="aia-sub">아직 데이터가 적습니다.</span>') + '</div></div>' +
      '<div><h5>구매단계 분포</h5><div class="aia-card nohover">' +
        (Object.keys(stageCnt).length ? Object.keys(stageCnt).map(function (k) { return '<div class="aia-sub">' + esc(STAGE[k] || k) + ': <b>' + stageCnt[k] + '</b></div>'; }).join('') : '<span class="aia-sub">-</span>') + '</div></div>' +
      '</div>';
    html += '<h5>답변 참고서</h5><div class="aia-card nohover">' +
      '<div class="aia-sub">참고서 <b>' + s.guides + '</b>개를 AI가 학습해 답변에 반영 중이에요.</div>' +
      '<div class="aia-btns"><button class="aia-btn pri" data-act="go-guidelines">참고서 관리</button>' +
      '<button class="aia-btn" data-act="go-alerts">발송 대기 알림 ' + s.alerts + '건</button></div></div>';
    html += '<h5>오늘 학습한 내용 <span class="aia-meta" style="font-weight:400">(AI가 대화에서 알아낸 고객 특징)</span></h5>';
    html += '<div class="aia-sec"><button class="aia-btn pri" data-act="ai-learn-now">대화에서 지금 학습하기 (AI 실행)</button></div>';
    html += '<div id="aiaLearned"><div class="aia-note">불러오는 중…</div></div>';
    html += '<h5>확인할 내용 <span class="aia-meta" style="font-weight:400">(대화 중 막혔던 질문 + AI가 궁금해하는 것을 한곳에)</span></h5>';
    html += '<div id="aiaConfirm"><div class="aia-note">불러오는 중…</div></div>';
    bodyEl.innerHTML = html;
    loadLearned();
    loadConfirmations();
  }
  // AI가 대화에서 뽑은 장기 메모리(학습 후보) — 유지/삭제로 관리. '궁금한 점'은 확인할 내용 쪽으로 옮겨감.
  function loadLearned() {
    var box = $('#aiaLearned'); if (!box) return;
    sb().from('ai_customer_memories').select('id,memory_type,content,confidence,created_at,profile_id')
      .neq('memory_type', 'question').order('created_at', { ascending: false }).limit(40)
      .then(function (res) {
        if (res.error) { box.innerHTML = '<div class="aia-note">' + esc(res.error.message) + '</div>'; return; }
        var rows = res.data || [];
        var MEM_KO = { preference: '선호', budget: '예산', personality: '성향', risk: '안전성향', brand_interest: '브랜드 관심', buying_intent: '구매의향' };
        box.innerHTML = rows.length ? rows.map(function (m) {
          return '<div class="aia-card nohover"><div class="aia-row">' +
            '<span class="aia-tag brand">' + esc(MEM_KO[m.memory_type] || m.memory_type) + '</span>' +
            '<span class="aia-meta" style="margin-left:auto;margin-top:0">확신 ' + (m.confidence || 0) + ' · ' + fmtDate(m.created_at) + '</span></div>' +
            '<div class="aia-sub" style="margin-top:6px">' + esc(m.content) + '</div>' +
            '<div class="aia-btns"><button class="aia-btn pri" data-act="mem-keep" data-id="' + esc(m.id) + '">학습 유지</button>' +
            '<button class="aia-btn dng" data-act="mem-del" data-id="' + esc(m.id) + '">삭제</button></div></div>';
        }).join('') : '<div class="aia-note">아직 학습한 내용이 없어요. 위 "지금 학습하기"를 누르면 AI가 최근 대화를 분석해 고객별 특징을 뽑아줍니다.</div>';
      }).catch(function (e) { box.innerHTML = '<div class="aia-note">' + esc(String(e)) + '</div>'; });
  }
  // 통합 '확인할 내용' — 대화중 막혔던 질문(ai_conversations) + AI가 궁금해하는 것(ai_customer_memories)
  // 을 한 목록으로 합쳐 보여준다. 소스만 배지로 구분(중복 UI 제거).
  function loadConfirmations() {
    var box = $('#aiaConfirm'); if (!box) return;
    var items = [];
    sb().from('ai_conversations').select('id,message,created_at')
      .eq('role', 'user').filter('metadata->>needs_review', 'eq', 'true')
      .order('created_at', { ascending: false }).limit(60)
      .then(function (res) {
        if (res.error) throw res.error;
        var groups = {}, order = [];
        (res.data || []).forEach(function (c) {
          var key = (c.message || '').trim().toLowerCase();
          if (!groups[key]) { groups[key] = { msg: c.message, ids: [], last: c.created_at }; order.push(key); }
          groups[key].ids.push(c.id);
        });
        order.forEach(function (k) {
          var g = groups[k];
          items.push({ source: '대화', content: g.msg, count: g.ids.length, at: g.last, chatIds: g.ids });
        });
        return sb().from('ai_customer_memories').select('id,content,created_at').eq('memory_type', 'question')
          .order('created_at', { ascending: false }).limit(40);
      })
      .then(function (res) {
        if (res && res.error) throw res.error;
        (res && res.data || []).forEach(function (m) {
          items.push({ source: '고객분석', content: m.content, at: m.created_at, memId: m.id });
        });
        items.sort(function (a, b) { return new Date(b.at) - new Date(a.at); });
        box.innerHTML = items.length ? items.map(function (it) {
          var delAttr = it.chatIds ? ('data-ids="' + esc(it.chatIds.join(',')) + '"') : ('data-id="' + esc(it.memId) + '"');
          var delAct = it.chatIds ? 'review-done' : 'mem-del';
          return '<div class="aia-card nohover"><div class="aia-row">' +
            '<span class="aia-tag' + (it.source === '대화' ? ' warn' : '') + '">' + esc(it.source) + '</span>' +
            (it.count > 1 ? ('<span class="aia-tag warn" style="margin-left:6px">' + it.count + '번 물음</span>') : '') +
            '<span class="aia-meta" style="margin-left:auto;margin-top:0">' + fmtDate(it.at) + '</span></div>' +
            '<div class="aia-sub" style="margin-top:6px">' + esc(it.content) + '</div>' +
            '<div class="aia-btns"><button class="aia-btn pri" data-act="' + (it.chatIds ? 'review-to-guide' : 'q-answer') + '" data-msg="' + esc(it.content).replace(/"/g, '&quot;') + '">답변 남기기</button>' +
            '<button class="aia-btn dng" data-act="' + delAct + '" ' + delAttr + '>넘어가기</button></div></div>';
        }).join('') : '<div class="aia-note">지금은 확인할 내용이 없어요. 대화 중 AI가 막혔던 질문이나, 고객 분석 중 궁금한 점이 생기면 여기 모여요.</div>';
      }).catch(function (e) { box.innerHTML = '<div class="aia-note">' + esc(String(e && e.message || e)) + '</div>'; });
  }

  /* ---------------- 1) 고객 프로필 목록 ---------------- */
  function renderProfiles() {
    if (!guard()) return;
    sb().from('customer_ai_profiles').select('*').order('updated_at', { ascending: false }).limit(200)
      .then(function (res) {
        if (res.error) { bodyEl.innerHTML = sqlHint(res.error); return; }
        var rows = res.data || [];
        if (!rows.length) { bodyEl.innerHTML = '<div class="aia-empty">아직 수집된 고객 프로필이 없습니다.<br>고객이 BELLORE AI 에 메시지를 보내면 자동으로 생성됩니다.</div>'; return; }
        bodyEl.innerHTML =
          '<div class="aia-note">고객이 AI 비서 대화·상품 클릭·찜·문의를 할 때마다 관심/예산/성향이 누적됩니다. 카드를 누르면 상세를 봅니다.</div>' +
          rows.map(profileCard).join('');
      }).catch(function (e) { bodyEl.innerHTML = sqlHint(e); });
  }
  function profileCard(p) {
    var who = [p.name, p.phone, p.email].filter(Boolean).join(' · ') || '익명 고객';
    var brands = (p.preferred_brands || []).slice(0, 3).map(function (b) { return '<span class="aia-tag brand">' + esc(b) + '</span>'; }).join(' ');
    var models = (p.preferred_models || []).slice(0, 3).join(', ');
    return '<div class="aia-card" data-profile-id="' + esc(p.id) + '">' +
      '<div class="aia-row"><span class="aia-name">' + esc(who) + '</span>' +
        '<span class="aia-tag stage" style="margin-left:auto">' + esc(STAGE[p.buying_stage] || p.buying_stage || '미상') + '</span></div>' +
      '<div class="aia-sub">' + (brands || '<span class="aia-tag">관심 브랜드 미상</span>') + (models ? (' · ' + esc(models)) : '') + '</div>' +
      '<div class="aia-sub">예산 ' + krw(p.budget_min) + '~' + krw(p.budget_max) + ' · 가격민감 ' + (p.price_sensitivity || 50) + ' · 구매가능성 ' + (p.buy_probability || 0) + '%</div>' +
      '<div class="aia-row" style="margin-top:6px"><div class="aia-bar"><i style="width:' + (p.buy_probability || 0) + '%"></i></div></div>' +
      '<div class="aia-meta">업데이트 ' + fmtDate(p.updated_at) + '</div>' +
    '</div>';
  }

  /* ---------------- 2) 고객 상세 ---------------- */
  function renderProfileDetail(pid) {
    bodyEl.innerHTML = '<div class="aia-empty">불러오는 중…</div>';
    var P, INT = [], EVT = [], CONV = [], ALERT = [], REC = [];
    sb().from('customer_ai_profiles').select('*').eq('id', pid).single()
      .then(function (r) { P = r.data; return sb().from('customer_watch_interests').select('*').eq('profile_id', pid).order('interest_score', { ascending: false }); })
      .then(function (r) { INT = r.data || []; return sb().from('customer_events').select('*').eq('profile_id', pid).order('created_at', { ascending: false }).limit(50); })
      .then(function (r) { EVT = r.data || []; return sb().from('ai_conversations').select('*').eq('profile_id', pid).order('created_at', { ascending: true }).limit(100); })
      .then(function (r) { CONV = r.data || []; return sb().from('ai_alert_candidates').select('*').eq('profile_id', pid).order('created_at', { ascending: false }).limit(20); })
      .then(function (r) { ALERT = r.data || []; return sb().from('ai_recommendation_logs').select('*').eq('profile_id', pid).order('score', { ascending: false }).limit(20); })
      .then(function (r) { REC = r.data || []; paintDetail(P, INT, EVT, CONV, ALERT, REC); })
      .catch(function (e) { bodyEl.innerHTML = sqlHint(e); });
  }
  function bar(label, v) {
    return '<div class="aia-sub">' + label + ' <b>' + (v == null ? 50 : v) + '</b></div><div class="aia-bar" style="margin:3px 0 8px"><i style="width:' + (v == null ? 50 : v) + '%"></i></div>';
  }
  function paintDetail(p, INT, EVT, CONV, ALERT, REC) {
    if (!p) { bodyEl.innerHTML = sqlHint({ message: '프로필을 찾을 수 없습니다.' }); return; }
    var who = [p.name, p.phone, p.email].filter(Boolean).join(' · ') || '익명 고객';
    var html = '<span class="aia-detail-back" data-act="back-profiles">‹ 회원관리로</span>';
    html += '<div class="aia-card nohover"><div class="aia-name">' + esc(who) + '</div>' +
      '<div class="aia-sub" style="margin-top:6px">' + esc(p.ai_summary || '요약 생성 전') + '</div>' +
      '<div class="aia-btns"><button class="aia-btn pri" data-act="ai-summarize" data-id="' + esc(p.id) + '">AI 요약·메모리 생성</button></div>' +
      '<div class="aia-meta">실제 AI(ai-learn) 미배포/키 미설정 시 규칙기반 요약이 유지됩니다.</div></div>';

    html += '<h5>선호 / 예산</h5><div class="aia-card nohover">' +
      '<div class="aia-sub">브랜드: ' + ((p.preferred_brands || []).map(esc).join(', ') || '-') + '</div>' +
      '<div class="aia-sub">모델: ' + ((p.preferred_models || []).map(esc).join(', ') || '-') + '</div>' +
      '<div class="aia-sub">레퍼런스: ' + ((p.preferred_references || []).map(esc).join(', ') || '-') + '</div>' +
      '<div class="aia-sub">예산: ' + krw(p.budget_min) + ' ~ ' + krw(p.budget_max) + '</div>' +
      '<div class="aia-sub">구매단계: ' + esc(STAGE[p.buying_stage] || '미상') + ' · 구매가능성 ' + (p.buy_probability || 0) + '%</div>' +
      '<div class="aia-meta">동의: 맞춤추천 ' + (p.consent_personalization ? 'O' : 'X') + ' · 마케팅 ' + (p.consent_marketing ? 'O' : 'X') + '</div></div>';

    html += '<h5>성향 점수</h5><div class="aia-card nohover">' +
      bar('가격 민감도', p.price_sensitivity) + bar('빠른 결정', p.speed_preference) +
      bar('디테일 중시', p.detail_preference) + bar('리셀 중시', p.resale_importance) +
      bar('위험 감내', p.risk_tolerance) + '</div>';

    html += '<h5>관심 모델 점수 (' + INT.length + ')</h5>';
    html += INT.length ? INT.map(function (it) {
      var n = [it.brand, it.model, it.reference_number].filter(Boolean).join(' ') || '미상';
      return '<div class="aia-card nohover"><div class="aia-row"><span class="aia-name" style="font-size:14px">' + esc(n) + '</span>' +
        '<span class="aia-score" style="margin-left:auto">' + (it.interest_score || 0) + '점</span></div>' +
        '<div class="aia-meta">' + (it.source ? esc(it.source) + ' · ' : '') + '최근 ' + fmtDate(it.updated_at || it.created_at) + '</div></div>';
    }).join('') : '<div class="aia-note">아직 관심 점수가 없습니다.</div>';

    html += '<h5>추천 상품 후보 (' + REC.length + ')</h5>';
    html += REC.length ? REC.map(function (r) {
      return '<div class="aia-card nohover"><div class="aia-row"><span class="aia-name" style="font-size:14px">상품 ' + esc((r.product_id || '').slice(0, 8)) + '</span>' +
        '<span class="aia-score" style="margin-left:auto">' + Math.round(r.score) + '점</span></div>' +
        '<div class="aia-meta">' + esc(r.reason || '') + '</div></div>';
    }).join('') : '<div class="aia-note">추천 후보가 아직 없습니다. (관리자 알림후보 생성 또는 추천엔진 실행 시 채워짐)</div>';

    html += '<h5>알림 후보 (' + ALERT.length + ')</h5>';
    html += ALERT.length ? ALERT.map(alertCard).join('') : '<div class="aia-note">알림 후보가 없습니다.</div>';

    html += '<h5>행동 로그 (' + EVT.length + ')</h5>';
    html += EVT.length ? EVT.slice(0, 20).map(function (e) {
      var n = [e.brand, e.model, e.reference_number].filter(Boolean).join(' ');
      return '<div class="aia-sec"><span class="aia-tag">' + esc(e.event_type) + '</span> <span class="aia-sub" style="display:inline">' + esc(n) + ' · ' + fmtDate(e.created_at) + '</span></div>';
    }).join('') : '<div class="aia-note">행동 로그가 없습니다.</div>';

    html += '<h5>대화 내역 (' + CONV.length + ')</h5><div class="aia-sec">';
    html += CONV.length ? CONV.map(function (c) {
      return '<div class="aia-msg ' + esc(c.role) + '">' + esc(c.message) + '</div>';
    }).join('') : '<div class="aia-note">대화 내역이 없습니다.</div>';
    html += '</div>';

    bodyEl.innerHTML = html;
    bodyEl.scrollTop = 0;
  }

  /* ---------------- 3) 대화 로그(전체) ---------------- */
  function renderConversations() {
    if (!guard()) return;
    sb().from('ai_conversations').select('*').order('created_at', { ascending: false }).limit(200)
      .then(function (res) {
        if (res.error) { bodyEl.innerHTML = sqlHint(res.error); return; }
        var rows = res.data || [];
        if (!rows.length) { bodyEl.innerHTML = '<div class="aia-empty">대화 로그가 없습니다.</div>'; return; }
        bodyEl.innerHTML = '<div class="aia-note">최근 대화 200건. 고객 상세에서 고객별 전체 대화를 볼 수 있습니다.</div>' +
          rows.map(function (c) {
            return '<div class="aia-card nohover"><div class="aia-row"><span class="aia-tag ' + (c.role === 'user' ? 'brand' : '') + '">' + esc(c.role) + '</span>' +
              '<span class="aia-meta" style="margin-left:auto;margin-top:0">' + fmtDate(c.created_at) + '</span></div>' +
              '<div class="aia-sub" style="margin-top:6px">' + esc(c.message) + '</div></div>';
          }).join('');
      }).catch(function (e) { bodyEl.innerHTML = sqlHint(e); });
  }

  /* ---------------- 4) 알림 후보 ---------------- */
  function alertCard(a) {
    var st = a.status || 'pending';
    var stTag = st === 'pending' ? 'warn' : (st === 'approved' ? 'stage' : '');
    var acts = st === 'pending'
      ? '<div class="aia-btns"><button class="aia-btn pri" data-act="alert-approve" data-id="' + esc(a.id) + '">승인</button>' +
        '<button class="aia-btn" data-act="alert-dismiss" data-id="' + esc(a.id) + '">보류/삭제</button></div>'
      : (st === 'approved' ? '<div class="aia-btns"><button class="aia-btn" data-act="alert-sent" data-id="' + esc(a.id) + '">발송 처리</button></div>' : '');
    var ST_KO = { pending: '발송 대기', approved: '승인됨', sent: '발송됨', dismissed: '보류' };
    return '<div class="aia-card nohover">' +
      '<div class="aia-row"><span class="aia-name" style="font-size:14px">' + esc(a.title) + '</span>' +
        '<span class="aia-tag ' + stTag + '" style="margin-left:auto">' + esc(ST_KO[st] || st) + '</span></div>' +
      '<div class="aia-sub" style="margin-top:6px">' + esc(a.message) + '</div>' +
      '<div class="aia-meta">' + esc(a.alert_type) + ' · 매칭 ' + Math.round(a.match_score || 0) + '점 · ' + esc(a.reason || '') + '</div>' +
      acts + '</div>';
  }
  function renderAlerts() {
    if (!guard()) return;
    sb().from('ai_alert_candidates').select('*').order('created_at', { ascending: false }).limit(200)
      .then(function (res) {
        if (res.error) { bodyEl.innerHTML = sqlHint(res.error); return; }
        var rows = res.data || [];
        var pending = rows.filter(function (a) { return (a.status || 'pending') === 'pending'; });
        bodyEl.innerHTML = '<div class="aia-note">발송 대기(pending) ' + pending.length + '건. 승인해도 자동 발송되지 않습니다(status 만 변경). 실제 발송은 카카오/문자/메일/푸시 연동 후 처리됩니다.</div>' +
          (rows.length ? rows.map(alertCard).join('') : '<div class="aia-empty">알림 후보가 없습니다.<br>신규 상품 등록·가격 변경 시 관심 고객과 매칭하여 생성됩니다.</div>');
      }).catch(function (e) { bodyEl.innerHTML = sqlHint(e); });
  }

  /* ---------------- 5) 전문가 지식 ---------------- */
  var KN_NEXT = { draft: 'reviewed', reviewed: 'approved', approved: 'archived', archived: 'draft' };
  function renderKnowledge() {
    if (!guard()) return;
    sb().from('expert_knowledge_notes').select('*').order('updated_at', { ascending: false }).limit(200)
      .then(function (res) {
        if (res.error) { bodyEl.innerHTML = sqlHint(res.error); return; }
        var rows = res.data || [];
        var KN_KO = { draft: '초안', reviewed: '검토중', approved: '승인', archived: '보관' };
        bodyEl.innerHTML = '<div class="aia-note">전문가 녹취·디스코드에서 뽑은 시계 지식. 상태를 눌러 초안 → 검토중 → 승인 으로 올립니다.</div>' +
          '<div class="aia-sec"><button class="aia-btn pri" data-act="ai-magazine-draft">매거진·블로그 초안 생성 (AI)</button></div>' +
          (rows.length ? rows.map(function (k) {
            var tags = [k.brand, k.model, k.reference_number].filter(Boolean).map(function (x) { return '<span class="aia-tag brand">' + esc(x) + '</span>'; }).join(' ');
            return '<div class="aia-card nohover"><div class="aia-row"><span class="aia-name" style="font-size:14px">' + esc(k.title) + '</span>' +
              '<button class="aia-btn" data-act="kn-cycle" data-id="' + esc(k.id) + '" data-st="' + esc(k.status) + '" style="margin-left:auto">' + esc(KN_KO[k.status] || k.status) + ' →</button></div>' +
              '<div class="aia-sub" style="margin-top:6px">' + esc(k.content) + '</div>' +
              '<div class="aia-meta">' + tags + ' · 신뢰도 ' + (k.confidence || 0) + ' · ' + esc(k.source || '') + '</div>' +
              '<div class="aia-btns"><button class="aia-btn dng" data-act="kn-del" data-id="' + esc(k.id) + '">삭제</button></div></div>';
          }).join('') : '<div class="aia-empty">전문가 지식 노트가 없습니다.</div>');
      }).catch(function (e) { bodyEl.innerHTML = sqlHint(e); });
  }

  /* ---------------- 5-1) 시세 인사이트 (레퍼런스별 매입/판매 가격대 집계) ---------------- */
  function renderMarket() {
    if (!guard()) return;
    sb().from('watch_market_prices').select('*').order('scraped_at', { ascending: false }).limit(500)
      .then(function (res) {
        if (res.error) { bodyEl.innerHTML = sqlHint(res.error) + '<div class="aia-note">ai_market_insights.sql 을 실행했는지 확인하세요.</div>'; return; }
        var rows = res.data || [];
        var groups = {}, order = [];
        rows.forEach(function (r) {
          var key = (r.brand || '') + ' ' + (r.reference_number || '');
          if (!groups[key]) { groups[key] = { brand: r.brand, ref: r.reference_number, items: [] }; order.push(key); }
          groups[key].items.push(r);
        });
        var html = '<div class="aia-note">Discord 시세 대화에서 브랜드·레퍼런스·금액·매입/판매 여부를 자동으로 뽑아 정리합니다. 잡담은 자동 제외(브랜드+레퍼런스+금액 셋 다 있어야 인정).</div>' +
          '<div class="aia-sec"><button class="aia-btn pri" data-act="ai-market-extract">디스코드에서 시세 뽑기</button></div>';
        if (!order.length) { bodyEl.innerHTML = html + '<div class="aia-empty">아직 정리된 시세가 없습니다. 위 버튼을 눌러 팀 메시지에서 뽑아보세요.</div>'; return; }
        html += order.map(function (key) {
          var g = groups[key];
          var prices = g.items.map(function (i) { return i.price_krw || i.price || 0; }).filter(Boolean);
          var lo = Math.min.apply(null, prices), hi = Math.max.apply(null, prices);
          var buy = g.items.filter(function (i) { return i.deal_type === '매입'; }).length;
          var sell = g.items.filter(function (i) { return i.deal_type === '판매'; }).length;
          var recent = g.items.slice(0, 3).map(function (i) {
            return '<div class="aia-sub">' + esc(i.deal_type || '참고') + ' ' + krw(i.price_krw || i.price) + '원 · ' + fmtDate(i.scraped_at) + '</div>';
          }).join('');
          var ids = g.items.map(function (i) { return i.id; }).join(',');
          return '<div class="aia-card nohover"><div class="aia-row">' +
            '<span class="aia-name" style="font-size:15px">' + esc(g.brand || '') + ' ' + esc(g.ref || '') + '</span>' +
            '<span class="aia-score" style="margin-left:auto">' + krw(lo) + '~' + krw(hi) + '원</span></div>' +
            '<div class="aia-meta">총 ' + g.items.length + '건 · 매입 ' + buy + '건 · 판매 ' + sell + '건</div>' +
            recent +
            '<div class="aia-btns"><button class="aia-btn dng" data-act="market-del" data-ids="' + esc(ids) + '">이 시세 삭제</button></div></div>';
        }).join('');
        bodyEl.innerHTML = html;
      }).catch(function (e) { bodyEl.innerHTML = sqlHint(e); });
  }

  /* ---------------- 6) 팀 메시지(Discord/Slack) ---------------- */
  function renderTeam() {
    if (!guard()) return;
    var rows = [];
    sb().from('team_messages').select('*').order('created_at', { ascending: false }).limit(200)
      .then(function (res) {
        if (res.error) { bodyEl.innerHTML = sqlHint(res.error); return null; }
        rows = res.data || [];
        var ids = rows.filter(function (m) { return m.has_attachment; }).map(function (m) { return m.id; });
        if (!ids.length) return { data: [] };
        return sb().from('team_message_attachments').select('*').in('team_message_id', ids);
      })
      .then(function (attRes) {
        if (!attRes) return;
        var attByMsg = {};
        (attRes.data || []).forEach(function (a) {
          (attByMsg[a.team_message_id] = attByMsg[a.team_message_id] || []).push(a);
        });
        bodyEl.innerHTML = '<div class="aia-note">Discord/Slack 봇이 수집한 내부 대화. (연동 Edge Function: discord-ingest) 메시지에서 브랜드/레퍼런스를 태깅해 전문가 지식 후보로 보낼 수 있습니다.</div>' +
          '<div class="aia-sec"><button class="aia-btn pri" data-act="ai-extract-knowledge">AI로 지식 일괄 추출 (ai-learn)</button></div>' +
          (rows.length ? rows.map(function (m) {
            var txt = m.message || '';
            var brand = (AI().rules && AI().rules.extractBrands(txt)[0]) || '';
            var ref = (AI().rules && AI().rules.extractReferences(txt)[0]) || '';
            var tags = [brand, ref].filter(Boolean).map(function (x) { return '<span class="aia-tag brand">' + esc(x) + '</span>'; }).join(' ');
            var atts = attByMsg[m.id] || [];
            var imgs = atts.filter(function (a) { return /^image\//.test(a.file_type || ''); });
            var others = atts.filter(function (a) { return !/^image\//.test(a.file_type || ''); });
            var imgHtml = imgs.length ? ('<div class="aia-team-imgs">' + imgs.map(function (a) {
              return '<a href="' + esc(a.file_url || '') + '" target="_blank" rel="noopener"><img src="' + esc(a.file_url || '') + '" alt="' + esc(a.file_name || '') + '" loading="lazy"></a>';
            }).join('') + '</div>') : '';
            var otherHtml = others.length ? ('<div class="aia-meta">' + others.map(function (a) {
              return '<a href="' + esc(a.file_url || '') + '" target="_blank" rel="noopener">📎 ' + esc(a.file_name || '파일') + '</a>';
            }).join(' · ') + '</div>') : '';
            return '<div class="aia-card nohover"><div class="aia-row"><span class="aia-tag">' + esc(m.platform) + '</span>' +
              '<span class="aia-sub" style="display:inline;margin:0 0 0 6px">' + esc(m.channel_name || m.channel_id || '') + ' · ' + esc(m.sender_name || '') + '</span>' +
              '<span class="aia-meta" style="margin-left:auto;margin-top:0">' + fmtDate(m.created_at) + '</span></div>' +
              (txt ? ('<div class="aia-sub" style="margin-top:6px">' + esc(txt) + '</div>') : '') +
              imgHtml + otherHtml +
              (tags ? ('<div class="aia-meta">' + tags + '</div>') : '') +
              '<div class="aia-btns"><button class="aia-btn" data-act="team-to-knowledge" data-id="' + esc(m.id) + '">전문가 지식으로 보내기</button>' +
              '<button class="aia-btn dng" data-act="team-del" data-id="' + esc(m.id) + '">삭제</button></div></div>';
          }).join('') : '<div class="aia-empty">수집된 팀 메시지가 없습니다.<br>Discord/Slack 봇 연동(discord-ingest Edge Function) 후 채워집니다.</div>');
      }).catch(function (e) { bodyEl.innerHTML = sqlHint(e); });
  }

  /* ---------------- 7) 응답 지침(플레이북) ---------------- */
  var GUIDE_CATS = ['응대 톤', '추천 원칙', '가격 안내', '반론 대응', '금지 사항', '일반'];
  // 예전 영어 분류값을 한글로 보여주기 위한 매핑
  var CAT_KO = { tone: '응대 톤', recommendation: '추천 원칙', pricing: '가격 안내', objection: '반론 대응', forbidden: '금지 사항', general: '일반' };
  function catKo(c) { return CAT_KO[c] || c || '일반'; }
  function renderGuidelines() {
    if (!guard()) return;
    sb().from('ai_response_guidelines').select('*').order('priority', { ascending: true }).limit(200)
      .then(function (res) {
        if (res.error) { bodyEl.innerHTML = sqlHint(res.error) + '<div class="aia-note">ai_guidelines.sql 을 실행했는지 확인하세요.</div>'; return; }
        var rows = res.data || [];
        bodyEl.innerHTML =
          '<div class="aia-note">AI 가 고객에게 "어떻게 답변할지" 지침입니다. 활성(active) 지침은 ai-learn 답변 생성 시 시스템 프롬프트로 사용됩니다. 우선순위 숫자가 작을수록 상위 규칙.</div>' +
          '<div class="aia-sec"><button class="aia-btn pri" data-act="guide-new">+ 새 지침 작성</button></div>' +
          (rows.length ? rows.map(guideCard).join('') : '<div class="aia-empty">등록된 지침이 없습니다.</div>');
      }).catch(function (e) { bodyEl.innerHTML = sqlHint(e); });
  }
  function guideCard(g) {
    return '<div class="aia-card nohover"><div class="aia-row">' +
      '<span class="aia-tag ' + (g.is_active ? 'stage' : '') + '">' + (g.is_active ? '학습됨' : '보류') + '</span>' +
      '<span class="aia-name" style="font-size:14px">' + esc(g.title) + '</span>' +
      '<span class="aia-meta" style="margin-left:auto;margin-top:0">' + esc(catKo(g.category)) + '</span></div>' +
      '<div class="aia-sub" style="margin-top:6px">' + esc(g.content) + '</div>' +
      '<div class="aia-btns">' +
        '<button class="aia-btn" data-act="guide-edit" data-id="' + esc(g.id) + '">수정</button>' +
        '<button class="aia-btn" data-act="guide-toggle" data-id="' + esc(g.id) + '" data-on="' + (g.is_active ? '1' : '0') + '">' + (g.is_active ? '학습 끄기' : '학습 켜기') + '</button>' +
        '<button class="aia-btn dng" data-act="guide-del" data-id="' + esc(g.id) + '">삭제</button>' +
      '</div></div>';
  }
  function guideEditor(g) {
    g = g || { title: '', category: '일반', content: '', is_active: true };
    var opts = GUIDE_CATS.map(function (c) { return '<option value="' + c + '"' + (catKo(g.category) === c ? ' selected' : '') + '>' + c + '</option>'; }).join('');
    bodyEl.innerHTML =
      '<span class="aia-detail-back" data-act="guide-back">‹ 참고서 목록</span>' +
      '<div class="aia-card nohover">' +
        '<div class="aia-sub">제목 (예: 예물시계 문의 응대)</div><input id="gTitle" class="aia-gin" value="' + esc(g.title) + '">' +
        '<div class="aia-sub" style="margin-top:8px">분류</div><select id="gCat" class="aia-gin">' + opts + '</select>' +
        '<div class="aia-sub" style="margin-top:8px">이렇게 답변하세요 (지침 내용)</div><textarea id="gContent" class="aia-gin" rows="6" placeholder="예) 예물시계는 데이트저스트·탱크를 먼저 안내하고 예산을 여쭤본다.">' + esc(g.content) + '</textarea>' +
        '<div class="aia-btns"><button class="aia-btn pri" data-act="guide-save" data-id="' + esc(g.id || '') + '">저장하고 AI에 반영</button></div>' +
        '<div id="gFeedback"></div>' +
      '</div>';
    if (!$('#aia-gin-style')) {
      var s = document.createElement('style'); s.id = 'aia-gin-style';
      s.textContent = '.aia-gin{width:100%;padding:9px 12px;border:1px solid #e5e3df;border-radius:10px;font:14px Pretendard;margin-top:3px;box-sizing:border-box}';
      document.head.appendChild(s);
    }
  }
  function saveGuideline(id) {
    var row = {
      title: ($('#gTitle').value || '').trim(),
      category: $('#gCat').value,
      content: ($('#gContent').value || '').trim(),
      is_active: true   // 저장 = 학습에 반영(활성)
    };
    if (!row.title || !row.content) { alert('제목과 내용을 입력하세요.'); return; }
    var q = id ? sb().from('ai_response_guidelines').update(row).eq('id', id)
              : sb().from('ai_response_guidelines').insert(row);
    q.then(function (r) {
      if (r.error) { alert('저장 실패: ' + r.error.message); return; }
      // 저장 즉시 참고서에 반영됨을 알려줌(피드백)
      var fb = $('#gFeedback');
      if (fb) fb.innerHTML = '<div class="aia-note" style="color:#16a34a;margin-top:10px">✓ 참고서에 저장했어요. 이제 AI가 "' + esc(row.title) + '" 상황에서 이 지침대로 답변합니다.</div>';
      setTimeout(renderGuidelines, 1200);
    });
  }

  /* ---------------- 액션 핸들러 ---------------- */
  function handleAction(el) {
    var act = el.dataset.act, id = el.dataset.id;
    if (act === 'back-profiles') { if (_fromMember) close(); else setTab('settings'); return; }
    if (act === 'alert-approve') return updateAlert(id, { status: 'approved', approved_at: new Date().toISOString() });
    if (act === 'alert-dismiss') return updateAlert(id, { status: 'dismissed' });
    if (act === 'alert-sent') return updateAlert(id, { status: 'sent', sent_at: new Date().toISOString() });
    if (act === 'kn-cycle') {
      var next = KN_NEXT[el.dataset.st] || 'reviewed';
      sb().from('expert_knowledge_notes').update({ status: next }).eq('id', id).then(function () { renderKnowledge(); });
      return;
    }
    if (act === 'kn-del') {
      if (!confirm('이 지식 노트를 삭제할까요?')) return;
      sb().from('expert_knowledge_notes').delete().eq('id', id).then(function () { renderKnowledge(); });
      return;
    }
    if (act === 'market-del') {
      if (!confirm('이 시세 항목을 삭제할까요?')) return;
      var mids = (el.dataset.ids || '').split(',').filter(Boolean);
      sb().from('watch_market_prices').delete().in('id', mids).then(function () { renderMarket(); });
      return;
    }
    if (act === 'team-del') {
      if (!confirm('이 팀 메시지를 삭제할까요? (첨부파일도 함께 삭제됩니다)')) return;
      sb().from('team_messages').delete().eq('id', id).then(function () { renderTeam(); });
      return;
    }
    if (act === 'team-to-knowledge') return teamToKnowledge(id);
    if (act === 'ai-summarize') return callLearn(el, { action: 'summarize_profile', profile_id: id }, function () { renderProfileDetail(id); });
    if (act === 'ai-extract-knowledge') return callLearn(el, { action: 'extract_knowledge', limit: 30 }, function () { setTab('knowledge'); });
    if (act === 'ai-market-extract') return callLearn(el, { action: 'extract_market_insights', limit: 200 }, function () { renderMarket(); });
    if (act === 'ai-magazine-draft') return callLearn(el, { action: 'generate_magazine_draft' }, function () { setTab('knowledge'); });
    if (act === 'go-guidelines') { setTab('guidelines'); return; }
    if (act === 'go-alerts') { setTab('alerts'); return; }
    if (act === 'ai-learn-now') return callLearn(el, { action: 'summarize_all', limit: 30 }, function () { loadLearned(); });
    if (act === 'mem-keep') {
      // 유지 = 확신 100으로 승격(관리자 승인 표시)
      sb().from('ai_customer_memories').update({ confidence: 100 }).eq('id', id).then(function () { loadLearned(); });
      return;
    }
    if (act === 'mem-del') {
      sb().from('ai_customer_memories').delete().eq('id', id).then(function () { loadLearned(); loadConfirmations(); });
      return;
    }
    if (act === 'q-answer') {
      setTab('guidelines');
      setTimeout(function () { guideEditor({ title: 'AI 질문에 대한 답변', category: '일반', content: 'AI 질문: "' + (el.dataset.msg || '') + '"\n→ 답변: ', is_active: true }); }, 60);
      return;
    }
    if (act === 'review-done') {
      var ids = (el.dataset.ids || '').split(',').filter(Boolean);
      if (!ids.length) return;
      sb().from('ai_conversations').update({ metadata: { needs_review: false, resolved: true } }).in('id', ids).then(function () { loadConfirmations(); });
      return;
    }
    if (act === 'review-to-guide') {
      setTab('guidelines');
      setTimeout(function () { guideEditor({ title: '자주 묻는 질문 대응', category: '일반', content: '고객 질문 예: "' + (el.dataset.msg || '') + '"\n→ 이렇게 답변한다: ', is_active: true }); }, 60);
      return;
    }
    if (act === 'guide-new') { guideEditor(null); return; }
    if (act === 'guide-back') { renderGuidelines(); return; }
    if (act === 'guide-save') return saveGuideline(id || null);
    if (act === 'guide-edit') {
      sb().from('ai_response_guidelines').select('*').eq('id', id).single().then(function (r) { guideEditor(r.data); });
      return;
    }
    if (act === 'guide-toggle') {
      sb().from('ai_response_guidelines').update({ is_active: el.dataset.on !== '1' }).eq('id', id).then(function () { renderGuidelines(); });
      return;
    }
    if (act === 'guide-del') {
      if (!confirm('이 지침을 삭제할까요?')) return;
      sb().from('ai_response_guidelines').delete().eq('id', id).then(function () { renderGuidelines(); });
      return;
    }
  }

  // ai-learn Edge Function 호출(실제 AI). 미배포/키 미설정이면 skipped 안내.
  function callLearn(btn, body, onDone) {
    if (!sb() || !sb().functions) { alert('백엔드 함수 호출을 사용할 수 없습니다.'); return; }
    var label = btn.textContent; btn.disabled = true; btn.textContent = '처리 중…';
    sb().functions.invoke(window.BELLORE_AI_FN || 'ai-learn', { body: body }).then(function (res) {
      btn.disabled = false; btn.textContent = label;
      var d = res && res.data;
      if (d && d.skipped) { alert('AI 키 미설정: ' + (d.hint || 'ANTHROPIC_API_KEY/OPENAI_API_KEY 시크릿을 설정하세요.')); return; }
      if (res && res.error) { alert('AI 호출 실패: ' + (res.error.message || res.error)); return; }
      if (onDone) onDone();
    }).catch(function (e) {
      btn.disabled = false; btn.textContent = label;
      alert('AI 호출 오류: ' + (e && e.message ? e.message : e) + '\n(ai-learn Edge Function 배포 여부를 확인하세요.)');
    });
  }
  function updateAlert(id, patch) {
    sb().from('ai_alert_candidates').update(patch).eq('id', id).then(function () {
      if (curTab === 'alerts') renderAlerts();
    });
  }
  function teamToKnowledge(id) {
    sb().from('team_messages').select('*').eq('id', id).single().then(function (r) {
      var m = r.data; if (!m) return;
      var txt = m.message || '';
      var note = {
        brand: (AI().rules && AI().rules.extractBrands(txt)[0]) || null,
        reference_number: (AI().rules && AI().rules.extractReferences(txt)[0]) || null,
        title: txt.slice(0, 40) || '팀 메시지 지식',
        content: txt, source: m.platform + ':' + (m.channel_name || ''), confidence: 60, status: 'draft'
      };
      sb().from('expert_knowledge_notes').insert(note).then(function () {
        setTab('knowledge');
      });
    });
  }

  /* ---------------- 관리자 메뉴 주입 + 진입 ---------------- */
  function injectMenu() {
    if (!isAdmin()) return;                 // 관리자만
    if ($('#aiAdvisorMenuRow')) return;     // 이미 있으면 skip(멱등)
    var box = $('#adminMenuBox');
    var group = box && box.querySelector('.admin-menu');
    if (!group) return;
    var btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'admin-menu-row'; btn.id = 'aiAdvisorMenuRow';
    btn.innerHTML = '<span>AI 상담 설정 <em class="amr-sub">참고서·알림·지식·시세 (고객분석은 회원관리)</em></span>' +
      '<span class="amr-right"><span class="amr-arrow">›</span></span>';
    group.appendChild(btn);
    btn.addEventListener('click', open);
  }

  // 여러 트리거로 확실하게 주입(로그인/마이페이지 진입 타이밍 무관).
  function bindTriggers() {
    // 1) 로그인/권한 변경 시
    if (B() && B().onAuthChange) { try { B().onAuthChange(function () { setTimeout(injectMenu, 300); }); } catch (e) {} }
    // 2) 마이페이지/프로필 진입 클릭 시 즉시 주입
    document.addEventListener('click', function (e) {
      if (e.target.closest('#myPageBtn,[data-nav="mypage"],#headerProfile,.js-mypage,[data-open="mypage"]')) {
        setTimeout(injectMenu, 350);
      }
    }, true);
    // 3) 초기 폴링(60초, 여유있게) — 관리자 박스가 늦게 떠도 잡힘
    var n = 0, t = setInterval(function () { injectMenu(); if (++n > 120) clearInterval(t); }, 500);
  }

  window.BelloreAIAdmin = { open: open, close: close, setTab: setTab, injectMenu: injectMenu, openProfileDetail: openProfileDetail };

  function init() { injectMenu(); bindTriggers(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
