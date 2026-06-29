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
  function isAdmin() { try { return !!(B() && B().isAdmin && B().isAdmin()); } catch (e) { return false; } }
  function AI() { return window.BelloreAI || {}; }
  function krw(n) { return (AI().krwShort ? AI().krwShort(n) : (n == null ? '-' : Number(n).toLocaleString())); }
  function fmtDate(s) { var d = new Date(s); return isNaN(d) ? '-' : (d.getFullYear() + '.' + (d.getMonth() + 1) + '.' + d.getDate() + ' ' + ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2)); }

  var STAGE = (AI().STAGE_LABEL) || { browsing: '둘러보는 중', considering: '가격 비교 중', high_intent: '매물 찾는 중', ready_to_buy: '구매 임박', sell_intent: '판매 문의', unknown: '미상' };

  /* ---------------- 스타일 ---------------- */
  function injectStyles() {
    if ($('#bellore-aiadmin-style')) return;
    var css = ''
      + '#aiAdminPanel{position:fixed;inset:0;z-index:1400;display:none;background:#fff;font-family:Pretendard,-apple-system,sans-serif}'
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
      + '.aia-note{max-width:720px;margin:0 auto 10px;font-size:12px;color:#9a9a9a;line-height:1.6}';
    var st = document.createElement('style'); st.id = 'bellore-aiadmin-style'; st.textContent = css;
    document.head.appendChild(st);
  }

  /* ---------------- 패널 골격 ---------------- */
  var TABS = [
    { k: 'profiles', t: '고객 프로필' },
    { k: 'conversations', t: '대화 로그' },
    { k: 'alerts', t: '알림 후보' },
    { k: 'knowledge', t: '전문가 지식' },
    { k: 'team', t: '팀 메시지' }
  ];
  var panel, bodyEl, curTab = 'profiles';

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
        TABS.map(function (x) { return '<button class="aia-tab' + (x.k === 'profiles' ? ' on' : '') + '" data-tab="' + x.k + '">' + x.t + '</button>'; }).join('') +
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
    panel.classList.add('show');
    document.body.style.overflow = 'hidden';
    setTab(curTab);
  }
  function close() { if (panel) { panel.classList.remove('show'); document.body.style.overflow = ''; } }

  function setTab(k) {
    curTab = k;
    $$('.aia-tab', panel).forEach(function (b) { b.classList.toggle('on', b.dataset.tab === k); });
    bodyEl.scrollTop = 0;
    bodyEl.innerHTML = '<div class="aia-empty">불러오는 중…</div>';
    if (k === 'profiles') renderProfiles();
    else if (k === 'conversations') renderConversations();
    else if (k === 'alerts') renderAlerts();
    else if (k === 'knowledge') renderKnowledge();
    else if (k === 'team') renderTeam();
  }

  function guard() {
    if (!sb()) { bodyEl.innerHTML = '<div class="aia-empty">백엔드 연결이 필요합니다. (Supabase 미설정)</div>'; return false; }
    return true;
  }
  function sqlHint(err) {
    return '<div class="aia-empty">데이터를 불러오지 못했습니다.<br><span style="font-size:12px">' +
      esc((err && err.message) || '') + '<br>ai_advisor.sql 을 Supabase SQL Editor 에 실행했는지 확인하세요.</span></div>';
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
    var html = '<span class="aia-detail-back" data-act="back-profiles">‹ 목록으로</span>';
    html += '<div class="aia-card nohover"><div class="aia-name">' + esc(who) + '</div>' +
      '<div class="aia-sub" style="margin-top:6px">' + esc(p.ai_summary || '요약 생성 전') + '</div></div>';

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
    return '<div class="aia-card nohover">' +
      '<div class="aia-row"><span class="aia-name" style="font-size:14px">' + esc(a.title) + '</span>' +
        '<span class="aia-tag ' + stTag + '" style="margin-left:auto">' + esc(st) + '</span></div>' +
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
        bodyEl.innerHTML = '<div class="aia-note">전문가 녹취/슬랙/디스코드에서 추출한 시계 지식. 상태를 눌러 draft→reviewed→approved 로 승격합니다.</div>' +
          (rows.length ? rows.map(function (k) {
            var tags = [k.brand, k.model, k.reference_number].filter(Boolean).map(function (x) { return '<span class="aia-tag brand">' + esc(x) + '</span>'; }).join(' ');
            return '<div class="aia-card nohover"><div class="aia-row"><span class="aia-name" style="font-size:14px">' + esc(k.title) + '</span>' +
              '<button class="aia-btn" data-act="kn-cycle" data-id="' + esc(k.id) + '" data-st="' + esc(k.status) + '" style="margin-left:auto">' + esc(k.status) + ' →</button></div>' +
              '<div class="aia-sub" style="margin-top:6px">' + esc(k.content) + '</div>' +
              '<div class="aia-meta">' + tags + ' · 신뢰도 ' + (k.confidence || 0) + ' · ' + esc(k.source || '') + '</div></div>';
          }).join('') : '<div class="aia-empty">전문가 지식 노트가 없습니다.</div>');
      }).catch(function (e) { bodyEl.innerHTML = sqlHint(e); });
  }

  /* ---------------- 6) 팀 메시지(Discord/Slack) ---------------- */
  function renderTeam() {
    if (!guard()) return;
    sb().from('team_messages').select('*').order('created_at', { ascending: false }).limit(200)
      .then(function (res) {
        if (res.error) { bodyEl.innerHTML = sqlHint(res.error); return; }
        var rows = res.data || [];
        bodyEl.innerHTML = '<div class="aia-note">Discord/Slack 봇이 수집한 내부 대화. (연동 Edge Function: discord-ingest) 메시지에서 브랜드/레퍼런스를 태깅해 전문가 지식 후보로 보낼 수 있습니다.</div>' +
          (rows.length ? rows.map(function (m) {
            var txt = m.message || '';
            var brand = (AI().rules && AI().rules.extractBrands(txt)[0]) || '';
            var ref = (AI().rules && AI().rules.extractReferences(txt)[0]) || '';
            var tags = [brand, ref].filter(Boolean).map(function (x) { return '<span class="aia-tag brand">' + esc(x) + '</span>'; }).join(' ');
            return '<div class="aia-card nohover"><div class="aia-row"><span class="aia-tag">' + esc(m.platform) + '</span>' +
              '<span class="aia-sub" style="display:inline;margin:0 0 0 6px">' + esc(m.channel_name || m.channel_id || '') + ' · ' + esc(m.sender_name || '') + '</span>' +
              '<span class="aia-meta" style="margin-left:auto;margin-top:0">' + fmtDate(m.created_at) + '</span></div>' +
              '<div class="aia-sub" style="margin-top:6px">' + esc(txt) + (m.has_attachment ? ' 📎' : '') + '</div>' +
              (tags ? ('<div class="aia-meta">' + tags + '</div>') : '') +
              '<div class="aia-btns"><button class="aia-btn" data-act="team-to-knowledge" data-id="' + esc(m.id) + '">전문가 지식으로 보내기</button></div></div>';
          }).join('') : '<div class="aia-empty">수집된 팀 메시지가 없습니다.<br>Discord/Slack 봇 연동(discord-ingest Edge Function) 후 채워집니다.</div>');
      }).catch(function (e) { bodyEl.innerHTML = sqlHint(e); });
  }

  /* ---------------- 액션 핸들러 ---------------- */
  function handleAction(el) {
    var act = el.dataset.act, id = el.dataset.id;
    if (act === 'back-profiles') { renderProfiles(); return; }
    if (act === 'alert-approve') return updateAlert(id, { status: 'approved', approved_at: new Date().toISOString() });
    if (act === 'alert-dismiss') return updateAlert(id, { status: 'dismissed' });
    if (act === 'alert-sent') return updateAlert(id, { status: 'sent', sent_at: new Date().toISOString() });
    if (act === 'kn-cycle') {
      var next = KN_NEXT[el.dataset.st] || 'reviewed';
      sb().from('expert_knowledge_notes').update({ status: next }).eq('id', id).then(function () { renderKnowledge(); });
      return;
    }
    if (act === 'team-to-knowledge') return teamToKnowledge(id);
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
    var box = $('#adminMenuBox');
    if (!box || $('#aiAdvisorMenuRow')) return;
    // '관리' 그룹에 새 행 추가
    var group = box.querySelector('.admin-menu');
    if (!group) return;
    var btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'admin-menu-row'; btn.id = 'aiAdvisorMenuRow';
    btn.innerHTML = '<span>AI 고객비서 <em class="amr-sub">프로필·대화·관심·알림후보</em></span>' +
      '<span class="amr-right"><span class="amr-arrow">›</span></span>';
    group.appendChild(btn);
    btn.addEventListener('click', open);
  }

  // 관리자 박스가 비동기로 표시될 수 있어 폴링으로 주입 타이밍을 잡는다.
  function watchAdmin() {
    var tries = 0;
    var t = setInterval(function () {
      if (isAdmin() && $('#adminMenuBox')) { injectMenu(); }
      if (++tries > 60) clearInterval(t);
    }, 500);
  }

  window.BelloreAIAdmin = { open: open, close: close, setTab: setTab };

  function init() { if (isAdmin()) injectMenu(); watchAdmin(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
