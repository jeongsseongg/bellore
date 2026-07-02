/* ============================================================
   벨로르(BELLORE) · 고객별 AI 시계 전문비서 — 1차 기반 (엔진 + 고객 UI)
   ------------------------------------------------------------
   ⚠️ 외부 AI API(OpenAI/Claude) 미연결. 전부 "규칙 기반"으로 동작.
   나중에 API 를 붙일 수 있도록 AIProvider 인터페이스(stub)만 둡니다.

   동작 개요(고객):
     채팅 입력 → ai_conversations 저장 → ruleExtractor 로 브랜드/모델/예산/성향 추출
       → customer_ai_profiles 업데이트 → customer_watch_interests 점수 누적
       → customer_events 기록 → 규칙 기반 응답 출력

   로그인 상태: Supabase(window.sbClient)에 저장.
   비로그인(게스트): localStorage 폴백(끊김 없음) → 로그인 시 자동 병합.
   (alerts.js / wishlist.js 와 동일한 폴백 철학)

   전역 노출: window.BelloreAI = {
     rules, provider, profile, reco, alerts, track, ensureProfile, ...
   }
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- 공통 유틸 ---------------- */
  function $(s, c) { return (c || document).querySelector(s); }
  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
  function uniq(arr) { var seen = {}, out = []; (arr || []).forEach(function (x) { if (x == null) return; var k = String(x).trim(); if (!k || seen[k]) return; seen[k] = 1; out.push(k); }); return out; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function nowISO() { return new Date().toISOString(); }
  function B() { return window.NWBackend; }
  function sb() { return window.sbClient || null; }
  function curUser() { try { var u = B() && B().currentUser && B().currentUser(); return u || null; } catch (e) { return null; } }
  function loggedIn() { return !!curUser(); }
  function dbOn() { return !!(sb() && loggedIn()); }

  /* ============================================================
     1) ruleExtractor — 규칙 기반 추출 (브랜드/레퍼런스/예산/성향/단계)
     ============================================================ */

  // 브랜드 별칭 사전(한글/영문). brands.js 의 BELLORE_BRANDS 도 함께 활용.
  var BRAND_ALIASES = [
    { name: '롤렉스',        keys: ['rolex', '롤렉스', '롤'] },
    { name: '오메가',        keys: ['omega', '오메가'] },
    { name: '까르띠에',      keys: ['cartier', '까르띠에', '카르티에'] },
    { name: '태그호이어',    keys: ['tag heuer', 'tagheuer', '태그호이어', '태그'] },
    { name: '리차드밀',      keys: ['richard mille', 'richardmille', '리차드밀', '리차드 밀'] },
    { name: '파텍필립',      keys: ['patek philippe', 'patek', '파텍필립', '파텍'] },
    { name: '오데마피게',    keys: ['audemars piguet', 'audemars', '오데마피게', '오데마', 'AP'] },
    { name: '바쉐론 콘스탄틴', keys: ['vacheron constantin', 'vacheron', '바쉐론', '바셰론'] },
    { name: 'IWC',          keys: ['iwc', '아이더블유씨'] },
    { name: '파네라이',      keys: ['panerai', '파네라이'] },
    { name: '튜더',          keys: ['tudor', '튜더'] },
    { name: '브라이틀링',    keys: ['breitling', '브라이틀링'] },
    { name: '위블로',        keys: ['hublot', '위블로', '우블로'] },
    { name: '예거 르쿨트르', keys: ['jaeger', 'jaeger-lecoultre', 'jlc', '예거', '예거 르쿨트르'] },
    { name: '브레게',        keys: ['breguet', '브레게'] },
    { name: '블랑팡',        keys: ['blancpain', '블랑팡'] }
  ];

  // 메시지에서 브랜드(정규명) 배열 추출
  function extractBrands(text) {
    var t = String(text || '');
    var low = t.toLowerCase();
    var found = [];
    BRAND_ALIASES.forEach(function (b) {
      var hit = b.keys.some(function (k) {
        var kk = k.toLowerCase();
        // 영문 대문자 약어(AP/IWC/JLC)는 단어경계로, 한글은 단순 포함으로
        if (/^[a-z]+$/.test(kk) && kk.length <= 3) {
          return new RegExp('\\b' + kk + '\\b', 'i').test(t);
        }
        return low.indexOf(kk) >= 0;
      });
      if (hit) found.push(b.name);
    });
    // brands.js 사전 보강(미등록 브랜드도 잡히도록)
    if (window.BELLORE_BRANDS) {
      window.BELLORE_BRANDS.forEach(function (b) {
        if (b && b.name && t.indexOf(b.name) >= 0 && found.indexOf(b.name) < 0) found.push(b.name);
      });
    }
    return uniq(found);
  }

  // 메시지에서 모델명 추출(브랜드 사전의 models 기준)
  function extractModels(text) {
    var t = String(text || ''); var out = [];
    (window.BELLORE_BRANDS || []).forEach(function (b) {
      (b.models || []).forEach(function (m) { if (m && t.indexOf(m) >= 0) out.push(m); });
    });
    // 영문 대표 모델 키워드 보강
    ['Submariner', 'Daytona', 'GMT', 'Datejust', 'Nautilus', 'Aquanaut', 'Royal Oak', 'Speedmaster']
      .forEach(function (m) { if (new RegExp(m, 'i').test(t)) out.push(m); });
    out = uniq(out);
    // 더 긴 모델명의 부분문자열(예: "스피드마스터" 안의 "마스터")은 제거
    return out.filter(function (m) {
      return !out.some(function (o) { return o !== m && o.indexOf(m) >= 0; });
    });
  }

  // 자주 쓰는 레퍼런스 화이트리스트(정확도↑)
  var REF_WHITELIST = ['124060', '126610LN', '126610LV', '116610LN', '116610LV', '116500LN',
    '126500LN', '116500LV', '5711', '5712', '5990', '15202', '15500', '15510', '15400',
    '126710BLRO', '126710BLNR', '116710', '114060', '210.30', '311.30'];

  // 레퍼런스 추출: 화이트리스트 + 일반 패턴(통화/단위 숫자는 제외)
  function extractReferences(text) {
    var t = String(text || '');
    var out = [];
    // 1) 화이트리스트 우선
    REF_WHITELIST.forEach(function (r) {
      if (new RegExp(r.replace('.', '\\.'), 'i').test(t)) out.push(r.toUpperCase());
    });
    // 2) 일반 패턴: 4~6자리 숫자 + 영문 0~4 (예: 126610LN, 5711). 단, 뒤에
    //    만/천/억/원/% 가 붙는 "예산/수량" 숫자는 제외.
    var re = /\b(\d{4,6}[A-Za-z]{0,4})\b/g, m;
    while ((m = re.exec(t))) {
      var token = m[1];
      var after = t.slice(re.lastIndex, re.lastIndex + 2);
      if (/^[만천억원%]/.test(after)) continue;        // 1300만원 → 제외
      if (/^\d{4}$/.test(token) && Number(token) > 1900 && Number(token) < 2100) continue; // 연도(2024 등) 제외
      out.push(token.toUpperCase());
    }
    return uniq(out);
  }

  // 예산 추출 → { min, max } (KRW). 못 찾으면 null.
  function extractBudget(text) {
    var t = String(text || '').replace(/,/g, '');
    var unitVals = [];  // 단위(억/천만/만/원)가 붙은 금액
    var bareVals = [];  // 단위 없는 맨숫자(레퍼런스일 수 있어 후순위)
    // 억/천만/백만/만 단위 한국어 금액 파싱
    var re = /(\d+(?:\.\d+)?)\s*(억|천만|천|백만|만)?\s*(원)?/g, m;
    while ((m = re.exec(t))) {
      var num = parseFloat(m[1]); var unit = m[2] || ''; var won = m[3] || '';
      if (isNaN(num)) continue;
      var krw = null, hasUnit = true;
      if (unit === '억') krw = num * 100000000;
      else if (unit === '천만') krw = num * 10000000;
      else if (unit === '백만') krw = num * 1000000;
      else if (unit === '천') krw = num * 10000000;       // 시계 도메인: "1천" = 1천만
      else if (unit === '만') krw = num * 10000;            // "1000만" = 1천만
      else if (won) krw = num;                             // "5000000원"
      else {
        // 단위 없는 맨숫자: 3~5자리는 만원 단위로 간주("1500 이하" = 1500만)
        hasUnit = false;
        if (num >= 100 && num <= 99999) krw = num * 10000;
      }
      if (krw && krw >= 100000) (hasUnit ? unitVals : bareVals).push(krw);
    }
    // 단위 있는 금액이 하나라도 있으면 그것만 신뢰(레퍼런스 숫자 오인 방지).
    var values = unitVals.length ? unitVals : bareVals;
    if (!values.length) return null;
    // "이하/까지/미만" → 상한, "이상/부터" → 하한 힌트
    var hasMax = /(이하|까지|미만|under|아래)/.test(t);
    var hasMin = /(이상|부터|넘는|초과)/.test(t);
    var lo = Math.min.apply(null, values), hi = Math.max.apply(null, values);
    if (values.length >= 2) return { min: lo, max: hi };
    if (hasMax) return { min: null, max: hi };
    if (hasMin) return { min: lo, max: null };
    // 단일 금액 → ±15% 범위로 추정
    return { min: Math.round(hi * 0.85), max: Math.round(hi * 1.15) };
  }

  // 성향 추출 → 점수 델타({ price_sensitivity:+x, ... }) + 단계
  function extractPersonality(text) {
    var t = String(text || '');
    var d = {};
    function bump(k, v) { d[k] = (d[k] || 0) + v; }
    if (/(싸게|최저가|저렴|급매|할인|네고|가성비)/.test(t)) bump('price_sensitivity', 12);
    if (/(정확히|근거|비교|데이터|스펙|시세표|정가)/.test(t)) bump('detail_preference', 12);
    if (/(빨리|바로|지금|당장|오늘|즉시)/.test(t)) bump('speed_preference', 12);
    if (/(감가|리셀|투자|시세차익|되팔)/.test(t)) bump('resale_importance', 12);
    if (/(안전|정품|보증|감정|진품|보증서)/.test(t)) bump('risk_tolerance', -12); // 안전 선호 → 위험감내 낮춤
    return d;
  }

  // buying_stage 추정
  function estimateStage(text) {
    var t = String(text || '');
    if (/(팔|판매|매도|매입가|얼마에 사|되파|위탁)/.test(t)) return 'sell_intent';
    if (/(연락처|전화|구매할게|살게|예약|계약|입금|결제)/.test(t)) return 'ready_to_buy';
    if (/(매물|재고|있나요|입고|구할 수|구해|찾고 있)/.test(t)) return 'high_intent';
    if (/(얼마|가격|시세|예산|할인|네고)/.test(t)) return 'considering';
    return 'browsing';
  }

  var STAGE_PROB = { browsing: 15, considering: 40, high_intent: 65, ready_to_buy: 88, sell_intent: 25, unknown: 0 };

  // 종합 분석
  function analyze(message) {
    var brands = extractBrands(message);
    var models = extractModels(message);
    var refs = extractReferences(message);
    var budget = extractBudget(message);
    var personality = extractPersonality(message);
    var stage = estimateStage(message);
    return {
      brands: brands, models: models, references: refs,
      budget: budget, personality: personality,
      buying_stage: stage, buy_probability: STAGE_PROB[stage] || 0
    };
  }

  var rules = {
    extractBrands: extractBrands, extractModels: extractModels, extractReferences: extractReferences,
    extractBudget: extractBudget, extractPersonality: extractPersonality, estimateStage: estimateStage,
    analyze: analyze, BRAND_ALIASES: BRAND_ALIASES
  };

  /* ============================================================
     2) AIProvider 인터페이스(stub) + RuleBasedAIProvider
        나중에 OpenAIProvider/ClaudeProvider/LocalLLMProvider 로 교체.
     ============================================================ */
  // 인터페이스(문서용): analyzeMessage, summarizeCustomer, generateReply, extractExpertKnowledge
  var RuleBasedAIProvider = {
    name: 'rule-based',
    analyzeMessage: function (message /*, profile */) { return analyze(message); },
    summarizeCustomer: function (profile, conversations) {
      var p = profile || {};
      var bits = [];
      if ((p.preferred_brands || []).length) bits.push('관심 브랜드: ' + p.preferred_brands.join(', '));
      if ((p.preferred_models || []).length) bits.push('모델: ' + p.preferred_models.join(', '));
      if ((p.preferred_references || []).length) bits.push('레퍼런스: ' + p.preferred_references.join(', '));
      if (p.budget_min || p.budget_max) bits.push('예산: ' + krwShort(p.budget_min) + '~' + krwShort(p.budget_max));
      bits.push('구매단계: ' + (STAGE_LABEL[p.buying_stage] || p.buying_stage || '미상'));
      bits.push('구매가능성 ' + (p.buy_probability || 0) + '%');
      if (p.price_sensitivity >= 65) bits.push('가격 민감도 높음');
      if (p.resale_importance >= 65) bits.push('리셀가치 중시');
      var n = (conversations || []).length;
      return bits.join(' · ') + (n ? (' (대화 ' + n + '건 기반)') : '');
    },
    generateReply: function (message, profile, context) {
      var a = (context && context.analysis) || analyze(message);
      var parts = [];
      var tags = [];
      if (a.brands.length) tags.push(a.brands.join(', '));
      if (a.references.length) tags.push(a.references.join(', '));
      else if (a.models.length) tags.push(a.models.join(', '));
      if (tags.length) parts.push('"' + tags.join(' ') + '" 관심 정보를 저장했어요.');
      if (a.budget && (a.budget.min || a.budget.max)) {
        parts.push('예산 ' + krwShort(a.budget.min) + '~' + krwShort(a.budget.max) + ' 기준으로 매물을 찾아둘게요.');
      }
      var stageMsg = {
        sell_intent: '판매/위탁 상담으로 도와드릴게요. 모델과 구성품을 알려주시면 매입가를 안내드립니다.',
        ready_to_buy: '바로 진행 가능하세요. 담당 매니저 연결 또는 예약을 도와드릴까요?',
        high_intent: '원하시는 매물이 입고되면 가장 먼저 알림을 보내드릴게요. 입고 알림을 켜드릴까요?',
        considering: '가격/시세는 곧 연결될 추천 기능에서 정확히 안내드릴게요.',
        browsing: '천천히 둘러보세요. 관심 모델을 말씀해주시면 취향을 분석해 추천해드려요.'
      }[a.buying_stage];
      if (stageMsg) parts.push(stageMsg);
      if (!parts.length) parts.push('관심 정보를 저장했습니다. 선호 브랜드/모델/예산을 분석하고 있습니다. 상품 추천 기능은 곧 연결됩니다.');
      else parts.push('상품 추천 기능은 곧 연결됩니다.');
      return parts.join(' ');
    },
    extractExpertKnowledge: function (teamMessages) {
      // 팀 메시지에서 브랜드/레퍼런스/시세 키워드를 태깅한 지식 후보 생성
      return (teamMessages || []).map(function (m) {
        var txt = m.message || m.content || '';
        return {
          brand: (extractBrands(txt)[0] || null),
          reference_number: (extractReferences(txt)[0] || null),
          title: txt.slice(0, 40),
          content: txt,
          confidence: 60,
          status: 'draft'
        };
      });
    }
  };
  // 현재 사용 Provider (교체 지점)
  var provider = RuleBasedAIProvider;

  var STAGE_LABEL = { browsing: '둘러보는 중', considering: '가격 비교 중', high_intent: '매물 찾는 중', ready_to_buy: '구매 임박', sell_intent: '판매 문의', unknown: '미상' };
  function krwShort(n) {
    if (n == null) return '-';
    n = Number(n); if (!n) return '-';
    if (n >= 100000000) return (n / 100000000).toFixed(n % 100000000 ? 1 : 0) + '억';
    if (n >= 10000) return Math.round(n / 10000).toLocaleString() + '만';
    return n.toLocaleString();
  }

  /* ============================================================
     3) 프로필 저장소 — DB(로그인) / localStorage(게스트)
     ============================================================ */
  var LS_PROFILE = 'bellore_ai_profile';
  var LS_BUFFER = 'bellore_ai_buffer'; // 게스트 대화/이벤트 버퍼(로그인 시 병합)

  function lsGet(k, def) { try { return JSON.parse(localStorage.getItem(k)) || def; } catch (e) { return def; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  function blankProfile() {
    return {
      preferred_brands: [], preferred_models: [], preferred_references: [],
      budget_min: null, budget_max: null,
      price_sensitivity: 50, speed_preference: 50, detail_preference: 50,
      risk_tolerance: 50, resale_importance: 50,
      buying_stage: 'unknown', buy_probability: 0,
      consent_personalization: false, consent_marketing: false
    };
  }

  var _profileCache = null; // 현재 세션 프로필(메모리)

  // 로그인 사용자 프로필 보장(없으면 생성) → row 반환
  function ensureProfile() {
    if (!dbOn()) {
      // 게스트: localStorage 프로필
      _profileCache = lsGet(LS_PROFILE, null) || blankProfile();
      return Promise.resolve(_profileCache);
    }
    var u = curUser();
    return sb().from('customer_ai_profiles').select('*').eq('user_id', u.uid).limit(1)
      .then(function (res) {
        if (res.error) throw res.error;
        if (res.data && res.data.length) { _profileCache = res.data[0]; return _profileCache; }
        var row = Object.assign(blankProfile(), {
          user_id: u.uid, email: u.email || null,
          name: u.displayName || null
        });
        return sb().from('customer_ai_profiles').insert(row).select().single()
          .then(function (r2) { if (r2.error) throw r2.error; _profileCache = r2.data; return _profileCache; });
      })
      .catch(function (e) {
        // DB 미설정/SQL 미실행 → 게스트 폴백(끊김 없음)
        console.warn('[BelloreAI] 프로필 DB 폴백:', e && e.message);
        _profileCache = lsGet(LS_PROFILE, null) || blankProfile();
        return _profileCache;
      });
  }

  // 분석 결과를 프로필에 병합 → 저장. (profileUpdater)
  function applyAnalysis(profile, a) {
    var p = profile || blankProfile();
    p.preferred_brands = uniq((p.preferred_brands || []).concat(a.brands || []));
    p.preferred_models = uniq((p.preferred_models || []).concat(a.models || []));
    p.preferred_references = uniq((p.preferred_references || []).concat(a.references || []));
    if (a.budget) {
      if (a.budget.min != null) p.budget_min = p.budget_min ? Math.min(p.budget_min, a.budget.min) : a.budget.min;
      if (a.budget.max != null) p.budget_max = p.budget_max ? Math.max(p.budget_max, a.budget.max) : a.budget.max;
    }
    Object.keys(a.personality || {}).forEach(function (k) {
      p[k] = clamp((p[k] == null ? 50 : p[k]) + a.personality[k], 0, 100);
    });
    if (a.buying_stage && a.buying_stage !== 'browsing') p.buying_stage = a.buying_stage;
    else if (!p.buying_stage || p.buying_stage === 'unknown') p.buying_stage = a.buying_stage;
    // 구매가능성: 단계 기반 + 가격민감/리셀 보정
    var prob = STAGE_PROB[p.buying_stage] || 0;
    if ((p.preferred_references || []).length) prob += 8;
    if (p.budget_max) prob += 5;
    p.buy_probability = clamp(Math.round(prob), 0, 99);
    p.ai_summary = provider.summarizeCustomer(p, null);
    return p;
  }

  // 프로필 저장(DB 또는 localStorage)
  function saveProfile(p) {
    _profileCache = p;
    if (!dbOn() || !p.id) {
      // 게스트(또는 폴백): localStorage
      if (!p.id) { lsSet(LS_PROFILE, p); return Promise.resolve(p); }
    }
    if (dbOn() && p.id) {
      var patch = {
        preferred_brands: p.preferred_brands, preferred_models: p.preferred_models,
        preferred_references: p.preferred_references, budget_min: p.budget_min, budget_max: p.budget_max,
        price_sensitivity: p.price_sensitivity, speed_preference: p.speed_preference,
        detail_preference: p.detail_preference, risk_tolerance: p.risk_tolerance,
        resale_importance: p.resale_importance, buying_stage: p.buying_stage,
        buy_probability: p.buy_probability, ai_summary: p.ai_summary,
        consent_personalization: p.consent_personalization, consent_marketing: p.consent_marketing
      };
      return sb().from('customer_ai_profiles').update(patch).eq('id', p.id)
        .then(function (r) { if (r.error) console.warn('[BelloreAI] 프로필 저장 보류:', r.error.message); return p; });
    }
    lsSet(LS_PROFILE, p);
    return Promise.resolve(p);
  }

  /* ============================================================
     4) 관심 점수 누적 (customer_watch_interests)
     ============================================================ */
  var SCORE_BY_SOURCE = {
    chat: 10, click: 2, wishlist: 15, inquiry: 30, price_alert: 25, purchase: 50
  };

  function bumpInterest(profile, item, source) {
    var pts = SCORE_BY_SOURCE[source] || 5;
    if (!profile || !profile.id || !dbOn()) {
      // 게스트: 로컬 버퍼에만 누적(병합 시 반영)
      var buf = lsGet(LS_BUFFER, { conversations: [], events: [], interests: [] });
      buf.interests.push({ brand: item.brand || null, model: item.model || null, reference_number: item.reference_number || null, pts: pts, source: source, at: nowISO() });
      lsSet(LS_BUFFER, buf);
      return Promise.resolve();
    }
    var key = { profile_id: profile.id, user_id: profile.user_id || null,
      brand: item.brand || null, model: item.model || null, reference_number: item.reference_number || null };
    // 같은 프로필의 관심행을 모두 받아 (브랜드,모델,레퍼런스) 조합으로 매칭(널 안전).
    return sb().from('customer_watch_interests').select('id,interest_score,brand,model,reference_number')
      .eq('profile_id', profile.id)
      .then(function (res) {
        var rows = res.data || [];
        var match = rows.filter(function (r) {
          return (r.brand || null) === (item.brand || null) &&
                 (r.model || null) === (item.model || null) &&
                 (r.reference_number || null) === (item.reference_number || null);
        })[0];
        var tstamp = source === 'click' ? { last_clicked_at: nowISO() }
          : source === 'wishlist' ? { last_wishlisted_at: nowISO() }
          : { last_mentioned_at: nowISO() };
        if (match) {
          return sb().from('customer_watch_interests')
            .update(Object.assign({ interest_score: (match.interest_score || 0) + pts }, tstamp))
            .eq('id', match.id);
        }
        return sb().from('customer_watch_interests')
          .insert(Object.assign(key, { interest_score: pts, source: source }, tstamp));
      })
      .catch(function (e) { console.warn('[BelloreAI] 관심점수 보류:', e && e.message); });
  }

  /* ============================================================
     5) 이벤트 기록 (customer_events) + 관심 점수
        외부에서 호출: BelloreAI.track('product_view', {brand,model,reference_number,product_id})
     ============================================================ */
  var EVENT_SOURCE = {
    product_view: 'click', wishlist_add: 'wishlist', wishlist_remove: null,
    inquiry_submit: 'inquiry', price_alert_set: 'price_alert',
    chat_message: 'chat', purchase_request: 'purchase', sell_request: 'inquiry'
  };

  function track(eventType, data) {
    data = data || {};
    return ensureProfile().then(function (p) {
      var evt = {
        event_type: eventType, product_id: data.product_id || null,
        brand: data.brand || null, model: data.model || null,
        reference_number: data.reference_number || null, value: data.value || {}
      };
      // 관심 점수 누적
      var src = EVENT_SOURCE[eventType];
      var bumpP = (src && (data.brand || data.model || data.reference_number))
        ? bumpInterest(p, evt, src) : Promise.resolve();
      // 이벤트 저장
      var saveP;
      if (dbOn() && p.id) {
        saveP = sb().from('customer_events').insert(Object.assign({ profile_id: p.id, user_id: p.user_id || null }, evt))
          .then(function (r) { if (r.error) console.warn('[BelloreAI] 이벤트 보류:', r.error.message); });
      } else {
        var buf = lsGet(LS_BUFFER, { conversations: [], events: [], interests: [] });
        buf.events.push(Object.assign({ at: nowISO() }, evt)); lsSet(LS_BUFFER, buf);
        saveP = Promise.resolve();
      }
      return Promise.all([bumpP, saveP]);
    });
  }

  /* ============================================================
     6) 대화 처리 파이프라인 (채팅 1턴)
     ============================================================ */
  function logConversation(profile, role, message, metadata) {
    metadata = metadata || {};
    if (dbOn() && profile && profile.id) {
      return sb().from('ai_conversations').insert({
        profile_id: profile.id, user_id: profile.user_id || null,
        role: role, message: message, channel: 'web', metadata: metadata
      }).then(function (r) { if (r.error) console.warn('[BelloreAI] 대화 저장 보류:', r.error.message); });
    }
    var buf = lsGet(LS_BUFFER, { conversations: [], events: [], interests: [] });
    buf.conversations.push({ role: role, message: message, metadata: metadata, at: nowISO() }); lsSet(LS_BUFFER, buf);
    return Promise.resolve();
  }

  // 사용자 메시지 1턴 처리 → { reply, analysis, profile }
  function handleUserMessage(message) {
    var a = analyze(message);
    return ensureProfile().then(function (p) {
      return Promise.resolve().then(function () {
        var p2 = applyAnalysis(p, a);
        return saveProfile(p2).then(function () {
          // 관심 점수: 브랜드/모델/레퍼런스 언급 → chat(+10)
          var items = buildInterestItems(a);
          var chain = Promise.resolve();
          items.forEach(function (it) { chain = chain.then(function () { return bumpInterest(p2, it, 'chat'); }); });
          // 이벤트
          chain = chain.then(function () {
            return (dbOn() && p2.id)
              ? sb().from('customer_events').insert({ profile_id: p2.id, user_id: p2.user_id || null, event_type: 'chat_message', brand: a.brands[0] || null, model: a.models[0] || null, reference_number: a.references[0] || null }).then(function () {})
              : Promise.resolve();
          });
          return chain.then(function () {
            // 추천 의도(추천/예산/매물 키워드 또는 브랜드·레퍼런스 언급)면 실제 매물 추천
            var wantReco = /추천|매물|예산|보여|찾아|있나|입고/.test(message) || a.references.length || a.brands.length;
            var recoP = wantReco ? recommendProducts(p2, 3).catch(function () { return []; }) : Promise.resolve([]);
            return recoP.then(function (recos) {
              // 개선 루프: 브랜드/레퍼런스도 못 잡고 추천도 못 준 질문 = "대응 어려움" → 표시
              var handled = a.brands.length || a.references.length || (recos && recos.length) || a.buying_stage === 'sell_intent';
              var userMeta = { analysis: { brands: a.brands, references: a.references, stage: a.buying_stage } };
              if (!handled) userMeta.needs_review = true;
              return logConversation(p2, 'user', message, userMeta.needs_review ? userMeta : null).then(function () {
                return composeReply(message, p2, a, recos).then(function (reply) {
                  return logConversation(p2, 'assistant', reply).then(function () {
                    return { reply: reply, analysis: a, profile: p2, recommendations: recos, handled: !!handled };
                  });
                });
              });
            });
          });
        });
      });
    });
  }

  // 추천 결과를 사람이 읽는 줄글로
  function recoLines(recos) {
    if (!recos || !recos.length) return '';
    var lines = recos.map(function (x, i) {
      var p = x.product;
      var name = [p.brand, p.model, p.reference_number].filter(Boolean).join(' ') || '매물';
      return (i + 1) + '. ' + name + ' · ' + krwShort(p.price) + '원 (적합도 ' + x.score + '점)';
    });
    return '\n\n추천 매물:\n' + lines.join('\n');
  }

  // 답변 생성: AI 활성(window.BELLORE_AI_REPLY)이면 ai-learn 호출, 아니면 규칙기반.
  // 어느 쪽이든 실제 추천 매물 줄글을 함께 붙인다(무료, 추천 동작 보장).
  function composeReply(message, profile, a, recos) {
    var base = provider.generateReply(message, profile, { analysis: a });
    var withReco = base + recoLines(recos);
    if (window.BELLORE_AI_REPLY === true && sb() && sb().functions) {
      var cand = (recos || []).map(function (x) { return { name: [x.product.brand, x.product.model, x.product.reference_number].filter(Boolean).join(' '), price: x.product.price, score: x.score }; });
      return sb().functions.invoke('ai-learn', { body: { action: 'generate_reply', profile_id: (profile && profile.id) || null, message: message, candidates: cand } })
        .then(function (res) {
          var r = res && res.data && res.data.result && res.data.result.reply;
          if (r) return r + recoLines(recos);
          return withReco; // skipped/실패 → 규칙기반
        }).catch(function () { return withReco; });
    }
    return Promise.resolve(withReco);
  }

  function buildInterestItems(a) {
    var items = [];
    var brand = a.brands[0] || null;
    if (a.references.length) a.references.forEach(function (r) { items.push({ brand: brand, model: a.models[0] || null, reference_number: r }); });
    else if (a.models.length) a.models.forEach(function (m) { items.push({ brand: brand, model: m, reference_number: null }); });
    else if (brand) items.push({ brand: brand, model: null, reference_number: null });
    return items;
  }

  /* ============================================================
     7) 추천 엔진 — calculateRecommendationScore (100점)
     ------------------------------------------------------------
     product 정규화 형태: { id, brand, model, reference_number, price,
       condition, color, size, prev_price }
     listings 어댑터: normalizeListing(row)
     ============================================================ */
  function normalizeListing(row) {
    if (!row) return null;
    return {
      id: row.id,
      brand: row.title || row.brand || '',      // 벨로르: listings.title = 브랜드
      model: row.description || row.model || '', // listings.description = 모델
      reference_number: row.reference_number || row.product_no || '',
      price: Number(row.price) || 0,
      condition: row.condition || row.grade || '',
      color: row.dial_color || '',
      size: row.size_mm || '',
      material: row.material || '',
      prev_price: row.prev_price != null ? Number(row.prev_price) : null
    };
  }

  function calculateRecommendationScore(profile, product, interests, events) {
    profile = profile || {}; product = product || {};
    var bd = {}; var reasons = [];
    var pb = (profile.preferred_brands || []);
    var pm = (profile.preferred_models || []);
    var pr = (profile.preferred_references || []);

    // 브랜드 일치 30
    bd.brand = (product.brand && pb.indexOf(product.brand) >= 0) ? 30 : 0;
    if (bd.brand) reasons.push('관심 브랜드 일치');

    // 레퍼런스/모델 일치 25
    var refHit = product.reference_number && pr.some(function (r) { return product.reference_number.toUpperCase().indexOf(r.toUpperCase()) >= 0; });
    var modelHit = product.model && pm.some(function (m) { return product.model.indexOf(m) >= 0; });
    bd.model = refHit ? 25 : (modelHit ? 18 : 0);
    if (refHit) reasons.push('레퍼런스 일치'); else if (modelHit) reasons.push('모델 일치');

    // 예산 범위 20
    var price = product.price || 0;
    var lo = profile.budget_min, hi = profile.budget_max;
    if (price > 0 && (lo || hi)) {
      var inLo = lo == null || price >= lo * 0.9;
      var inHi = hi == null || price <= hi * 1.1;
      bd.budget = (inLo && inHi) ? 20 : (inHi ? 10 : 0);
      if (bd.budget >= 20) reasons.push('예산 범위 적합');
    } else bd.budget = 0;

    // 선호 상태/색상/사이즈 10
    var attr = 0;
    if (profile.preferred_condition && product.condition && product.condition.indexOf(profile.preferred_condition) >= 0) attr += 4;
    if (profile.preferred_color && product.color && product.color.indexOf(profile.preferred_color) >= 0) attr += 3;
    if (profile.preferred_size && product.size && String(product.size).indexOf(String(profile.preferred_size)) >= 0) attr += 3;
    bd.attr = attr; if (attr) reasons.push('선호 속성 일치');

    // 최근 관심/찜/문의 이력 10
    var recent = 0;
    (interests || []).forEach(function (it) {
      var hitB = it.brand && it.brand === product.brand;
      var hitR = it.reference_number && product.reference_number && it.reference_number.toUpperCase() === product.reference_number.toUpperCase();
      if (hitR) recent = Math.max(recent, 10);
      else if (hitB && (it.interest_score || 0) >= 20) recent = Math.max(recent, 7);
      else if (hitB) recent = Math.max(recent, 4);
    });
    bd.recent = recent; if (recent >= 7) reasons.push('최근 관심 이력');

    // 가격 하락/좋은 가격 5
    var pricePoint = 0;
    if (product.prev_price && product.price && product.price < product.prev_price) { pricePoint = 5; reasons.push('가격 인하'); }
    else if (hi && price && price <= hi * 0.95) pricePoint = 3;
    bd.price_point = pricePoint;

    var total = bd.brand + bd.model + bd.budget + bd.attr + bd.recent + bd.price_point;
    return { score: total, breakdown: bd, reason: reasons.join(', ') || '기본 매칭' };
  }

  // 한 고객에 대해 상품목록 추천 후보 산출 + 로그 저장(선택)
  function recommendForProfile(profile, products, interests, events, opts) {
    opts = opts || {};
    var ranked = (products || []).map(function (raw) {
      var prod = raw.__normalized ? raw : normalizeListing(raw);
      var r = calculateRecommendationScore(profile, prod, interests, events);
      return { product: prod, score: r.score, reason: r.reason, breakdown: r.breakdown };
    }).filter(function (x) { return x.score >= (opts.minScore || 1); })
      .sort(function (a, b) { return b.score - a.score; });
    if (opts.persist && dbOn() && profile && profile.id) {
      var rows = ranked.slice(0, opts.limit || 10).map(function (x) {
        return { profile_id: profile.id, user_id: profile.user_id || null, product_id: x.product.id || null,
          score: x.score, reason: x.reason, score_breakdown: x.breakdown, status: 'candidate' };
      });
      if (rows.length) sb().from('ai_recommendation_logs').insert(rows).then(function (r) { if (r.error) console.warn('[BelloreAI] 추천로그 보류:', r.error.message); });
    }
    return ranked;
  }

  /* 벨로르 판매시계 1회성 조회(추천 소스). 캐시 60초. */
  var _prodCache = null, _prodAt = 0;
  function fetchProducts() {
    if (_prodCache && (Date.now() - _prodAt) < 60000) return Promise.resolve(_prodCache);
    if (!(B() && B().subscribeProducts)) return Promise.resolve([]);
    return new Promise(function (resolve) {
      var done = false, unsub = null;
      try {
        unsub = B().subscribeProducts(function (list) {
          if (done) return; done = true;
          _prodCache = (list || []).filter(function (p) { return (p.status || 'on') !== 'sold' && (p.status || 'on') !== 'hidden'; });
          _prodAt = Date.now();
          if (unsub) try { unsub(); } catch (e) {}
          resolve(_prodCache);
        });
      } catch (e) { resolve([]); }
      setTimeout(function () { if (!done) { done = true; resolve(_prodCache || []); } }, 2500);
    });
  }

  // 프로필 기반 실제 매물 추천(규칙기반, 무료). 상위 N개 반환.
  function recommendProducts(profile, limit) {
    return fetchProducts().then(function (products) {
      if (!products.length) return [];
      var ranked = recommendForProfile(profile, products, [], [], { minScore: 20, persist: false });
      return ranked.slice(0, limit || 3);
    });
  }

  /* ============================================================
     8) 알림 후보 생성 — generateAlertCandidates
        신규 상품/가격변경 시 고객 관심조건과 비교 → 85점↑ pending 저장.
        products: listings 행 배열, profiles: customer_ai_profiles 배열
        (관리자 화면에서 호출. 발송은 하지 않고 status='pending')
     ============================================================ */
  function buildAlertCandidates(product, profile, interests, events, opts) {
    opts = opts || {};
    var prod = product.__normalized ? product : normalizeListing(product);
    var r = calculateRecommendationScore(profile, prod, interests, events);
    if (r.score < (opts.threshold || 85)) return null;
    var hasPriceAlert = (events || []).some(function (e) { return e.event_type === 'price_alert_set'; });
    var priority = (profile.consent_marketing || hasPriceAlert) ? 'high' : 'normal';
    var alertType = (prod.prev_price && prod.price < prod.prev_price) ? 'price_drop' : 'new_arrival';
    var name = [prod.brand, prod.model, prod.reference_number].filter(Boolean).join(' ');
    var title = alertType === 'price_drop' ? (name + ' 가격 인하') : (name + ' 입고');
    var message = alertType === 'price_drop'
      ? ('관심 모델 ' + name + ' 가격이 내려갔습니다. 현재가 ' + krwShort(prod.price) + '원. 확인하시겠습니까?')
      : ('찾으시던 ' + name + ' 매물이 입고되었습니다. 현재 등록가가 고객님 관심 예산 범위에 들어옵니다. 확인하시겠습니까?');
    return {
      profile_id: profile.id, user_id: profile.user_id || null, product_id: prod.id || null,
      alert_type: alertType, title: title, message: message,
      match_score: r.score, reason: r.reason + (priority === 'high' ? ' · 우선순위 높음' : ''),
      status: 'pending'
    };
  }

  // 여러 고객 × 상품 → 후보 배열(+ DB 저장 옵션)
  function generateAlertCandidates(product, profilesWithCtx, opts) {
    opts = opts || {};
    var out = [];
    (profilesWithCtx || []).forEach(function (ctx) {
      var c = buildAlertCandidates(product, ctx.profile, ctx.interests, ctx.events, opts);
      if (c) out.push(c);
    });
    if (opts.persist && dbOn() && out.length) {
      sb().from('ai_alert_candidates').insert(out).then(function (r) { if (r.error) console.warn('[BelloreAI] 알림후보 보류:', r.error.message); });
    }
    return out;
  }

  /* ============================================================
     9) 로그인 시 게스트 버퍼 → DB 병합
     ============================================================ */
  function flushBufferToDB() {
    if (!dbOn()) return Promise.resolve();
    var buf = lsGet(LS_BUFFER, null);
    var localProfile = lsGet(LS_PROFILE, null);
    if (!buf && !localProfile) return ensureProfile();
    return ensureProfile().then(function (p) {
      if (!p || !p.id) return;
      var jobs = [];
      // 로컬 프로필 성향/관심을 서버 프로필에 병합
      if (localProfile) {
        var merged = applyAnalysis(p, {
          brands: localProfile.preferred_brands || [], models: localProfile.preferred_models || [],
          references: localProfile.preferred_references || [],
          budget: { min: localProfile.budget_min, max: localProfile.budget_max },
          personality: {}, buying_stage: localProfile.buying_stage || 'unknown'
        });
        merged.consent_personalization = merged.consent_personalization || localProfile.consent_personalization;
        merged.consent_marketing = merged.consent_marketing || localProfile.consent_marketing;
        jobs.push(saveProfile(merged));
      }
      if (buf) {
        (buf.conversations || []).forEach(function (c) {
          jobs.push(sb().from('ai_conversations').insert({ profile_id: p.id, user_id: p.uid || p.user_id, role: c.role, message: c.message, channel: 'web' }));
        });
        (buf.events || []).forEach(function (e) {
          jobs.push(sb().from('customer_events').insert({ profile_id: p.id, user_id: p.user_id || null, event_type: e.event_type, brand: e.brand, model: e.model, reference_number: e.reference_number, value: e.value || {} }));
        });
        (buf.interests || []).forEach(function (it) {
          jobs.push(bumpInterest(p, it, it.source || 'chat'));
        });
      }
      return Promise.all(jobs.map(function (j) { return Promise.resolve(j).catch(function () {}); }))
        .then(function () { lsSet(LS_BUFFER, { conversations: [], events: [], interests: [] }); });
    }).catch(function () {});
  }

  /* ============================================================
     10) 고객용 AI 비서 UI — 플로팅 버튼 + 채팅 패널 (JS 자체 주입)
     ============================================================ */
  var CONSENT_KEY = 'bellore_ai_consent';
  function consentGiven() { return lsGet(CONSENT_KEY, false) === true; }

  var ROBOT = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="8" width="18" height="12" rx="3"/><path d="M12 8V4"/><circle cx="12" cy="3" r="1.4" fill="currentColor"/><circle cx="8.5" cy="14" r="1.2" fill="currentColor"/><circle cx="15.5" cy="14" r="1.2" fill="currentColor"/><path d="M9 17.5h6"/></svg>';

  function injectStyles() {
    if ($('#bellore-ai-style')) return;
    var css = ''
      + '#belloreAiFab{position:fixed;right:18px;bottom:84px;z-index:1200;display:flex;align-items:center;gap:8px;height:52px;padding:0 18px 0 16px;border:none;border-radius:26px;background:#111;color:#fff;font:700 15px Pretendard,-apple-system,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.22);cursor:pointer}'
      + '#belloreAiFab:active{transform:scale(.97)}'
      + '#belloreAiFab .bai-dot{position:absolute;top:-2px;right:-2px;min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:#e23b3b;color:#fff;font:700 11px Pretendard;display:none;align-items:center;justify-content:center}'
      + '.bai-panel{position:fixed;inset:0;z-index:1300;display:none;background:rgba(0,0,0,.32)}'
      + '.bai-panel.show{display:block}'
      + '.bai-sheet{position:absolute;right:0;bottom:0;left:0;margin:0 auto;max-width:480px;height:88vh;background:#fff;border-radius:18px 18px 0 0;display:flex;flex-direction:column;overflow:hidden;font-family:Pretendard,-apple-system,sans-serif}'
      + '@media(min-width:560px){.bai-sheet{right:18px;left:auto;bottom:18px;border-radius:18px;height:600px;max-height:84vh}}'
      + '.bai-head{display:flex;align-items:center;gap:10px;padding:16px 18px;border-bottom:1px solid #e5e3df}'
      + '.bai-head .bai-ic{width:34px;height:34px;border-radius:50%;background:#111;color:#fff;display:flex;align-items:center;justify-content:center}'
      + '.bai-head b{font-size:16px;font-weight:700;color:#1a1a1a}'
      + '.bai-head .bai-sub{font-size:12px;color:#6b6b6b;margin-top:1px}'
      + '.bai-x{margin-left:auto;background:none;border:none;font-size:24px;color:#9a9a9a;cursor:pointer;line-height:1}'
      + '.bai-body{flex:1;overflow:auto;padding:16px;background:#f7f6f3}'
      + '.bai-menu{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px}'
      + '.bai-chip{padding:9px 13px;border:1px solid #e5e3df;border-radius:18px;background:#fff;font:600 13px Pretendard;color:#1a1a1a;cursor:pointer}'
      + '.bai-chip:active{background:#f2f3f5}'
      + '.bai-msg{max-width:82%;margin:8px 0;padding:11px 14px;border-radius:14px;font-size:14px;line-height:1.55;white-space:pre-wrap;word-break:break-word}'
      + '.bai-msg.user{margin-left:auto;background:#111;color:#fff;border-bottom-right-radius:4px}'
      + '.bai-msg.bot{margin-right:auto;background:#fff;color:#1a1a1a;border:1px solid #e5e3df;border-bottom-left-radius:4px}'
      + '.bai-foot{display:flex;gap:8px;padding:12px 14px;border-top:1px solid #e5e3df;background:#fff}'
      + '.bai-foot input{flex:1;height:46px;padding:0 14px;border:1px solid #e5e3df;border-radius:12px;font-size:15px;font-family:Pretendard}'
      + '.bai-foot input:focus{outline:none;border-color:#1a1a1a}'
      + '.bai-foot button{height:46px;padding:0 18px;border:none;border-radius:12px;background:#111;color:#fff;font:700 15px Pretendard;cursor:pointer}'
      + '.bai-consent{background:#fff;border:1px solid #e5e3df;border-radius:14px;padding:16px;margin-bottom:14px}'
      + '.bai-consent p{font-size:13px;line-height:1.6;color:#1a1a1a;margin:0 0 12px}'
      + '.bai-consent label{display:flex;align-items:flex-start;gap:8px;font-size:13px;color:#1a1a1a;margin:8px 0;cursor:pointer}'
      + '.bai-consent label input{margin-top:2px}'
      + '.bai-consent .bai-agree{width:100%;height:46px;margin-top:10px;border:none;border-radius:12px;background:#111;color:#fff;font:700 15px Pretendard;cursor:pointer}'
      + '.bai-consent .bai-agree:disabled{background:#eceae6;color:#9a9a9a}';
    var st = document.createElement('style'); st.id = 'bellore-ai-style'; st.textContent = css;
    document.head.appendChild(st);
  }

  var MENU = [
    { t: '시계 추천받기', q: '제 취향에 맞는 시계를 추천해주세요' },
    { t: '내 예산 매물', q: '제 예산에 맞는 매물을 보여주세요' },
    { t: '시세 물어보기', q: '시세를 알고 싶어요' },
    { t: '입고 알림 설정', q: '입고 알림을 설정하고 싶어요' },
    { t: '내 취향 분석', q: '__profile__' },
    { t: '상담사 연결', q: '__support__' }
  ];

  var elFab, elPanel, elBody, elInput;

  function buildUI() {
    injectStyles();
    elFab = document.createElement('button');
    elFab.id = 'belloreAiFab'; elFab.type = 'button';
    elFab.innerHTML = ROBOT + '<span>BELLORE AI</span><span class="bai-dot" id="baiDot"></span>';
    document.body.appendChild(elFab);

    elPanel = document.createElement('div');
    elPanel.className = 'bai-panel';
    elPanel.innerHTML =
      '<div class="bai-sheet">' +
        '<div class="bai-head">' +
          '<span class="bai-ic">' + ROBOT + '</span>' +
          '<div><b>BELLORE AI</b><div class="bai-sub">시계 전문비서 · 규칙기반 베타</div></div>' +
          '<button class="bai-x" type="button" aria-label="닫기">×</button>' +
        '</div>' +
        '<div class="bai-body" id="baiBody"></div>' +
        '<div class="bai-foot">' +
          '<input id="baiInput" type="text" placeholder="브랜드·모델·예산을 입력해보세요" autocomplete="off">' +
          '<button type="button" id="baiSend">전송</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(elPanel);
    elBody = $('#baiBody'); elInput = $('#baiInput');

    elFab.addEventListener('click', openPanel);
    elPanel.addEventListener('click', function (e) {
      if (e.target.classList.contains('bai-panel') || e.target.classList.contains('bai-x')) closePanel();
      var chip = e.target.closest('.bai-chip');
      if (chip) onMenu(chip.dataset.q);
    });
    $('#baiSend').addEventListener('click', sendCurrent);
    elInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') sendCurrent(); });
  }

  function openPanel() {
    elPanel.classList.add('show');
    var dot = $('#baiDot'); if (dot) dot.style.display = 'none';
    if (!elBody.dataset.init) {
      elBody.dataset.init = '1';
      if (!consentGiven()) renderConsent();
      else renderIntro();
    }
    setTimeout(function () { elInput && elInput.focus(); }, 100);
  }
  function closePanel() { elPanel.classList.remove('show'); }

  function renderConsent() {
    elBody.innerHTML =
      '<div class="bai-consent">' +
        '<p>벨로르 AI 비서는 맞춤 시계 추천, 시세 안내, 입고 알림 제공을 위해 대화 내용, 관심 상품, 예산, 구매 선호 정보를 저장하고 분석할 수 있습니다.</p>' +
        '<label><input type="checkbox" id="baiC1"> 맞춤 추천 데이터 사용 동의 (필수)</label>' +
        '<label><input type="checkbox" id="baiC2"> 마케팅/입고 알림 수신 동의 (선택)</label>' +
        '<button class="bai-agree" id="baiAgree" disabled>동의하고 시작하기</button>' +
      '</div>';
    var c1 = $('#baiC1'), agree = $('#baiAgree');
    c1.addEventListener('change', function () { agree.disabled = !c1.checked; });
    agree.addEventListener('click', function () {
      lsSet(CONSENT_KEY, true);
      var c2 = $('#baiC2').checked;
      ensureProfile().then(function (p) {
        p.consent_personalization = true; p.consent_marketing = !!c2;
        saveProfile(p);
      });
      renderIntro();
    });
  }

  function renderIntro() {
    elBody.innerHTML =
      '<div class="bai-menu">' +
        MENU.map(function (m) { return '<button class="bai-chip" type="button" data-q="' + esc(m.q) + '">' + esc(m.t) + '</button>'; }).join('') +
      '</div>';
    // 바이버원처럼 능동적으로: 기억이 있으면 분석 기반으로 "먼저" 추천/인사, 없으면 먼저 질문.
    ensureProfile().then(function (p) {
      var brands = (p && p.preferred_brands) || [];
      if (brands.length || (p && (p.budget_max || (p.preferred_references || []).length))) {
        var who = brands.slice(0, 2).join(', ');
        addBot('다시 오셨네요' + (who ? (', ' + who) : '') + ' 관심 있으셨죠. 그새 들어온 매물을 확인해봤어요.');
        // 분석 기반 선제 추천
        recommendProducts(p, 3).then(function (recos) {
          if (recos && recos.length) {
            addBot('고객님 취향에 맞춰 이런 시계를 추천드려요:' + recoLines(recos) + '\n\n더 좁혀서 찾아드릴까요? 예산이나 모델을 말씀해 주세요.');
          } else {
            addBot('지금 딱 맞는 매물은 준비 중이에요. 원하시는 예산·모델을 알려주시면 입고되는 대로 가장 먼저 알려드릴게요.');
          }
        }).catch(function () {});
      } else {
        addBot('안녕하세요, 벨로르 AI 시계 전문비서예요. 어떤 시계를 찾고 계세요? 브랜드나 예산만 알려주셔도 딱 맞는 매물을 찾아드려요.');
      }
    }).catch(function () {
      addBot('안녕하세요, 벨로르 AI 시계 전문비서예요. 어떤 시계를 찾고 계세요?');
    });
  }

  function addMsg(role, text) {
    var d = document.createElement('div');
    d.className = 'bai-msg ' + (role === 'user' ? 'user' : 'bot');
    d.textContent = text;
    elBody.appendChild(d);
    elBody.scrollTop = elBody.scrollHeight;
    return d;
  }
  function addBot(t) { return addMsg('bot', t); }
  function addUser(t) { return addMsg('user', t); }

  function onMenu(q) {
    if (q === '__profile__') { showProfileSummary(); return; }
    if (q === '__support__') {
      addUser('상담사 연결');
      addBot('카카오톡 오픈채팅으로 연결해드릴게요. 우측 하단 상담 채널 또는 문의 페이지를 이용해 주세요. 남겨주신 관심 정보는 담당 매니저에게 함께 전달됩니다.');
      track('inquiry_submit', { value: { via: 'ai_assistant' } });
      return;
    }
    elInput.value = q; sendCurrent();
  }

  function showProfileSummary() {
    ensureProfile().then(function (p) {
      addUser('내 취향 분석');
      var s = provider.summarizeCustomer(p, null);
      var lines = ['지금까지 분석된 취향이에요:', '', s];
      if (!(p.preferred_brands || []).length) lines = ['아직 분석된 관심 정보가 적어요. 관심 브랜드·모델·예산을 말씀해 주시면 더 정확해져요.'];
      addBot(lines.join('\n'));
    });
  }

  var _busy = false;
  function sendCurrent() {
    var msg = (elInput.value || '').trim();
    if (!msg || _busy) return;
    if (!consentGiven()) { renderConsent(); return; }
    _busy = true; elInput.value = '';
    addUser(msg);
    var thinking = addBot('분석 중…');
    handleUserMessage(msg).then(function (res) {
      thinking.textContent = res.reply;
      _busy = false;
    }).catch(function (e) {
      thinking.textContent = '저장 중 문제가 있었지만 관심 정보는 기기에 보관했어요. 다시 시도해 주세요.';
      console.warn('[BelloreAI] handle error', e);
      _busy = false;
    });
  }

  /* ============================================================
     11) 상품 클릭/찜 자동 이벤트 트래킹 (기존 UI 훅)
        - 상품 카드/상세 클릭 → product_view
        - 찜 버튼 → wishlist_add/remove
        브랜드/모델/레퍼런스는 data-* 또는 카드 텍스트에서 best-effort 추출.
     ============================================================ */
  function infoFromEl(el) {
    var card = el.closest('[data-listing-id],[data-id],.product-card,.pcard,.listing-card') || el;
    var brand = card.getAttribute && (card.getAttribute('data-brand') || '');
    var model = card.getAttribute && (card.getAttribute('data-model') || '');
    var ref = card.getAttribute && (card.getAttribute('data-ref') || card.getAttribute('data-reference') || '');
    var pid = card.getAttribute && (card.getAttribute('data-listing-id') || card.getAttribute('data-id') || '');
    if (!brand) {
      var txt = (card.textContent || '').slice(0, 120);
      brand = extractBrands(txt)[0] || '';
      if (!model) model = extractModels(txt)[0] || '';
      if (!ref) ref = extractReferences(txt)[0] || '';
    }
    return { brand: brand || null, model: model || null, reference_number: ref || null,
      product_id: /^[0-9a-f-]{36}$/i.test(pid) ? pid : null };
  }

  function bindAutoTracking() {
    document.addEventListener('click', function (e) {
      // 찜 토글
      var wb = e.target.closest('.js-wish,[data-wish],.wish-btn,.pp-wish');
      if (wb) {
        var info = infoFromEl(wb);
        // 토글 방향은 알 수 없으니 active 클래스로 추정(없으면 add)
        var added = !(wb.classList.contains('on') || wb.classList.contains('active'));
        if (info.brand || info.reference_number) track(added ? 'wishlist_add' : 'wishlist_remove', info);
        return;
      }
      // 상품 카드/상세 진입
      var pc = e.target.closest('[data-listing-id],.product-card,.pcard,.listing-card,[data-open-product]');
      if (pc) {
        var info2 = infoFromEl(pc);
        if (info2.brand || info2.reference_number || info2.product_id) track('product_view', info2);
      }
    }, true);
  }

  /* ============================================================
     12) 초기화 + 로그인 연동
     ============================================================ */
  function bindAuth() {
    if (B() && B().onAuthChange) {
      B().onAuthChange(function (user) {
        if (user) { _profileCache = null; flushBufferToDB(); }
        else { _profileCache = null; }
      });
      return true;
    }
    return false;
  }

  // 전역 노출 (관리자 화면/외부에서 재사용)
  window.BelloreAI = {
    rules: rules,
    provider: provider,
    RuleBasedAIProvider: RuleBasedAIProvider,
    ensureProfile: ensureProfile,
    applyAnalysis: applyAnalysis,
    saveProfile: saveProfile,
    handleUserMessage: handleUserMessage,
    track: track,
    bumpInterest: bumpInterest,
    normalizeListing: normalizeListing,
    calculateRecommendationScore: calculateRecommendationScore,
    recommendForProfile: recommendForProfile,
    fetchProducts: fetchProducts,
    recommendProducts: recommendProducts,
    generateAlertCandidates: generateAlertCandidates,
    buildAlertCandidates: buildAlertCandidates,
    krwShort: krwShort,
    STAGE_LABEL: STAGE_LABEL,
    openPanel: function () { openPanel(); },
    _internals: { flushBufferToDB: flushBufferToDB }
  };

  function init() {
    buildUI();
    bindAutoTracking();
    if (!bindAuth()) {
      var tries = 0, t = setInterval(function () { if (bindAuth() || ++tries > 20) clearInterval(t); }, 150);
    }
    // 이미 로그인 상태면 버퍼 병합 시도
    setTimeout(function () { if (loggedIn()) flushBufferToDB(); }, 800);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
