/* ============================================================
   벨로르(BELLORE) · 고객별 AI 시계 전문비서 — 1차 기반 (엔진 + 고객 UI)
   ------------------------------------------------------------
   사무실 로컬 AI 우선 + Supabase 큐 + 규칙 기반 안전 폴백.

   동작 개요(고객):
     채팅 입력 → ai_conversations 저장 → ruleExtractor 로 브랜드/모델/예산/성향 추출
       → customer_ai_profiles 업데이트 → customer_watch_interests 점수 누적
       → customer_events 기록 → 규칙 기반 응답 출력

   로그인+선택 동의 상태: Supabase(window.sbClient)에 저장.
   비로그인/비동의: 개인화 프로필·행동을 저장하거나 로그인 뒤 병합하지 않음.

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

  // 현재 158개 평가 원장의 canonical 브랜드와 brands.js에 없는 실제
  // 표기. 띄어쓰기 변형은 같은 브랜드로 합치되 반환값은 재고 표기와
  // 맞춰 hard constraint가 정확 일치하도록 한다.
  var CATALOG_BRAND_ALIASES = [
    { name: '그랜드세이코', keys: ['그랜드세이코', '그랜드 세이코', 'grand seiko', 'grandseiko'] },
    { name: '로저드뷔', keys: ['로저드뷔', '로저 드뷔', 'roger dubuis', 'rogerdubuis'] },
    { name: '리브토만', keys: ['리브토만'] },
    { name: '몽블랑', keys: ['몽블랑', 'montblanc'] },
    { name: '바쉐론콘스탄틴', keys: ['바쉐론콘스탄틴', '바쉐론 콘스탄틴', 'vacheron constantin', 'vacheron'] },
    { name: '보메 메르시에', keys: ['보메 메르시에', '보메메르시에', 'baume & mercier', 'baume et mercier'] },
    { name: '부쉐러', keys: ['부쉐러', 'bucherer'] },
    { name: '브랜드미상', keys: ['브랜드미상', '브랜드 미상'] },
    { name: '예거르쿨트르', keys: ['예거르쿨트르', '예거 르쿨트르', 'jaeger-lecoultre', 'jaeger lecoultre', 'jlc'] },
    { name: '제니스', keys: ['제니스', 'zenith'] },
    { name: '제랄드 젠타', keys: ['제랄드 젠타', '제랄드젠타', 'gerald genta'] },
    { name: '코럼', keys: ['코럼', 'corum'] },
    { name: '콩코드', keys: ['콩코드', 'concord'] },
    { name: '프랭크뮬러', keys: ['프랭크뮬러', '프랭크 뮬러', 'franck muller', 'franckmuller'] }
  ];

  var MODEL_ALIASES = [
    { name: '데이저스트', keys: ['데이저스트', '데이트저스트', 'datejust'] },
    { name: '까레라', keys: ['까레라', '카레라', 'carrera'] },
    { name: '셀리니', keys: ['셀리니', 'cellini'] },
    { name: '서브마리너', keys: ['서브마리너', '섭마', 'submariner'] },
    { name: '데이데이트', keys: ['데이데이트', 'day-date', 'day date'] },
    { name: '오이스터 퍼페츄얼', keys: ['오이스터 퍼페츄얼', '오이스터퍼페츄얼', 'oyster perpetual'] },
    { name: '씨마스터', keys: ['씨마스터', 'seamaster'] },
    { name: '아쿠아테라', keys: ['아쿠아테라', '어쿠아테라', 'aqua terra'] },
    { name: '드빌', keys: ['드빌', 'de ville'] },
    { name: '컨스텔레이션', keys: ['컨스텔레이션', 'constellation'] },
    { name: '산토스', keys: ['산토스', 'santos'] },
    { name: '탱크', keys: ['탱크', 'tank'] },
    { name: '팬더', keys: ['팬더', 'panthere'] },
    { name: 'J12', keys: ['j12'] },
    { name: '아쿠아레이서', keys: ['아쿠아레이서', 'aquaracer'] },
    { name: '재즈마스터', keys: ['재즈마스터', 'jazzmaster'] },
    { name: '오션스타', keys: ['오션스타', 'ocean star'] },
    { name: '슈퍼오션', keys: ['슈퍼오션', 'superocean'] },
    { name: '네비타이머', keys: ['네비타이머', '네비타리머', '네비타이버', 'navitimer'] },
    { name: '라디오미르', keys: ['라디오미르', 'radiomir'] },
    { name: '루미노르', keys: ['루미노르', 'luminor'] },
    { name: '빅뱅', keys: ['빅뱅', 'big bang'] },
    { name: '디아고노', keys: ['디아고노', 'diagono'] },
    { name: '세르펜티', keys: ['세르펜티', 'serpenti'] },
    { name: '엘프리메로', keys: ['엘프리메로', '엘 프리메로', 'el primero'] },
    { name: '골든엘립스', keys: ['골든엘립스', '골든 엘립스', 'golden ellipse'] },
    { name: '마스터뱅커', keys: ['마스터뱅커', '마스터 뱅커', 'master banker'] }
  ];

  function categoricalKey(value) {
    var normalized = String(value || '').toLowerCase();
    try { normalized = normalized.normalize('NFKC'); } catch (e) {}
    return normalized.replace(/[^0-9a-z가-힣]+/g, '');
  }

  // 양수 선호와 명시적 제외가 반드시 같은 브랜드 사전을 보도록 한다.
  // 정적 별칭에 없는 브랜드도 brands.js의 한글명/영문명/slug로 보강한다.
  function allBrandAliases() {
    var ordered = [];
    var byName = {};
    function add(name, keys) {
      if (!name) return;
      var canonical = categoricalKey(name);
      var entry = byName[canonical];
      if (!entry) {
        entry = { name: name, keys: [] };
        byName[canonical] = entry;
        ordered.push(entry);
      }
      (keys || []).forEach(function (key) {
        key = String(key || '').trim();
        if (!key) return;
        var exists = entry.keys.some(function (saved) {
          return saved.toLowerCase() === key.toLowerCase();
        });
        if (!exists) entry.keys.push(key);
      });
    }
    CATALOG_BRAND_ALIASES.forEach(function (brand) { add(brand.name, brand.keys); });
    BRAND_ALIASES.forEach(function (brand) { add(brand.name, brand.keys); });
    (window.BELLORE_BRANDS || []).forEach(function (brand) {
      if (!brand || !brand.name) return;
      add(brand.name, [brand.name, brand.eng, brand.slug]);
    });
    return ordered;
  }

  function suppressContainedCategories(values) {
    values = uniq(values);
    return values.filter(function (value) {
      var key = categoricalKey(value);
      return !values.some(function (other) {
        var otherKey = categoricalKey(other);
        return other !== value && otherKey.length > key.length && otherKey.indexOf(key) >= 0;
      });
    });
  }

  function brandKeyAt(low, key, index) {
    var before = index > 0 ? low.charAt(index - 1) : '';
    var after = low.slice(index + key.length);
    // 영문 브랜드/slug는 다른 영단어의 일부로 잡지 않는다.
    if (/^[a-z0-9 .&-]+$/i.test(key)) {
      return !/[a-z0-9]/i.test(before) && !/[a-z0-9]/i.test(after.charAt(0));
    }
    // 1~2음절 한글 키(롤, 미도 등)는 스크롤/컨트롤/재미도/의미도
    // 같은 정상 단어 안에서 hard brand로 오염되기 쉬워 경계를 강제한다.
    if (/^[가-힣]{1,2}$/.test(key)) {
      if (/[0-9a-z가-힣]/i.test(before)) return false;
      if (!after || !/[0-9a-z가-힣]/i.test(after.charAt(0))) return true;
      return /^(?:은|는|이|가|을|를|의|로|으로|와|과|랑|이랑|도|만|말고|빼고|제외|시계|제품|모델|브랜드)(?=$|[^가-힣])/.test(after);
    }
    return true;
  }

  function brandKeyPresent(low, key) {
    var from = 0;
    while (from < low.length) {
      var index = low.indexOf(key, from);
      if (index < 0) return false;
      if (brandKeyAt(low, key, index)) return true;
      from = index + Math.max(1, key.length);
    }
    return false;
  }

  function brandOccurrences(low) {
    var occurrences = [];
    allBrandAliases().forEach(function (brand) {
      brand.keys.forEach(function (key) {
        var kk = String(key || '').toLowerCase();
        var from = 0;
        while (kk && from < low.length) {
          var index = low.indexOf(kk, from);
          if (index < 0) break;
          if (brandKeyAt(low, kk, index)) {
            occurrences.push({
              name: brand.name, start: index, end: index + kk.length,
              key_length: kk.length
            });
          }
          from = index + Math.max(1, kk.length);
        }
      });
    });
    // 동일 위치를 더 긴 브랜드가 덮을 때만 짧은 브랜드를 억제한다.
    // 다른 위치의 “그랜드세이코 말고 세이코”에서 뒤 세이코는 보존한다.
    return occurrences.filter(function (occurrence) {
      return !occurrences.some(function (other) {
        return other.name !== occurrence.name &&
          other.start <= occurrence.start && other.end >= occurrence.end &&
          (other.end - other.start) > (occurrence.end - occurrence.start);
      });
    });
  }

  // 메시지에서 브랜드(정규명) 배열 추출
  function extractBrands(text) {
    var t = String(text || '');
    var low = t.toLowerCase();
    return uniq(brandOccurrences(low).map(function (occurrence) {
      return occurrence.name;
    }));
  }

  // “롤렉스 말고 오메가”의 롤렉스를 양수 선호로 학습하지 않는다.
  // 현재는 명시적 브랜드 제외만 다루며, 모호한 감정 추론은 하지 않는다.
  function extractExcludedBrands(text) {
    var t = String(text || '');
    var low = t.toLowerCase();
    var excluded = [];
    brandOccurrences(low).forEach(function (occurrence) {
      var after = low.slice(occurrence.end, occurrence.end + 18);
      if (/^\s*(?:은|는|이|가)?\s*(?:말고|빼고|제외|아닌|싫|원하지|안\s*(?:볼|보여|추천))/.test(after)) {
        excluded.push(occurrence.name);
      }
    });
    return uniq(excluded);
  }

  // 메시지에서 모델명 추출(브랜드 사전의 models 기준)
  function extractModels(text) {
    var t = String(text || ''); var low = t.toLowerCase(); var out = [];
    MODEL_ALIASES.forEach(function (model) {
      if (model.keys.some(function (key) {
        return brandKeyPresent(low, String(key).toLowerCase());
      })) out.push(model.name);
    });
    (window.BELLORE_BRANDS || []).forEach(function (b) {
      (b.models || []).forEach(function (m) {
        if (!m || t.toLowerCase().indexOf(String(m).toLowerCase()) < 0) return;
        var normalized = categoricalKey(m);
        var alias = MODEL_ALIASES.find(function (entry) {
          return entry.keys.some(function (key) { return categoricalKey(key) === normalized; });
        });
        out.push(alias ? alias.name : m);
      });
    });
    // 영문 대표 모델 키워드 보강
    ['Submariner', 'Daytona', 'GMT', 'Datejust', 'Nautilus', 'Aquanaut', 'Royal Oak', 'Speedmaster']
      .forEach(function (m) {
        if (!new RegExp(m, 'i').test(t)) return;
        var normalized = categoricalKey(m);
        var alias = MODEL_ALIASES.find(function (entry) {
          return entry.keys.some(function (key) { return categoricalKey(key) === normalized; });
        });
        // 이미 MODEL_ALIASES가 회수한 영문 모델을 원문 영문으로 다시 넣어
        // hard constraint와 프로필을 두 canonical 값으로 갈라놓지 않는다.
        out.push(alias ? alias.name : m);
      });
    out = suppressContainedCategories(out);
    // 더 긴 모델명의 부분문자열(예: "스피드마스터" 안의 "마스터")은 제거
    return out.filter(function (m) {
      return !out.some(function (o) { return o !== m && o.indexOf(m) >= 0; });
    });
  }

  // 자주 쓰는 레퍼런스 화이트리스트(정확도↑)
  var REF_WHITELIST = ['124060', '126610LN', '126610LV', '116610LN', '116610LV', '116500LN',
    '126500LN', '116500LV', '5711', '5712', '5990', '15202', '15500', '15510', '15400',
    '126710BLRO', '126710BLNR', '116710', '114060', '210.30', '311.30'];

  var MONEY_TOKEN_PATTERN = '\\d+(?:\\.\\d+)?(?:\\s*(?:억|천|백|만)\\s*\\d*(?:\\.\\d+)?)*\\s*(?:원)?';

  // 1천5백만원, 1억5천만원 같은 복합 한국어 금액을 하나의 값으로
  // 합산한다. 단위 없는 수는 명시적 예산 문맥에서만 만원 단축형이다.
  function parseMoneyExpression(raw, allowBare) {
    var compact = String(raw || '').replace(/\s+/g, '');
    if (!compact) return null;
    if (/^\d+(?:\.\d+)?$/.test(compact)) {
      return allowBare ? parseFloat(compact) * 10000 : null;
    }
    var wonOnly = compact.match(/^(\d+(?:\.\d+)?)원$/);
    if (wonOnly) return parseFloat(wonOnly[1]);
    var total = 0;
    var matched = false;
    var component = /(\d+(?:\.\d+)?)(억|천|백|만)/g;
    var part;
    while ((part = component.exec(compact))) {
      var num = parseFloat(part[1]);
      if (part[2] === '억') total += num * 100000000;
      else if (part[2] === '천') total += num * 10000000;
      else if (part[2] === '백') total += num * 1000000;
      else if (part[2] === '만') total += num * 10000;
      matched = true;
    }
    var residue = compact.replace(component, '').replace(/원$/, '').replace(/^만$/, '');
    return matched && !residue ? total : null;
  }

  function hasMoneyUnit(raw) {
    return /(억|천|백|만|원)/.test(String(raw || ''));
  }

  function inheritMoneyUnit(raw, otherRaw) {
    if (hasMoneyUnit(raw) || !hasMoneyUnit(otherRaw)) return raw;
    var suffix = String(otherRaw || '').replace(/\s+/g, '')
      .replace(/\d+(?:\.\d+)?/g, '');
    return String(raw || '').trim() + suffix;
  }

  // 예산 범위의 두 끝점과 문자열 위치를 함께 반환한다. 한쪽에만 단위가
  // 있으면 다른 쪽에도 같은 단위를 적용한다(예: 1200~1500만원).
  function extractBudgetRanges(text) {
    var t = String(text || '').replace(/,/g, '');
    var explicitCue = /(예산|가격대|금액)/i.test(t) || /가격(?:은|는)?\s*\d/i.test(t);
    var values = [];
    var spans = [];
    var re = new RegExp('(' + MONEY_TOKEN_PATTERN + ')\\s*(?:~|～|-|–|—|에서|부터)\\s*(' + MONEY_TOKEN_PATTERN + ')', 'g');
    var match;
    while ((match = re.exec(t))) {
      var leftRaw = inheritMoneyUnit(match[1], match[2]);
      var rightRaw = inheritMoneyUnit(match[2], match[1]);
      if (!hasMoneyUnit(leftRaw) && !hasMoneyUnit(rightRaw) && !explicitCue) continue;
      var left = parseMoneyExpression(leftRaw, explicitCue);
      var right = parseMoneyExpression(rightRaw, explicitCue);
      if (!left || !right || left < 100000 || right < 100000) continue;
      values.push(left, right);
      spans.push({ start: match.index, end: re.lastIndex });
    }
    return { values: values, spans: spans };
  }

  function overlapsSpan(index, length, spans) {
    var end = index + length;
    return (spans || []).some(function (span) {
      return index < span.end && end > span.start;
    });
  }

  // 벨로르 재고번호는 제조사 레퍼런스와 다른 식별자다. 현행 일괄등록
  // 형식(ROL-N27265-2 등)을 온전한 토큰으로 먼저 잡아 내부 N27265가
  // 장기 레퍼런스 선호로 들어가는 것을 막는다.
  function extractProductNumberInfo(text) {
    var t = String(text || '');
    var values = [];
    var spans = [];
    var re = /\b([A-Za-z]{2,4}-N\d{4,6}-\d{1,3})\b/gi;
    var match;
    while ((match = re.exec(t))) {
      values.push(match[1].toUpperCase());
      spans.push({ start: match.index, end: re.lastIndex });
    }
    return { values: uniq(values), spans: spans };
  }

  function extractProductNumbers(text) {
    return extractProductNumberInfo(text).values;
  }

  // 레퍼런스 추출: 화이트리스트 + 일반 패턴(통화/단위 숫자는 제외)
  function extractReferences(text) {
    var t = String(text || '');
    var out = [];
    var excludedSpans = extractBudgetRanges(t).spans.concat(extractProductNumberInfo(t).spans);
    // 1) 화이트리스트 우선
    REF_WHITELIST.forEach(function (r) {
      var escaped = r.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      var known = new RegExp('(^|[^A-Za-z0-9])(' + escaped + ')(?=$|[^A-Za-z0-9])', 'ig');
      var hit;
      while ((hit = known.exec(t))) {
        var start = hit.index + hit[1].length;
        if (!overlapsSpan(start, hit[2].length, excludedSpans)) out.push(r.toUpperCase());
        if (!hit[0].length) known.lastIndex += 1;
      }
    });
    // 2) 일반 패턴: 숫자 시작(126610LN)뿐 아니라 문자 시작(H326160,
    //    WBP201B, PAM01564)도 허용한다. 단, 예산 범위의 끝점은 제외한다.
    var re = /\b([A-Za-z]{1,5}\d[A-Za-z0-9]{2,10}|\d{4,6}[A-Za-z]{0,6})\b/g, m;
    while ((m = re.exec(t))) {
      var token = m[1];
      if (overlapsSpan(m.index, token.length, excludedSpans)) continue;
      var after = t.slice(re.lastIndex, re.lastIndex + 2);
      if (/^[만천억원%]/.test(after)) continue;        // 1300만원 → 제외
      var before = t.slice(Math.max(0, m.index - 10), m.index);
      var afterContext = t.slice(re.lastIndex, Math.min(t.length, re.lastIndex + 10));
      // Only a cue attached to this token makes it money. A later phrase such
      // as "14060 예산 1500만원" must not erase the 14060 reference, and
      // "14060 가격 알려줘" is a price question about that reference.
      if (/(예산|가격대|금액|가격(?:은|는)?)\s*$/i.test(before)) continue;
      if (/^\s*(?:가격대(?:로)?|이하|까지|미만|under|아래|이상|부터|초과)/i.test(afterContext)) continue;
      if (/^\d{4}$/.test(token) && Number(token) > 1900 && Number(token) < 2100) continue; // 연도(2024 등) 제외
      out.push(token.toUpperCase());
    }
    return uniq(out);
  }

  // 예산 추출 → { min, max } (KRW). 못 찾으면 null.
  function extractBudget(text, references) {
    var t = String(text || '').replace(/,/g, '');
    var rangeInfo = extractBudgetRanges(t);
    if (rangeInfo.values.length) {
      return {
        min: Math.min.apply(null, rangeInfo.values),
        max: Math.max.apply(null, rangeInfo.values)
      };
    }
    var referenceSet = {};
    (references || []).forEach(function (ref) { referenceSet[String(ref).toUpperCase()] = true; });
    var explicitBudgetCue = /(예산|가격대|금액|이하|까지|미만|under|아래|이상|부터|초과)/i.test(t) ||
      /가격(?:은|는)?\s*\d/i.test(t);
    var unitVals = [];  // 단위가 붙은 금액(복합 표현도 한 값)
    var bareVals = [];  // 단위 없는 맨숫자(레퍼런스일 수 있어 후순위)
    var re = new RegExp(MONEY_TOKEN_PATTERN, 'g'), m;
    while ((m = re.exec(t))) {
      var raw = String(m[0] || '').trim();
      var compact = raw.replace(/\s+/g, '');
      var num = parseFloat(compact);
      if (isNaN(num)) continue;
      // H326160 / 126610LN처럼 영문과 붙은 숫자는 금액 후보가 아니다.
      if (/[A-Za-z]/.test(t.charAt(m.index - 1)) || /[A-Za-z]/.test(t.charAt(re.lastIndex))) continue;
      if (t.charAt(re.lastIndex) === '년') continue;
      var krw = null, hasUnit = hasMoneyUnit(compact);
      if (hasUnit) krw = parseMoneyExpression(compact, false);
      else {
        // 단위 없는 숫자는 명시적인 예산 문맥에서만 금액으로 본다. 14060,
        // 16233 같은 실제 5자리 레퍼런스를 1억대 예산으로 오인하지 않는다.
        hasUnit = false;
        if (explicitBudgetCue && !referenceSet[compact.toUpperCase()] && num >= 100 && num <= 99999) {
          krw = parseMoneyExpression(compact, true);
        }
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
    if (/(팔(?:고|려고|려|아|아서|수\s*있|면|까요|게|기|자)|판매|매도|매입가|얼마에\s*사|되파|위탁)/.test(t)) return 'sell_intent';
    if (/(연락처|전화|구매할게|살게|예약|계약|입금|결제)/.test(t)) return 'ready_to_buy';
    if (/(매물|재고|있나요|입고|구할 수|구해|찾고 있)/.test(t)) return 'high_intent';
    if (/(얼마|가격|시세|예산|할인|네고)/.test(t)) return 'considering';
    return 'browsing';
  }

  var STAGE_PROB = { browsing: 15, considering: 40, high_intent: 65, ready_to_buy: 88, purchased_recently: 10, sell_intent: 25, unknown: 0 };

  // 종합 분석
  function analyze(message) {
    var allBrands = extractBrands(message);
    var excludedBrands = extractExcludedBrands(message);
    var brands = allBrands.filter(function (brand) { return excludedBrands.indexOf(brand) < 0; });
    var models = extractModels(message);
    var productNumbers = extractProductNumbers(message);
    var refs = extractReferences(message);
    var budget = extractBudget(message, refs);
    var personality = extractPersonality(message);
    var stage = estimateStage(message);
    return {
      brands: brands, excluded_brands: excludedBrands, models: models,
      product_numbers: productNumbers, references: refs,
      budget: budget, personality: personality,
      buying_stage: stage, buy_probability: STAGE_PROB[stage] || 0
    };
  }

  var rules = {
    extractBrands: extractBrands, extractExcludedBrands: extractExcludedBrands,
    extractModels: extractModels, extractProductNumbers: extractProductNumbers,
    extractReferences: extractReferences,
    extractBudget: extractBudget, extractPersonality: extractPersonality, estimateStage: estimateStage,
    analyze: analyze, BRAND_ALIASES: BRAND_ALIASES,
    CATALOG_BRAND_ALIASES: CATALOG_BRAND_ALIASES, MODEL_ALIASES: MODEL_ALIASES
  };

  /* ============================================================
     2) AIProvider 인터페이스(stub) + RuleBasedAIProvider
        나중에 OpenAIProvider/ClaudeProvider/LocalLLMProvider 로 교체.
     ============================================================ */
  // 흔한 일반 질문에 능동적으로 답하는 규칙 응답(AI가 꺼져있거나 실패해도 대화가 되도록)
  function metaAnswer(message, profile) {
    var t = String(message || '').trim();
    // 고객이 자기 이름을 물으면(로그인+이름 있을 때)
    if (/(내|제)\s*이름/.test(t)) {
      var nm = profile && (profile.name);
      return nm ? ('고객님 성함은 ' + nm + '님으로 확인돼요. 무엇을 도와드릴까요?')
                : '아직 성함 정보가 없어요. 로그인하시면 맞춤으로 도와드릴 수 있어요.';
    }
    if (/(나는|난|내가|저는|제가).{0,8}(누구|어떤\s*사람)|내\s*이름/.test(t))
      return '제가 확인할 수 있는 것은 고객님이 직접 알려주신 관심 조건뿐이에요. 실제 신원이나 과거 행동은 추측하지 않으며, 원하시는 브랜드·모델·예산을 말씀해 주시면 그 조건으로 찾아볼게요.';
    if (/(이름|누구세요|누구야|누군데|누구냐|누구니|정체|뭐라고\s*불러|(?:넌|너는|당신은).{0,8}(?:누구|뭐|정체))/.test(t))
      return '저는 벨로르의 시계 탐색 도우미예요. 현재 등록된 매물 안에서 조건을 비교하고 필요한 정보를 정리하며, 가격과 진위의 최종 판단은 전문 상담사가 확인해요.';
    if (/(뭘\s*잘|아는\s*게|아는\s*거|뭐\s*(를)?\s*할|할\s*수\s*있|무엇을|기능|어떤\s*걸|뭐하는|도와줄)/.test(t))
      return '이런 걸 도와드려요:\n· 예산·취향에 맞는 시계 추천\n· 브랜드·모델별 매물 찾기\n· 입고 알림 설정\n· 시세·상담 연결\n찾으시는 브랜드나 예산을 편하게 말씀해 주세요.';
    if (/(예물|결혼|웨딩|신랑|신부|커플|프로포즈|기념일|선물)/.test(t))
      return '예물/선물 시계 찾으시는군요! 보통 롤렉스 데이트저스트·오메가·까르띠에 탱크가 예물로 인기예요. 예산을 알려주시면 그 안에서 딱 맞는 매물을 골라드릴게요.';
    if (/^(안녕|하이|헬로|hi|hello|ㅎㅇ|반가)/i.test(t))
      return '안녕하세요! 벨로르 AI 시계 비서예요. 어떤 시계를 찾고 계세요? 브랜드나 예산만 알려주셔도 좋아요.';
    if (/(고마워|감사|thanks|ok|오케이|알겠)/i.test(t))
      return '언제든지요! 더 찾으실 시계나 궁금한 점 있으면 편하게 말씀해 주세요.';
    return null;
  }

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
      bits.push('구매의도 지수 ' + (p.buy_probability || 0) + '/100');
      if (p.price_sensitivity >= 65) bits.push('가격 민감도 높음');
      if (p.resale_importance >= 65) bits.push('리셀가치 중시');
      var n = (conversations || []).length;
      return bits.join(' · ') + (n ? (' (대화 ' + n + '건 기반)') : '');
    },
    generateReply: function (message, profile, context) {
      var a = (context && context.analysis) || analyze(message);
      // 흔한 일반질문은 규칙기반에서도 능동적으로 답한다(AI 미작동 시에도 대화가 되게)
      var meta = metaAnswer(message, profile);
      if (meta) return meta;
      var parts = [];
      var tags = [];
      if (a.brands.length) tags.push(a.brands.join(', '));
      if ((a.excluded_brands || []).length) parts.push('제외 조건은 ' + a.excluded_brands.join(', ') + '로 반영할게요.');
      if ((a.product_numbers || []).length) tags.push(a.product_numbers.join(', '));
      else if (a.references.length) tags.push(a.references.join(', '));
      else if (a.models.length) tags.push(a.models.join(', '));
      if (tags.length) parts.push('"' + tags.join(' ') + '" 관심 정보를 저장했어요.');
      if (a.budget && (a.budget.min || a.budget.max)) {
        parts.push('예산 ' + krwShort(a.budget.min) + '~' + krwShort(a.budget.max) + ' 기준으로 매물을 찾아둘게요.');
      }
      var stageMsg = {
        sell_intent: '판매/위탁 상담으로 도와드릴게요. 모델과 구성품을 알려주시면 매입가를 안내드립니다.',
        ready_to_buy: '바로 진행 가능하세요. 담당 매니저 연결 또는 예약을 도와드릴까요?',
        high_intent: '원하시는 매물이 입고되면 가장 먼저 알림을 보내드릴게요. 입고 알림을 켜드릴까요?',
        considering: '가격·시세는 확인 가능한 실제 거래 자료와 등록 매물을 기준으로 안내하고, 자료가 부족하면 전문 상담사 확인이 필요하다고 분명히 말씀드릴게요.',
        browsing: '천천히 둘러보세요. 관심 모델을 말씀해주시면 취향을 분석해 추천해드려요.'
      }[a.buying_stage];
      if (stageMsg) parts.push(stageMsg);
      if (!parts.length) parts.push('원하시는 브랜드·모델·예산을 알려주시면 현재 등록된 매물 안에서 확인해드릴게요.');
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

  var STAGE_LABEL = { browsing: '둘러보는 중', considering: '가격 비교 중', high_intent: '매물 찾는 중', ready_to_buy: '구매 임박', purchased_recently: '최근 구매 완료', sell_intent: '판매 문의', unknown: '미상' };
  function krwShort(n) {
    if (n == null) return '-';
    n = Number(n); if (!n) return '-';
    if (n >= 100000000) return (n / 100000000).toFixed(n % 100000000 ? 1 : 0) + '억';
    if (n >= 10000) return Math.round(n / 10000).toLocaleString() + '만';
    return n.toLocaleString();
  }

  /* ============================================================
     3) 프로필 저장소 — 로그인·선택 동의 고객의 DB 프로필
     ============================================================ */
  // 과거 버전 잔여 데이터 삭제용 키. 현재 버전은 개인화 데이터를
  // localStorage에 새로 쓰거나 로그인 뒤 소급 병합하지 않는다.
  var LS_PROFILE = 'bellore_ai_profile';
  var LS_BUFFER = 'bellore_ai_buffer';

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

  // 로그인 사용자 프로필 조회 전용. 프로필 생성은 동의 원장과 같은
  // 트랜잭션에서 처리하는 grant_ai_personalization_consent RPC만 허용한다.
  function ensureProfile() {
    if (!dbOn()) {
      _profileCache = blankProfile();
      return Promise.resolve(_profileCache);
    }
    var u = curUser();
    return sb().from('customer_ai_profiles').select('*').eq('user_id', u.uid).limit(1)
      .then(function (res) {
        if (res.error) throw res.error;
        if (res.data && res.data.length) { _profileCache = res.data[0]; return _profileCache; }
        _profileCache = null;
        return null;
      })
      .catch(function (e) {
        // 로그인 고객의 서버 프로필을 읽지 못했을 때 로컬 프로필로 대신하면
        // 다른 기기에서 철회한 동의를 되살릴 수 있다. 실패는 실패로 남긴다.
        console.warn('[BelloreAI] 프로필 DB 조회 실패:', e && e.message);
        _profileCache = null;
        throw e;
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
    // 구매의도 지수: 단계 기반 휴리스틱. 보정된 구매확률이 아니다.
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
    if (dbOn() && !p.id) return Promise.reject(new Error('AI_PROFILE_ID_REQUIRED'));
    if (!dbOn()) return Promise.resolve(p);
    if (dbOn() && p.id) {
      var patch = {
        preferred_brands: p.preferred_brands, preferred_models: p.preferred_models,
        preferred_references: p.preferred_references, budget_min: p.budget_min, budget_max: p.budget_max,
        price_sensitivity: p.price_sensitivity, speed_preference: p.speed_preference,
        detail_preference: p.detail_preference, risk_tolerance: p.risk_tolerance,
        resale_importance: p.resale_importance, buying_stage: p.buying_stage,
        buy_probability: p.buy_probability, ai_summary: p.ai_summary
      };
      return sb().from('customer_ai_profiles').update(patch).eq('id', p.id)
        .then(function (r) {
          if (r.error) {
            console.warn('[BelloreAI] 프로필 저장 실패:', r.error.message);
            throw r.error;
          }
          return p;
        });
    }
    return Promise.reject(new Error('AI_PROFILE_SAVE_UNAVAILABLE'));
  }

  /* ============================================================
     4) 관심 점수 누적 (customer_watch_interests)
     ============================================================ */
  var SCORE_BY_SOURCE = {
    chat: 10, click: 2, wishlist: 15, cart: 25, inquiry: 30, price_alert: 25, purchase: 50
  };

  function bumpInterest(profile, item, source) {
    var current = curUser();
    if (!consentGiven() || !loggedIn() || !current || !profile ||
        profile.user_id !== current.uid || profile.consent_personalization !== true) return Promise.resolve();
    var pts = SCORE_BY_SOURCE[source] || 5;
    if (!profile.id || !dbOn()) return Promise.resolve();
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
    cart_add: 'cart', cart_remove: null, inquiry_submit: 'inquiry', price_alert_set: 'price_alert',
    chat_message: 'chat', purchase_request: 'purchase', purchase_complete: null, sell_request: 'inquiry',
    recommendation_impression: null, recommendation_click: null, recommendation_dismiss: null,
    personalization_consent_granted: null
  };
  var _recommendationTouches = {};

  // 실제 행동 신호는 점수를 끝없이 더하지 않고 구매단계별 최소값만 올린다.
  // 조회만으로 구매 임박 판정을 만들지 않으며, 개인화 동의 회원에게만 적용한다.
  var BEHAVIOR_INTENT_FLOOR = {
    wishlist_add: { stage: 'considering', probability: 45 },
    cart_add: { stage: 'high_intent', probability: 68 },
    purchase_request: { stage: 'ready_to_buy', probability: 88 },
    purchase_complete: { stage: 'purchased_recently', probability: 10, reset: true }
  };

  function applyBehaviorIntent(profile, eventType) {
    var floor = BEHAVIOR_INTENT_FLOOR[eventType];
    if (!floor) return false;
    var beforeStage = profile.buying_stage;
    var beforeProbability = Number(profile.buy_probability) || 0;
    if (floor.reset || beforeProbability < floor.probability) {
      profile.buying_stage = floor.stage;
      profile.buy_probability = floor.probability;
      profile.ai_summary = provider.summarizeCustomer(profile, null);
    }
    return beforeStage !== profile.buying_stage || beforeProbability !== Number(profile.buy_probability || 0);
  }

  function track(eventType, data) {
    data = data || {};
    if (!consentGiven() || !loggedIn()) return Promise.resolve([]);
    return requireConsentedProfile().then(function (p) {
      var user = curUser();
      if (!user || !p) return [];
      var eventValue = Object.assign({}, data.value || {});
      if (eventType.indexOf('recommendation_') !== 0) {
        var recommendation = data.recommendation_attribution || recommendationAttribution(data.product_id);
        if (recommendation) eventValue.recommendation = recommendation;
      }
      var evt = {
        event_type: eventType, product_id: data.product_id || null,
        brand: data.brand || null, model: data.model || null,
        reference_number: data.reference_number || null, value: eventValue
      };
      // 관심 점수 누적
      var src = EVENT_SOURCE[eventType];
      var bumpP = (src && (data.brand || data.model || data.reference_number))
        ? bumpInterest(p, evt, src) : Promise.resolve();
      var profileP = applyBehaviorIntent(p, eventType) ? saveProfile(p) : Promise.resolve(p);
      // 이벤트 저장
      var saveP;
      if (dbOn() && p.id) {
        saveP = sb().from('customer_events').insert(Object.assign({ profile_id: p.id, user_id: p.user_id || null }, evt))
          .then(function (r) { if (r.error) console.warn('[BelloreAI] 이벤트 보류:', r.error.message); });
      } else {
        saveP = Promise.resolve();
      }
      return Promise.all([bumpP, saveP, profileP]);
    });
  }

  function recommendationEventValue(item, surface, position) {
    item = item || {};
    var product = item.product || {};
    return {
      request_id: item.request_id || null,
      product_id: product.id || null,
      surface: surface || item.surface || 'unknown',
      rank: Number(position || item.rank) || null,
      algorithm_version: item.algorithm_version || (item.breakdown && item.breakdown.algorithm_version) || 'legacy',
      variant: item.variant || 'balanced_v1',
      experiment_id: item.experiment_id || null,
      candidate_sources: item.candidate_sources || [],
      score: Number(item.score) || 0,
      score_kind: item.breakdown && item.breakdown.score_kind || 'legacy_score',
      score_components: item.breakdown && item.breakdown.features || {}
    };
  }

  function rememberRecommendationTouch(item, surface, position) {
    item = item || {};
    var product = item.product || {};
    if (!product.id) return null;
    var value = recommendationEventValue(item, surface, position);
    value.touched_at = nowISO();
    _recommendationTouches[String(product.id)] = value;
    return Object.assign({}, value);
  }

  function recommendationAttribution(itemOrId) {
    var direct = itemOrId && itemOrId.recommendation_attribution;
    if (direct && direct.request_id) return Object.assign({}, direct);
    var id = typeof itemOrId === 'object'
      ? (itemOrId.product_id || itemOrId.listingId || itemOrId.id)
      : itemOrId;
    var value = id ? _recommendationTouches[String(id)] : null;
    if (!value || !value.touched_at) return null;
    if (Date.now() - new Date(value.touched_at).getTime() > 2 * 60 * 60 * 1000) {
      delete _recommendationTouches[String(id)];
      return null;
    }
    return Object.assign({}, value);
  }

  function trackRecommendation(eventType, item, surface, position) {
    var product = item && item.product || {};
    if (!product.id) return Promise.resolve([]);
    if (eventType === 'recommendation_click' || eventType === 'recommendation_dismiss') {
      rememberRecommendationTouch(item, surface, position);
    }
    return track(eventType, {
      product_id: /^[0-9a-f-]{36}$/i.test(String(product.id)) ? product.id : null,
      brand: product.brand || null,
      model: product.model || null,
      reference_number: product.reference_number || null,
      value: recommendationEventValue(item, surface, position)
    });
  }

  function trackRecommendationImpressions(items, surface) {
    if (!consentGiven() || !loggedIn()) return Promise.resolve([]);
    var visibleItems = (items || []).filter(function (item) { return item && item.product && item.product.id; });
    if (!visibleItems.length) return Promise.resolve([]);
    return requireConsentedProfile().then(function (profile) {
      var user = curUser();
      if (!profile || !user || !dbOn()) return [];
      var rows = visibleItems.map(function (item, index) {
        var product = item.product || {};
        return {
          profile_id: profile.id,
          user_id: user.uid,
          event_type: 'recommendation_impression',
          product_id: /^[0-9a-f-]{36}$/i.test(String(product.id)) ? product.id : null,
          brand: product.brand || null,
          model: product.model || null,
          reference_number: product.reference_number || null,
          value: recommendationEventValue(item, surface, item.rank || index + 1)
        };
      });
      return sb().from('customer_events').insert(rows).then(function (result) {
        if (result.error) throw result.error;
        return rows;
      });
    }).catch(function (error) {
      console.warn('[BelloreAI] 추천 노출 저장 실패:', error && error.message || error);
      return [];
    });
  }

  /* ============================================================
     6) 대화 처리 파이프라인 (채팅 1턴)
     ============================================================ */
  function logConversation(profile, role, message, metadata) {
    metadata = metadata || {};
    var user = curUser();
    if (dbOn() && user && profile && profile.id && profile.user_id === user.uid &&
        profile.consent_personalization === true) {
      return sb().from('ai_conversations').insert({
        profile_id: profile.id, user_id: profile.user_id || null,
        role: role, message: message, channel: 'web', metadata: metadata
      }).then(function (r) { if (r.error) console.warn('[BelloreAI] 대화 저장 보류:', r.error.message); });
    }
    return Promise.resolve();
  }

  var CHAT_SESSION_KEY_PREFIX = 'bellore_ai_chat_session:';
  function chatSessionId() {
    try {
      var user = curUser();
      if (!user || !user.uid) return null;
      var key = CHAT_SESSION_KEY_PREFIX + user.uid;
      var current = sessionStorage.getItem(key);
      if (/^[0-9a-f-]{36}$/i.test(current || '')) return current;
      var created = (window.crypto && typeof window.crypto.randomUUID === 'function')
        ? window.crypto.randomUUID()
        : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            var r = Math.random() * 16 | 0;
            return (c === 'x' ? r : (r & 3 | 8)).toString(16);
          });
      sessionStorage.setItem(key, created);
      return created;
    } catch (e) { return null; }
  }

  function auditIntent(message, analysis) {
    var t = String(message || '');
    if (/(나는|난|내가|저는|제가).{0,8}(누구|어떤\s*사람)|내\s*이름/.test(t)) return 'customer_identity';
    if (/(누구세요|누구야|누군데|누구냐|누구니|정체|(?:넌|너는|당신은).{0,8}(?:누구|뭐|정체))/.test(t)) return 'identity';
    if (/(팔|판매|매도|매입|위탁)/.test(t)) return 'sell_question';
    if (/(가격|시세|얼마|예산)/.test(t)) return 'price_question';
    if (/(추천|골라|찾아|매물|재고|있나|있어|보여)/.test(t)) return 'recommendation';
    if (analysis && (analysis.brands.length || analysis.references.length)) return 'inventory_question';
    return 'general';
  }

  function logConversationTurn(profile, userMessage, assistantMessage, metadata) {
    metadata = metadata || {};
    var analysis = metadata.analysis || { brands: [], references: [], stage: 'unknown' };
    var providerName = metadata.provider || 'rule_fallback';
    var payload = {
      profile_id: profile && profile.id || null,
      session_id: chatSessionId(),
      user_message: String(userMessage || '').slice(0, 600),
      assistant_reply: String(assistantMessage || '').slice(0, 600),
      provider: providerName,
      intent: auditIntent(userMessage, analysis),
      needs_review: metadata.needs_review === true,
      recommended_listing_ids: metadata.recommended_listing_ids || []
    };
    if (sb() && typeof sb().rpc === 'function') {
      return sb().rpc('log_shop_ai_turn', { p_payload: payload }).then(function (result) {
        if (result && result.error) throw result.error;
        return result && result.data;
      }).catch(function (error) {
        console.warn('[BelloreAI] 통합 대화 로그 RPC 실패 → 기존 저장 방식 사용:', error && error.message || error);
        return Promise.all([
          logConversation(profile, 'user', userMessage, {
            analysis: analysis,
            needs_review: payload.needs_review,
            provider: providerName
          }),
          logConversation(profile, 'assistant', assistantMessage, { provider: providerName })
        ]);
      });
    }
    return Promise.all([
      logConversation(profile, 'user', userMessage, {
        analysis: analysis,
        needs_review: payload.needs_review,
        provider: providerName
      }),
      logConversation(profile, 'assistant', assistantMessage, { provider: providerName })
    ]);
  }

  // 사용자 메시지 1턴 처리 → { reply, analysis, profile }
  function handleUserMessage(message) {
    if (!consentGiven() || !loggedIn()) {
      return Promise.resolve({
        reply: '맞춤 추천 동의 후 이용하실 수 있어요.',
        analysis: analyze(message),
        profile: null,
        recommendations: [],
        consentRequired: true
      });
    }
    var a = analyze(message);
    return requireConsentedProfile().then(function (p) {
      if (!p) {
        return {
          reply: '맞춤 추천 동의 상태를 다시 확인해 주세요.',
          analysis: a,
          profile: null,
          recommendations: [],
          consentRequired: true
        };
      }
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
            // 추천은 "고객이 요청"할 때만
            var wantReco = /추천|매물|보여|찾아|있나|있어|얼마|골라|시세|가격|예물|결혼|웨딩|선물|커플/.test(message)
              || (a.product_numbers || []).length || a.references.length ||
              (a.brands.length && a.budget) || (a.excluded_brands || []).length;
            // 단, 정보(브랜드/예산/레퍼런스 또는 기존 취향)가 있어야 실제 추천. 없으면 취향 Q&A로.
            var profHasPref = (p2.preferred_brands && p2.preferred_brands.length) || p2.budget_max || (p2.preferred_references && p2.preferred_references.length);
            var hasSignal = a.brands.length || (a.product_numbers || []).length || a.references.length || a.budget || a.models.length ||
              (a.excluded_brands || []).length || profHasPref;
            var askPref = wantReco && !hasSignal;
            var recommendationError = null;
            var recoP = (wantReco && hasSignal) ? recommendProducts(p2, 24, a).catch(function (error) {
              recommendationError = error || new Error('RECOMMENDATION_UNKNOWN_FAILURE');
              console.warn('[BelloreAI] 추천 산출 실패:', recommendationError.code || recommendationError.message);
              return null;
            }) : Promise.resolve([]);
            return recoP.then(function (recos) {
              // 개선 루프: 브랜드/레퍼런스도 못 잡고 추천도 못 준 질문 = "대응 어려움" → 표시
              var handled = a.brands.length || (a.product_numbers || []).length || a.references.length ||
                (a.excluded_brands || []).length || (recos && recos.length) ||
                a.buying_stage === 'sell_intent' || !!metaAnswer(message, p2);
              var userMeta = { analysis: { brands: a.brands, excluded_brands: a.excluded_brands || [], product_numbers: a.product_numbers || [], references: a.references, stage: a.buying_stage } };
              if (!handled) userMeta.needs_review = true;
              if (recommendationError) {
                var unavailable = '지금은 판매 가능 재고를 확인하지 못했어요. 잠시 후 다시 요청해 주세요.';
                _lastReplyProvider = 'inventory_lookup_unavailable';
                return logConversationTurn(p2, message, unavailable, {
                  analysis: userMeta.analysis,
                  needs_review: true,
                  provider: _lastReplyProvider,
                  recommended_listing_ids: []
                }).then(function () {
                  return {
                    reply: unavailable, analysis: a, profile: p2, recommendations: [],
                    inventoryUnavailable: true,
                    recommendationError: recommendationError.code || recommendationError.message
                  };
                });
              }
              // 정보가 없는데 추천을 원하면 → 부담없는 취향 Q&A
              if (askPref) {
                var ask = '아직 고객님을 알게 된 지 얼마 안 돼서요 😊 부담 갖지 마시고, 취향만 살짝 알려주시면 딱 맞게 찾아드릴게요. 어떤 브랜드나 예산 생각하고 계세요?';
                _lastReplyProvider = 'preference_prompt';
                return logConversationTurn(p2, message, ask, {
                  analysis: userMeta.analysis,
                  needs_review: userMeta.needs_review === true,
                  provider: _lastReplyProvider,
                  recommended_listing_ids: []
                }).then(function () {
                  return { reply: ask, analysis: a, profile: p2, recommendations: [], askPref: true };
                });
              }
              var explicitInventoryRequest = /(추천|매물|보여|찾아|있나|있어|골라)/.test(message) &&
                (a.brands.length || (a.excluded_brands || []).length || a.models.length ||
                 (a.product_numbers || []).length || a.references.length || a.budget);
              if (explicitInventoryRequest && !(recos && recos.length)) {
                var noMatch = '현재 판매 가능한 매물 중 말씀하신 조건을 모두 충족하는 상품은 없어요. 브랜드나 예산 범위를 넓혀주시면 다른 조건으로 다시 찾아볼게요.';
                _lastReplyProvider = 'inventory_no_match';
                return logConversationTurn(p2, message, noMatch, {
                  analysis: userMeta.analysis,
                  needs_review: false,
                  provider: _lastReplyProvider,
                  recommended_listing_ids: []
                }).then(function () {
                  return { reply: noMatch, analysis: a, profile: p2, recommendations: [], handled: true };
                });
              }
              return composeReply(message, p2, a, recos).then(function (reply) {
                return logConversationTurn(p2, message, reply, {
                  analysis: userMeta.analysis,
                  needs_review: userMeta.needs_review === true,
                  provider: _lastReplyProvider,
                  recommended_listing_ids: (recos || []).map(function (item) {
                    return String(item && item.product && item.product.id || '');
                  }).filter(Boolean).slice(0, 8)
                }).then(function () {
                  return { reply: reply, analysis: a, profile: p2, recommendations: recos, handled: !!handled };
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
  // 추론형 모델이 노출하는 <think>…</think> 사고과정/영문 reasoning 제거
  function cleanAIReply(t) {
    t = String(t || '');
    var m = t.lastIndexOf('</think>');
    if (m >= 0) t = t.slice(m + 8);             // 마지막 </think> 뒤만 = 실제 답
    t = t.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/<\/?think>/gi, '').trim();
    // 영문 사고과정 라인(태그 없이 새는 경우) 제거
    t = t.replace(/^(?:okay|so|first|let me|i need|the user|here'?s|thinking|step\s*\d).*/gim, '').trim();
    return t;
  }
  // 한글 답변인지 판정(영어/사고과정이면 false → 규칙 답변으로 대체)
  function looksKorean(t) {
    t = String(t || '');
    if (!t) return false;
    if (/thinking process|here'?s a|the user|let me|i need to|i should|okay,|first,|analyze/i.test(t)) return false;
    var ko = (t.match(/[가-힣]/g) || []).length;
    var en = (t.match(/[A-Za-z]/g) || []).length;
    return ko >= 2 && ko >= en;   // 한글이 영문 이상일 때만 인정
  }

  function localAiReplyAllowed(t) {
    t = String(t || '');
    if (!looksKorean(t) || t.length > 600) return false;
    if (/(지난번|전에\s*보셨|보고\s*계셨|기억하고\s*있|다시\s*오셨)/.test(t)) return false;
    if (/(곧\s*연결|추후\s*연결|기능은\s*준비\s*중)/.test(t)) return false;
    if (/(₩\s*\d|KRW\s*\d|\d[\d,. ]{1,14}\s*(원|만원|억원))/i.test(t)) return false;
    if (/(정품|진품|가품)(으로)?\s*(확실|보장|맞습니다|아닙니다|판단|확인)/.test(t)) return false;
    return true;
  }

  function localAiCandidates(recos) {
    var seen = {};
    return (recos || []).map(function (item) {
      var product = item && item.product || {};
      var id = String(product.id || '').trim().slice(0, 80);
      var name = [product.brand, product.model, product.reference_number].filter(Boolean).join(' ').trim().slice(0, 180);
      if (!id || !name || seen[id]) return null;
      seen[id] = true;
      return { id: id, name: name };
    }).filter(Boolean).slice(0, 8);
  }

  function waitLocalAi(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function pollLocalAiResult(clientToken, attempt) {
    var maxPolls = Math.max(1, Math.min(60, Number(window.BELLORE_LOCAL_AI_MAX_POLLS || 40)));
    var pollMs = Math.max(800, Math.min(3000, Number(window.BELLORE_LOCAL_AI_POLL_MS || 1000)));
    if (attempt >= maxPolls) return Promise.resolve(null);
    return waitLocalAi(pollMs).then(function () {
      return sb().rpc('get_shop_ai_chat_result', { p_client_token: clientToken });
    }).then(function (res) {
      if (res && res.error) throw res.error;
      var row = Array.isArray(res && res.data) ? res.data[0] : (res && res.data);
      if (!row) return pollLocalAiResult(clientToken, attempt + 1);
      if (row.status === 'completed' || row.status === 'safe_fallback') {
        var reply = cleanAIReply(row.reply);
        return localAiReplyAllowed(reply) ? reply : null;
      }
      if (row.status === 'ai_failed') return null;
      return pollLocalAiResult(clientToken, attempt + 1);
    });
  }

  function requestLocalAiReply(message, recos) {
    if (!(window.BELLORE_LOCAL_AI === true && sb() && typeof sb().rpc === 'function')) {
      return Promise.resolve(null);
    }
    return sb().rpc('get_shop_ai_runtime_status').then(function (statusResult) {
      if (statusResult && statusResult.error) throw statusResult.error;
      var runtime = Array.isArray(statusResult && statusResult.data)
        ? statusResult.data[0]
        : (statusResult && statusResult.data);
      if (!runtime || runtime.online !== true) return null;
      return sb().rpc('submit_shop_ai_chat', {
      p_payload: {
        message: String(message || '').slice(0, 600),
        candidates: localAiCandidates(recos)
      }
      });
    }).then(function (res) {
      if (!res) return null;
      if (res && res.error) throw res.error;
      var receipt = Array.isArray(res && res.data) ? res.data[0] : (res && res.data);
      if (!receipt || !receipt.client_token) throw new Error('로컬 AI 접수번호가 없습니다.');
      return pollLocalAiResult(receipt.client_token, 0);
    }).catch(function (error) {
      console.warn('[BelloreAI] 로컬 AI 큐 미사용 → 서버/규칙 답변:', error && error.message || error);
      return null;
    });
  }

  // "시세" 질문이면 디스코드에서 정리해둔 실제 매입/판매 데이터로 답한다(무료, 항상 동작).
  function priceAnswer(message, a) {
    if (!/시세|가격/.test(message)) return Promise.resolve(null);
    if (!(a.brands.length || a.references.length) || !(sb() && sb().functions)) return Promise.resolve(null);
    var body = { action: 'market_price_lookup', brand: a.brands[0] || null, reference_number: a.references[0] || null };
    return sb().functions.invoke(window.BELLORE_AI_FN || 'ai-learn', { body: body }).then(function (res) {
      var r = res && res.data && res.data.result;
      if (!r || !r.count) return null;
      var who = a.references[0] || a.brands[0];
      var lines = [who + ' 최근 거래 시세는 ' + krwShort(r.min) + '~' + krwShort(r.max) + '원대예요 (' + r.count + '건 기준).'];
      if (r.buy || r.sell) lines.push('매입 ' + r.buy + '건 · 판매 ' + r.sell + '건 참고하시면 돼요.');
      lines.push('정확한 상태(박스·보증서 유무)에 따라 달라질 수 있어요.');
      return lines.join(' ');
    }).catch(function () { return null; });
  }

  // 추천 매물은 카드(이미지+링크)로 별도 렌더하므로 답변 텍스트엔 붙이지 않는다.
  var _lastReplyProvider = 'rule_fallback';
  function composeReply(message, profile, a, recos) {
    _lastReplyProvider = 'rule_fallback';
    var base = provider.generateReply(message, profile, { analysis: a });
    return priceAnswer(message, a).then(function (priced) {
      if (priced) {
        _lastReplyProvider = 'market_price_lookup';
        return priced;
      }
      return requestLocalAiReply(message, recos).then(function (localReply) {
        if (localReply) {
          _lastReplyProvider = 'local_ai';
          console.info('[BelloreAI] 사무실 로컬 AI 응답 사용');
          return localReply;
        }
        return composeReplyFallback(message, profile, a, base, recos);
      });
    });
  }
  function composeReplyFallback(message, profile, a, base, recos) {
    if (!(window.BELLORE_AI_REPLY === true && sb() && sb().functions)) {
      _lastReplyProvider = 'rule_fallback';
      console.warn('[BelloreAI] AI 미사용 → 규칙기반 답변. BELLORE_AI_REPLY=' + window.BELLORE_AI_REPLY + ', sb=' + !!sb());
      return Promise.resolve(base);
    }
    var cand = (recos || []).map(function (x) { return { name: [x.product.brand, x.product.model, x.product.reference_number].filter(Boolean).join(' '), price: x.product.price, score: x.score }; });
    return sb().functions.invoke(window.BELLORE_AI_FN || 'ai-learn', { body: { action: 'generate_reply', profile_id: (profile && profile.id) || null, message: message, candidates: cand } })
      .then(function (res) {
        if (res && res.error) {
          var errMsg = res.error.message || String(res.error);
          var ctx = res.error.context;
          if (ctx && typeof ctx.text === 'function') {
            return ctx.text().then(function (body) {
              _lastReplyProvider = 'rule_fallback';
              console.warn('[BelloreAI] ai-learn HTTP 에러 → 규칙기반 대체. status=' + (ctx.status || '?') + ' body=' + body);
              return base;
            }).catch(function () { _lastReplyProvider = 'rule_fallback'; console.warn('[BelloreAI] ai-learn 에러(본문 읽기 실패) → 규칙기반 대체:', errMsg); return base; });
          }
          _lastReplyProvider = 'rule_fallback';
          console.warn('[BelloreAI] ai-learn 에러 → 규칙기반 대체:', errMsg);
          return base;
        }
        var d = res && res.data;
        if (d && d.skipped) { _lastReplyProvider = 'rule_fallback'; console.warn('[BelloreAI] ai-learn 건너뜀(키 미설정) → 규칙기반 대체:', d.hint); return base; }
        var rawReply = d && d.result && d.result.reply;
        var r = cleanAIReply(rawReply);
        if (!looksKorean(r)) {
          _lastReplyProvider = 'rule_fallback';
          console.warn('[BelloreAI] AI 응답이 한국어가 아니거나 비어있어 → 규칙기반 대체. 원본:', rawReply);
          return base;
        }
        _lastReplyProvider = 'edge_ai';
        console.info('[BelloreAI] 실제 AI 응답 사용:', r);
        return r;
      }).catch(function (e) { _lastReplyProvider = 'rule_fallback'; console.warn('[BelloreAI] ai-learn 호출 자체 실패 → 규칙기반 대체:', e); return base; });
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
    if (window.BelloreRecommendationEngine && window.BelloreRecommendationEngine.normalizeProduct) {
      return window.BelloreRecommendationEngine.normalizeProduct(row);
    }
    return {
      id: row.id,
      brand: row.brand || row.title || '',      // 벨로르: listings.title = 브랜드
      model: row.model || row.description || '', // listings.description = 모델
      reference_number: row.reference_number || row.reference_no || '',
      product_no: row.product_no || '',
      price: Number(row.sale_price != null ? row.sale_price : row.price) || 0,
      condition: row.condition || row.grade || '',
      color: row.dial_color || '',
      size: row.size_mm || '',
      material: row.material || '',
      photo: (row.photos && row.photos[0]) || row.image_url || '',
      prev_price: row.prev_price != null ? Number(row.prev_price) : null,
      created_at: row.created_at || null
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
    var current = curUser();
    if (opts.persist && consentGiven() && dbOn() && current && profile && profile.id &&
        profile.user_id === current.uid && profile.consent_personalization === true) {
      var rows = ranked.slice(0, opts.limit || 10).map(function (x) {
        return { profile_id: profile.id, user_id: profile.user_id || null, product_id: x.product.id || null,
          score: x.score, reason: x.reason, score_breakdown: x.breakdown, status: 'candidate' };
      });
      if (rows.length) sb().from('ai_recommendation_logs').insert(rows).then(function (r) { if (r.error) console.warn('[BelloreAI] 추천로그 보류:', r.error.message); });
    }
    return ranked;
  }

  /* 판매가능 재고 스냅샷은 추천 요청마다 다시 읽는다. 158개 규모에서
     품절 정합성이 60초 캐시 절약보다 중요하며, 조회 실패도 stale 재고로
     폴백하지 않고 빈 후보로 닫는다. */
  var _prodCache = null, _prodAt = 0;
  function recommendationFailure(code, cause) {
    var error = new Error(code);
    error.code = code;
    if (cause) error.cause = cause;
    return error;
  }
  function fetchProducts() {
    if (!(B() && B().subscribeProducts)) {
      return Promise.reject(recommendationFailure('RECOMMENDATION_CATALOG_UNAVAILABLE'));
    }
    return new Promise(function (resolve, reject) {
      var done = false, unsub = null;
      try {
        unsub = B().subscribeProducts(function (list, error) {
          if (done) return; done = true;
          if (error) {
            console.warn('[BelloreAI] 판매가능 재고 조회 실패:', error.message || error);
            reject(recommendationFailure('RECOMMENDATION_CATALOG_UNAVAILABLE', error));
            return;
          }
          _prodCache = (list || []).filter(function (p) { return (p.status || 'on') !== 'sold' && (p.status || 'on') !== 'hidden'; });
          _prodAt = Date.now();
          if (unsub) try { unsub(); } catch (e) {}
          resolve(_prodCache);
        });
      } catch (e) {
        console.warn('[BelloreAI] 판매가능 재고 구독 실패:', e && e.message || e);
        reject(recommendationFailure('RECOMMENDATION_CATALOG_UNAVAILABLE', e));
      }
      setTimeout(function () {
        if (!done) {
          done = true;
          if (unsub) try { unsub(); } catch (e) {}
          console.warn('[BelloreAI] 판매가능 재고 조회 시간 초과');
          reject(recommendationFailure('RECOMMENDATION_CATALOG_TIMEOUT'));
        }
      }, 2500);
    });
  }

  // 프로필 기반 실제 매물 추천. 동의한 고객만 행동 이력을 읽는다.
  function fetchRecommendationSignals(profile) {
    var user = curUser();
    if (!consentGiven() || !dbOn() || !user || !profile || !profile.id ||
        profile.user_id !== user.uid || profile.consent_personalization !== true) {
      return Promise.resolve({ interests: [], events: [] });
    }
    var cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    var actionTypes = [
      'product_view', 'wishlist_add', 'wishlist_remove', 'cart_add', 'cart_remove',
      'inquiry_submit', 'price_alert_set', 'purchase_request', 'purchase_complete',
      'recommendation_click', 'recommendation_dismiss', 'chat_message'
    ];
    return Promise.all([
      sb().from('customer_watch_interests').select('*').eq('profile_id', profile.id)
        .order('interest_score', { ascending: false }).limit(100),
      sb().from('customer_events').select('*').eq('profile_id', profile.id)
        .in('event_type', actionTypes).gte('created_at', cutoff)
        .order('created_at', { ascending: false }).limit(250),
      sb().from('customer_events').select('*').eq('profile_id', profile.id)
        .eq('event_type', 'recommendation_impression').gte('created_at', cutoff)
        .order('created_at', { ascending: false }).limit(200)
    ]).then(function (rows) {
      var failed = rows.find(function (row) { return row && row.error; });
      if (failed) throw failed.error;
      return {
        interests: (rows[0] && !rows[0].error && rows[0].data) || [],
        // 노출량 때문에 찜/장바구니/구매/부정 신호가 최신 N개 밖으로
        // 밀려나지 않도록 행동과 노출을 분리 조회한다.
        events: ((rows[1] && !rows[1].error && rows[1].data) || [])
          .concat((rows[2] && !rows[2].error && rows[2].data) || [])
      };
    }).catch(function (error) {
      console.warn('[BelloreAI] 추천 행동 신호 조회 실패:', error && error.message || error);
      throw recommendationFailure('RECOMMENDATION_SIGNALS_UNAVAILABLE', error);
    });
  }

  function recommendationRequestId() {
    try {
      if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    } catch (e) {}
    return 'reco-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 0x1000000).toString(36);
  }

  function hardConstraintsFromAnalysis(analysis) {
    analysis = analysis || {};
    var budget = analysis.budget || {};
    return {
      brands: analysis.brands || [],
      exclude_brands: analysis.excluded_brands || [],
      models: analysis.models || [],
      product_numbers: analysis.product_numbers || [],
      references: analysis.references || [],
      budget_min: budget.min || 0,
      budget_max: budget.max || 0
    };
  }

  function recommendProducts(profile, limit, analysis, opts) {
    opts = opts || {};
    return Promise.all([fetchProducts(), fetchRecommendationSignals(profile)]).then(function (result) {
      var products = result[0], signals = result[1];
      if (!products.length) return [];
      var requestId = recommendationRequestId();
      var engine = window.BelloreRecommendationEngine;
      var current = curUser();
      var canPersonalize = !!(current && consentGiven() && profile &&
        profile.user_id === current.uid && profile.consent_personalization === true);
      var effectiveEvents = canPersonalize ? signals.events.slice() : [];
      if (canPersonalize && opts.contextItems && opts.contextItems.length) {
        effectiveEvents = effectiveEvents.concat(opts.contextItems.map(function (item) {
          return {
            event_type: 'cart_add',
            product_id: item && item.id || null,
            brand: item && item.brand || null,
            model: item && item.model || null,
            reference_number: item && (item.reference_number || item.reference_no) || null,
            created_at: nowISO(),
            ephemeral_context: true
          };
        }));
      }
      if (engine && engine.rank) {
        var experiment = window.BELLORE_RECO_EXPERIMENT || null;
        var experimentId = null;
        var selectedVariant = opts.variant || 'balanced_v1';
        if (!opts.variant && canPersonalize && experiment && experiment.enabled === true &&
            experiment.id && Array.isArray(experiment.variants) && engine.assignVariant) {
          experimentId = String(experiment.id);
          selectedVariant = engine.assignVariant(profile.user_id, experimentId, experiment.variants);
        }
        var ranked = engine.rank({
          products: products,
          profile: canPersonalize ? profile : {},
          interests: canPersonalize ? signals.interests : [],
          events: effectiveEvents,
          personalized: canPersonalize,
          hardConstraints: analysis ? hardConstraintsFromAnalysis(analysis) : null,
          excludeIds: opts.excludeIds || [],
          limit: limit || opts.limit || 8,
          variant: selectedVariant,
          tieSeed: ((canPersonalize && profile.user_id) || opts.tieSeed || 'non-personal-catalog') + '|' + selectedVariant
        });
        return ranked.items.map(function (item, index) {
          item.request_id = requestId;
          item.surface = opts.surface || 'ai_chat';
          item.rank = index + 1;
          item.experiment_id = experimentId;
          return item;
        });
      }
      // 구 엔진은 명시 hard constraint 계약을 보장하지 못한다. 혼합 캐시나
      // 로드 실패 시 전체 프로필 추천으로 우회하지 않고 fail-closed한다.
      console.error('[BelloreAI] recommendation-engine.js를 사용할 수 없습니다.');
      throw recommendationFailure('RECOMMENDATION_ENGINE_UNAVAILABLE');
    });
  }

  // AI 채팅 밖(장바구니 등)에서 사용하는 안전한 공용 진입점.
  // 비동의/비로그인은 서버 행동 이력 없이 전체 재고 품질·다양성만 사용한다.
  function recommendCurrentUser(opts) {
    opts = opts || {};
    if (!(consentGiven() && loggedIn())) {
      return recommendProducts(null, opts.limit || 4, null, {
        excludeIds: opts.excludeIds || [], surface: opts.surface || 'catalog',
        tieSeed: 'non-personal-catalog', variant: 'non_personal_v1'
      });
    }
    return requireConsentedProfile().then(function (profile) {
      if (!profile) {
        return recommendProducts(null, opts.limit || 4, null, {
          excludeIds: opts.excludeIds || [], surface: opts.surface || 'catalog',
          tieSeed: 'non-personal-catalog', variant: 'non_personal_v1'
        });
      }
      return recommendProducts(profile, opts.limit || 4, opts.analysis || null, opts);
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
    if (!profile || profile.consent_personalization !== true) return null;
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
     9) 과거 로컬 개인화 버퍼 정리(소급 병합 금지)
     ============================================================ */
  function flushBufferToDB() {
    if (!consentGiven() || !dbOn()) return Promise.resolve();
    // 현재 버전은 비로그인/비동의 행동을 수집하지 않는다. 과거 버전의
    // 로컬 버퍼를 새 동의에 소급 업로드하지 않고 폐기만 한다.
    return requireConsentedProfile().then(function (p) {
      if (!p) return null;
      try { localStorage.removeItem(LS_BUFFER); } catch (e) {}
      try { localStorage.removeItem(LS_PROFILE); } catch (e) {}
      return p;
    }).catch(function (error) {
      console.warn('[BelloreAI] 동의 상태 재확인 실패:', error && error.message || error);
      return null;
    });
  }

  /* ============================================================
     10) 고객용 AI 비서 UI — 플로팅 버튼 + 채팅 패널 (JS 자체 주입)
     ============================================================ */
  var CONSENT_KEY = 'bellore_ai_consent';
  var CONSENT_VERSION = 'personalization-v2-20260822';
  function consentLocalKey(uid) { return CONSENT_KEY + ':' + String(uid || ''); }
  function consentGiven() {
    var user = curUser();
    if (!user || !user.uid) return false;
    return lsGet(consentLocalKey(user.uid), false) === true || lsGet(CONSENT_KEY, '') === user.uid;
  }

  function clearLocalPersonalizationState(clearHistory) {
    var user = curUser();
    try {
      if (user && user.uid) localStorage.removeItem(consentLocalKey(user.uid));
      if (!user || lsGet(CONSENT_KEY, '') === user.uid) localStorage.removeItem(CONSENT_KEY);
    } catch (e) {}
    if (clearHistory) {
      try { localStorage.removeItem(LS_PROFILE); } catch (e2) {}
      try { localStorage.removeItem(LS_BUFFER); } catch (e2) {}
      try {
        sessionStorage.removeItem('bellore_ai_chat_session');
        if (user && user.uid) sessionStorage.removeItem(CHAT_SESSION_KEY_PREFIX + user.uid);
      } catch (e3) {}
      (_recoObservers || []).forEach(function (observer) { try { observer.disconnect(); } catch (e4) {} });
      _recoObservers = [];
      _impressedRecommendations = {};
      _recommendationTouches = {};
    }
    _profileCache = null;
  }

  // 로컬 스위치는 UX용일 뿐 권한 근거가 아니다. 쓰기/개인화 직전에
  // 서버 프로필의 본인 UID와 현재 동의를 다시 확인한다.
  function requireConsentedProfile() {
    var user = curUser();
    if (!user || !consentGiven() || !dbOn()) return Promise.resolve(null);
    var expectedUid = user.uid;
    return ensureProfile().then(function (profile) {
      var liveUser = curUser();
      if (!liveUser || liveUser.uid !== expectedUid) return null;
      if (!profile || profile.user_id !== expectedUid || profile.consent_personalization !== true) {
        clearLocalPersonalizationState(true);
        return null;
      }
      return profile;
    });
  }

  function injectStyles() {
    if ($('#bellore-ai-style')) return;
    var css = ''
      /* ── 미래형 AI 대화방(밝은 화이트 + 움직이는 파스텔 오로라 — 바이버원 톤) ── */
      + '.bai-action{display:block;margin:6px 0 10px;padding:11px 16px;border:none;border-radius:12px;background:linear-gradient(135deg,#2d7ff9,#7c5cfc);color:#fff;font:700 14px Pretendard;cursor:pointer;box-shadow:0 4px 16px rgba(78,104,252,.28)}'
      + '.bai-panel{position:fixed;inset:0;z-index:6000;display:none;background:rgba(0,0,0,.38)}'
      + '.bai-panel.show{display:block}'
      + '.bai-sheet{position:absolute;top:0;bottom:0;left:50%;transform:translateX(-50%);width:100%;max-width:var(--app-w);background:linear-gradient(180deg,#f3f7ff 0%,#fff 34%,#fff 100%);display:flex;flex-direction:column;overflow:hidden;font-family:Pretendard,-apple-system,sans-serif;box-shadow:0 0 60px rgba(0,0,0,.25)}'
      + '.bai-aura{position:absolute;inset:0;overflow:hidden;pointer-events:none}'
      + '.bai-aura b{position:absolute;width:340px;height:340px;border-radius:50%;filter:blur(78px);opacity:.16;will-change:transform}'
      + '.bai-aura .a1{left:-90px;top:-80px;background:#2d7ff9;animation:baiFloat1 21s ease-in-out infinite alternate}'
      + '.bai-aura .a2{right:-130px;top:14%;background:#7c5cfc;opacity:.13;animation:baiFloat2 27s ease-in-out infinite alternate}'
      + '.bai-aura .a3{left:10%;bottom:-150px;background:#14b8c4;opacity:.1;animation:baiFloat3 33s ease-in-out infinite alternate}'
      + '@keyframes baiFloat1{from{transform:translate3d(0,0,0) scale(1)}to{transform:translate3d(80px,70px,0) scale(1.2)}}'
      + '@keyframes baiFloat2{from{transform:translate3d(0,0,0) scale(1.1)}to{transform:translate3d(-90px,-50px,0) scale(.9)}}'
      + '@keyframes baiFloat3{from{transform:translate3d(0,0,0) scale(1)}to{transform:translate3d(70px,-80px,0) scale(1.18)}}'
      + '.bai-head,.bai-body,.bai-foot{position:relative;z-index:1}'
      + '.bai-head{display:flex;align-items:center;gap:11px;padding:15px 18px;border-bottom:1px solid #eceff7;background:rgba(255,255,255,.65);backdrop-filter:blur(8px)}'
      + '.bai-orb{flex:none;width:38px;height:38px;border-radius:50%;background:radial-gradient(circle at 32% 28%,#cfe0ff 0%,#7c5cfc 52%,#2d7ff9 82%,#1d4fd8 100%);box-shadow:0 0 14px rgba(124,92,252,.4);animation:baiBreath 3.4s ease-in-out infinite}'
      + '@keyframes baiBreath{0%,100%{box-shadow:0 0 10px rgba(124,92,252,.3);transform:scale(1)}50%{box-shadow:0 0 22px rgba(78,124,252,.55);transform:scale(1.06)}}'
      + '.bai-head b{font-size:16px;font-weight:700;color:#1a1a1a;letter-spacing:.02em}'
      + '.bai-head .bai-sub{font-size:12px;color:#6b6b6b;margin-top:1px}'
      + '.bai-beta{display:inline-block;margin-left:4px;padding:1px 7px;border-radius:8px;background:linear-gradient(135deg,#2d7ff9,#7c5cfc);color:#fff;font:700 10px Pretendard;vertical-align:middle}'
      + '.bai-x{margin-left:auto;background:none;border:none;font-size:24px;color:#9a9a9a;cursor:pointer;line-height:1}'
      + '.bai-body{flex:1;overflow:auto;padding:16px;background:transparent}'
      + '.bai-body::-webkit-scrollbar{width:5px}'
      + '.bai-body::-webkit-scrollbar-thumb{background:#d8d5cf;border-radius:3px}'
      + '.bai-hero{margin:4px 2px 18px;animation:baiIn .3s ease both}'
      + '.bai-hero .bai-hero-cap{display:block;font:700 10.5px Pretendard;letter-spacing:.14em;color:#9a9a9a;text-transform:uppercase}'
      + '.bai-hero b{display:block;margin-top:7px;font-size:22px;font-weight:800;color:#1a1a1a;line-height:1.25}'
      + '.bai-hero em{display:block;font-style:normal;font-size:22px;font-weight:800;line-height:1.3;color:#2d7ff9;background:linear-gradient(92deg,#2d7ff9 20%,#7c5cfc 80%);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}'
      + '.bai-menu{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px}'
      + '.bai-chip{padding:9px 13px;border:1px solid #e5e3df;border-radius:18px;background:rgba(255,255,255,.85);font:600 13px Pretendard;color:#1a1a1a;cursor:pointer;backdrop-filter:blur(4px)}'
      + '.bai-chip:active{background:#eef3ff;border-color:#bcd2ff}'
      + '.bai-msg{max-width:82%;margin:8px 0;padding:11px 14px;border-radius:14px;font-size:14px;line-height:1.55;white-space:pre-wrap;word-break:break-word;animation:baiIn .26s ease both}'
      + '@keyframes baiIn{from{opacity:0;transform:translateY(7px)}to{opacity:1;transform:none}}'
      + '.bai-msg.user{margin-left:auto;background:linear-gradient(135deg,#2d7ff9,#7c5cfc);color:#fff;border-bottom-right-radius:4px;box-shadow:0 4px 14px rgba(78,104,252,.22)}'
      + '.bai-msg.bot{margin-right:auto;background:rgba(255,255,255,.88);color:#1a1a1a;border:1px solid #e9ecf4;border-bottom-left-radius:4px;backdrop-filter:blur(6px);box-shadow:0 2px 10px rgba(30,50,120,.05)}'
      + '.bai-typing{display:flex;align-items:center;gap:5px;min-width:56px;min-height:20px}'
      + '.bai-typing span{width:7px;height:7px;border-radius:50%;background:#7ea4ff;animation:baiDot 1.15s ease-in-out infinite}'
      + '.bai-typing span:nth-child(2){animation-delay:.18s}'
      + '.bai-typing span:nth-child(3){animation-delay:.36s}'
      + '@keyframes baiDot{0%,60%,100%{transform:translateY(0);opacity:.45}30%{transform:translateY(-5px);opacity:1}}'
      + '@media (prefers-reduced-motion:reduce){.bai-aura b,.bai-orb,.bai-msg{animation:none}}'
      + '.bai-foot{display:flex;gap:8px;padding:12px 14px;border-top:1px solid #eceff7;background:rgba(255,255,255,.85);backdrop-filter:blur(10px)}'
      + '.bai-foot input{flex:1;min-width:0;height:46px;padding:0 14px;border:1px solid #e5e3df;border-radius:12px;font-size:15px;font-family:Pretendard;background:#fff;color:#1a1a1a}'
      + '.bai-foot input::placeholder{color:#9a9a9a}'
      + '.bai-foot input:focus{outline:none;border-color:#2d7ff9}'
      + '.bai-foot button{height:46px;padding:0 18px;border:none;border-radius:12px;background:linear-gradient(135deg,#2d7ff9,#7c5cfc);color:#fff;font:700 15px Pretendard;cursor:pointer;white-space:nowrap;box-shadow:0 4px 14px rgba(78,104,252,.28)}'
      + '.bai-consent{background:rgba(255,255,255,.9);border:1px solid #e9ecf4;border-radius:14px;padding:16px;margin-bottom:14px;backdrop-filter:blur(6px);box-shadow:0 2px 10px rgba(30,50,120,.05)}'
      + '.bai-consent p{font-size:13px;line-height:1.6;color:#1a1a1a;margin:0 0 12px}'
      + '.bai-consent label{display:flex;align-items:flex-start;gap:8px;font-size:13px;color:#1a1a1a;margin:8px 0;cursor:pointer}'
      + '.bai-consent label input{margin-top:2px}'
      + '.bai-consent .bai-agree{width:100%;height:46px;margin-top:10px;border:none;border-radius:12px;background:linear-gradient(135deg,#2d7ff9,#7c5cfc);color:#fff;font:700 15px Pretendard;cursor:pointer}'
      + '.bai-consent .bai-agree:disabled{background:#eceae6;color:#9a9a9a}'
      + '.bai-consent-fine{font-size:11px !important;color:#9a9a9a !important;margin:12px 0 0 !important}'
      + '.bai-consent-fine a{color:#6b6b6b;text-decoration:underline}'
      + '.bai-recos-wrap{position:relative;margin:2px 0 8px}'
      + '.bai-recos-prev,.bai-recos-next{display:none}'
      + '@media(min-width:560px){.bai-recos-prev,.bai-recos-next{display:flex;position:absolute;top:46%;transform:translateY(-50%);width:30px;height:30px;border-radius:50%;background:#fff;border:1px solid #e5e3df;box-shadow:0 2px 10px rgba(0,0,0,.18);align-items:center;justify-content:center;font-size:20px;color:#333;z-index:2;cursor:pointer}.bai-recos-prev{left:-2px}.bai-recos-next{right:-2px}}'
      + '.bai-reco-more{align-items:center;justify-content:center;gap:6px;color:#6b6b6b;background:#faf9f7}'
      + '.bai-reco-more .bai-more-ic{font-size:26px;line-height:1}'
      + '.bai-reco-more span{text-align:center;font-size:12px;font-weight:700;line-height:1.3}'
      + '.bai-recos{display:flex;gap:10px;overflow-x:auto;overflow-y:hidden;padding:2px 0 10px;margin:0;-webkit-overflow-scrolling:touch;scroll-snap-type:x proximity}'
      + '.bai-recos::-webkit-scrollbar{height:5px}'
      + '.bai-recos::-webkit-scrollbar-thumb{background:#d8d5cf;border-radius:3px}'
      + '.bai-reco{flex:0 0 168px;width:168px;display:flex;flex-direction:column;text-align:left;padding:0;border:1px solid #e5e3df;border-radius:14px;background:#fff;cursor:pointer;overflow:hidden;scroll-snap-align:start}'
      + '.bai-reco:active{background:#f7f6f3}'
      + '.bai-reco-thumb{position:relative;width:100%;height:168px;background:#f2f3f5;display:flex;align-items:center;justify-content:center}'
      + '.bai-reco-thumb img{width:100%;height:100%;object-fit:cover}'
      + '.bai-reco-ph{display:none;font-size:34px}'
      + '.bai-reco-thumb.noimg .bai-reco-ph{display:block}'
      + '.bai-reco-new{position:absolute;top:6px;left:6px;padding:2px 7px;border-radius:6px;background:#e23b3b;color:#fff;font:700 10px Pretendard;z-index:1}'
      + '.bai-reco-info{display:flex;flex-direction:column;gap:3px;padding:10px 11px 12px}'
      + '.bai-reco-info b{font-size:14px;font-weight:700;color:#1a1a1a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'
      + '.bai-reco-spec{font-size:11px;color:#6b6b6b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'
      + '.bai-reco-reason{font-size:10.5px;line-height:1.35;color:#2d6fd3;margin-top:2px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}'
      + '.bai-reco-price{font-size:15px;font-weight:800;color:#111;margin-top:2px}'
      + '.bai-reco-info em{font-size:10px;color:#9a9a9a;font-style:normal;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}';
    var st = document.createElement('style'); st.id = 'bellore-ai-style'; st.textContent = css;
    document.head.appendChild(st);
  }

  var MENU = [
    { t: '시계 추천받기', q: '제 취향에 맞는 시계를 추천해주세요' },
    { t: '시세 물어보기', q: '시세를 알고 싶어요' },
    { t: '입고 알림 설정', q: '입고 알림을 설정하고 싶어요' },
    { t: '내 취향 분석', q: '__profile__' },
    { t: '상담사 연결', q: '__support__' }
  ];

  var elPanel, elBody, elInput;

  /* 간단 토스트 */
  var _toastEl = null, _toastT = null;
  function toast(msg) {
    if (!_toastEl) {
      _toastEl = document.createElement('div');
      _toastEl.style.cssText = 'position:fixed;left:50%;bottom:120px;transform:translateX(-50%);z-index:6300;background:rgba(0,0,0,.88);color:#fff;padding:11px 16px;border-radius:22px;font:600 13px Pretendard;max-width:80vw;text-align:center;opacity:0;transition:opacity .25s;pointer-events:none';
      document.body.appendChild(_toastEl);
    }
    _toastEl.textContent = msg; _toastEl.style.opacity = '1';
    clearTimeout(_toastT); _toastT = setTimeout(function () { _toastEl.style.opacity = '0'; }, 2600);
  }

  function buildUI() {
    injectStyles();

    elPanel = document.createElement('div');
    elPanel.className = 'bai-panel';
    elPanel.innerHTML =
      '<div class="bai-sheet">' +
        '<div class="bai-aura" aria-hidden="true"><b class="a1"></b><b class="a2"></b><b class="a3"></b></div>' +
        '<div class="bai-head">' +
          '<span class="bai-orb" aria-hidden="true"></span>' +
          '<div><b>BELLORE AI <span class="bai-beta">BETA</span></b><div class="bai-sub">명품시계 전문 AI 컨시어지</div></div>' +
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

    var aiHeaderBtn = document.getElementById('headerAiBtn');
    if (aiHeaderBtn) aiHeaderBtn.addEventListener('click', function (e) { e.preventDefault(); openPanel(); });
    elPanel.addEventListener('click', function (e) {
      if (e.target.classList.contains('bai-panel') || e.target.closest('.bai-x')) { closePanel(); return; }
      var reco = e.target.closest('.bai-reco');
      if (reco) { if (reco.dataset.more) revealMore(reco); else openReco(reco); return; }
      var chip = e.target.closest('.bai-chip');
      if (chip) onMenu(chip.dataset.q);
    });
    $('#baiSend').addEventListener('click', sendCurrent);
    elInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') sendCurrent(); });
  }

  function openLogin() {
    var lm = document.getElementById('loginModal');
    if (lm) { lm.hidden = false; document.body.style.overflow = 'hidden'; }
    else if (window.BELLORE_openMyPage) window.BELLORE_openMyPage();
  }
  function openPanel() {
    if (elPanel.classList.contains('show')) return;
    // 로그인해야 이용 가능
    if (!loggedIn()) { toast('로그인 후 이용하실 수 있어요'); openLogin(); return; }
    elPanel.classList.add('show');
    // 브라우저/기기 뒤로가기로 닫히게 히스토리 상태 추가
    try { history.pushState({ baiChat: 1 }, ''); } catch (e) {}
    if (!elBody.dataset.init) {
      elBody.dataset.init = '1';
      if (!consentGiven()) renderConsent();
      else {
        var panelEpoch = _authEpoch;
        requireConsentedProfile().then(function (profile) {
        if (panelEpoch !== _authEpoch || !elPanel.classList.contains('show')) return;
        if (profile) renderIntro();
        else renderConsent();
      }).catch(function (error) {
        if (panelEpoch !== _authEpoch || !elPanel.classList.contains('show')) return;
        console.warn('[BelloreAI] 동의 상태 확인 실패:', error && error.message || error);
        renderConsent();
        toast('맞춤 추천 설정을 확인하지 못했어요');
      });
      }
    }
    setTimeout(function () { elInput && elInput.focus(); }, 100);
  }
  function closePanel(fromPop) {
    if (!elPanel.classList.contains('show')) return;
    elPanel.classList.remove('show');
    // 사용자가 X/배경으로 닫으면 우리가 추가한 히스토리 항목을 되돌린다(뒤로가기와 상태 일치)
    if (!fromPop) { try { if (history.state && history.state.baiChat) history.back(); } catch (e) {} }
  }
  // 뒤로가기(popstate) 시 열려있으면 닫기
  window.addEventListener('popstate', function () {
    if (elPanel && elPanel.classList.contains('show')) closePanel(true);
  });

  // 바이버원식 인사 타이틀(첫 화면 상단)
  function heroHTML() {
    return '<div class="bai-hero">' +
      '<span class="bai-hero-cap">AI Concierge Service</span>' +
      '<b>BELLORE AI :</b>' +
      '<em>안녕하세요,<br>무엇을 도와드릴까요?</em>' +
    '</div>';
  }

  function renderConsent() {
    elBody.innerHTML = heroHTML() +
      '<div class="bai-consent">' +
        '<p>더 잘 맞는 시계를 추천하기 위해 이 사이트의 대화, 상품 조회, 찜, 장바구니, 구매 요청 이력을 사용합니다. 개인화는 언제든 끌 수 있어요.</p>' +
        '<label><input type="checkbox" id="baiC1" checked> 사이트 내 행동 기반 맞춤 추천에 동의합니다 (선택)</label>' +
        '<button class="bai-agree" id="baiAgree">시작하기</button>' +
        '<p class="bai-consent-fine">자세한 안내는 <a href="#" data-legal-open="privacy">개인정보처리방침</a>을 참고해 주세요.</p>' +
      '</div>';
    var c1 = $('#baiC1'), agree = $('#baiAgree');
    c1.addEventListener('change', function () { agree.disabled = !c1.checked; });
    agree.addEventListener('click', function () {
      var user = curUser();
      // 광고 수신은 이 화면에서 받지 않는다. 이메일/SMS/카카오/푸시는
      // 향후 채널별 별도 동의 화면에서만 설정한다.
      var c2 = false;
      var grantEpoch = _authEpoch;
      var grantUid = user && user.uid || '';
      agree.disabled = true;
      if (!user || !dbOn() || !(sb() && typeof sb().rpc === 'function')) {
        agree.disabled = false;
        toast('동의 저장 기능을 사용할 수 없어요');
        return;
      }
      sb().rpc('grant_ai_personalization_consent', {
        p_notice_version: CONSENT_VERSION,
        p_source: 'ai_concierge',
        p_marketing_selected: !!c2
      }).then(function (result) {
        if (result && result.error) throw result.error;
        var liveUid = (curUser() && curUser().uid) || '';
        if (grantEpoch !== _authEpoch || grantUid !== liveUid) throw new Error('AUTH_CHANGED');
        _profileCache = null;
        return ensureProfile();
      }).then(function (savedProfile) {
        var liveUid = (curUser() && curUser().uid) || '';
        if (grantEpoch !== _authEpoch || grantUid !== liveUid || !savedProfile ||
            savedProfile.user_id !== user.uid || savedProfile.consent_personalization !== true) {
          throw new Error('CONSENT_CONFIRMATION_FAILED');
        }
        lsSet(consentLocalKey(user.uid), true);
        try { localStorage.removeItem(CONSENT_KEY); } catch (e) {}
        // 현재 UI는 로그인 전 행동을 수집하지 않는다. 과거 버전의 무동의
        // 게스트 버퍼가 남아 있더라도 새 동의에 소급 병합하지 않는다.
        try { localStorage.removeItem(LS_BUFFER); } catch (e) {}
        if (savedProfile && savedProfile.id) {
          try { localStorage.removeItem(LS_PROFILE); } catch (e) {}
        }
        renderIntro();
      }).catch(function (error) {
        var liveUid = (curUser() && curUser().uid) || '';
        if (grantEpoch !== _authEpoch || grantUid !== liveUid) return;
        clearLocalPersonalizationState(true);
        console.warn('[BelloreAI] 개인화 동의 저장 실패:', error && error.message || error);
        agree.disabled = false;
        toast('동의를 저장하지 못했어요. 잠시 후 다시 시도해 주세요');
      });
    });
  }

  function renderIntro() {
    elBody.innerHTML = heroHTML() +
      '<div class="bai-menu">' +
        MENU.map(function (m) { return '<button class="bai-chip" type="button" data-q="' + esc(m.q) + '">' + esc(m.t) + '</button>'; }).join('') +
      '</div>';
    // 저장된 관심 정보를 실제 기억처럼 말하지 않는다. 항상 현재 요청부터 확인한다.
    addBot('찾으시는 시계의 브랜드·모델·예산을 알려주세요. 현재 등록된 매물 안에서 확인해드릴게요.');
    addQuickChips();
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
  // AI가 생각 중일 때 점 3개 타이핑 인디케이터(답변 오면 그 자리에서 텍스트로 교체)
  function addTyping() {
    var d = document.createElement('div');
    d.className = 'bai-msg bot bai-typing';
    d.innerHTML = '<span></span><span></span><span></span>';
    elBody.appendChild(d);
    elBody.scrollTop = elBody.scrollHeight;
    return d;
  }
  function resolveTyping(el, text) {
    el.classList.remove('bai-typing');
    el.innerHTML = '';
    el.textContent = text;
    elBody.scrollTop = elBody.scrollHeight;
  }

  // 추천 매물을 이미지+스펙+바로가기 카드로 렌더
  function recoCardHTML(x) {
    var p = x.product || {};
    var name = [p.brand, p.model].filter(Boolean).join(' ') || '매물';
    var img = p.photo
      ? '<img src="' + esc(p.photo) + '" alt="" loading="lazy" onerror="this.style.display=\'none\';this.parentNode.classList.add(\'noimg\')">'
      : '';
    var specs = [p.size ? (p.size + 'mm') : '', p.color, p.material].filter(Boolean).join(', ');
    var isNew = p.created_at && (Date.now() - Date.parse(p.created_at)) < 3 * 24 * 3600 * 1000;
    return '<button type="button" class="bai-reco" data-pid="' + esc(p.id || '') + '"' +
        ' data-request-id="' + esc(x.request_id || '') + '" data-rank="' + esc(x.rank || '') +
        '" data-algorithm="' + esc(x.algorithm_version || '') + '" data-variant="' + esc(x.variant || '') + '">' +
        '<span class="bai-reco-thumb' + (p.photo ? '' : ' noimg') + '">' +
          (isNew ? '<span class="bai-reco-new">NEW</span>' : '') +
          img + '<span class="bai-reco-ph">⌚</span></span>' +
        '<span class="bai-reco-info">' +
          '<b>' + esc(name) + '</b>' +
          (specs ? ('<span class="bai-reco-spec">' + esc(specs) + '</span>') : '') +
          (x.reason ? ('<span class="bai-reco-reason">' + esc(x.reason) + '</span>') : '') +
          '<span class="bai-reco-price">' + krwShort(p.price) + '원</span>' +
          (p.reference_number ? ('<em>Ref. ' + esc(p.reference_number) + '</em>') : '') +
        '</span>' +
      '</button>';
  }

  var _impressedRecommendations = {};
  var _recoObservers = [];
  function recommendationExposureKey(item, surface) {
    var product = item && item.product || {};
    return [surface || 'unknown', item && item.request_id || '', product.id || '', item && item.rank || ''].join(':');
  }
  function observeRecommendationCards(wrap, scroller, items) {
    if (!wrap || !scroller || !items || !items.length || typeof window.IntersectionObserver !== 'function') return;
    wrap._recoItems = wrap._recoItems || {};
    items.forEach(function (item) {
      wrap._recoItems[recommendationExposureKey(item, 'ai_chat')] = item;
    });
    if (!wrap._recoObserver) {
      wrap._recoObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting || entry.intersectionRatio < 0.6 ||
              document.visibilityState !== 'visible' || !elPanel || !elPanel.classList.contains('show')) return;
          var node = entry.target;
          var key = ['ai_chat', node.dataset.requestId || '', node.dataset.pid || '', node.dataset.rank || ''].join(':');
          var item = wrap._recoItems[key];
          if (!item || _impressedRecommendations[key]) { wrap._recoObserver.unobserve(node); return; }
          _impressedRecommendations[key] = true;
          wrap._recoObserver.unobserve(node);
          trackRecommendationImpressions([item], 'ai_chat');
        });
      }, { root: scroller, threshold: [0.6] });
      _recoObservers.push(wrap._recoObserver);
    }
    Array.prototype.slice.call(scroller.querySelectorAll('.bai-reco[data-pid]')).forEach(function (node) {
      wrap._recoObserver.observe(node);
    });
  }

  function addCards(recos) {
    if (!recos || !recos.length) return;
    var wrap = document.createElement('div'); wrap.className = 'bai-recos-wrap';
    var scroller = document.createElement('div'); scroller.className = 'bai-recos';
    var first = recos.slice(0, 10), rest = recos.slice(10);
    scroller.innerHTML = first.map(recoCardHTML).join('') +
      (rest.length ? '<button type="button" class="bai-reco bai-reco-more" data-more="1"><span class="bai-more-ic">＋</span><span>추천 ' + rest.length + '개<br>더 보기</span></button>' : '');
    wrap.appendChild(scroller);
    wrap._rest = rest;
    // 좌우 화살표(PC). 오른쪽 끝이면 처음으로 순환.
    [['prev', '‹'], ['next', '›']].forEach(function (d) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'bai-recos-' + d[0]; b.innerHTML = d[1];
      b.addEventListener('click', function () {
        if (d[0] === 'prev') {
          if (scroller.scrollLeft <= 4) scroller.scrollTo({ left: scroller.scrollWidth, behavior: 'smooth' });
          else scroller.scrollBy({ left: -300, behavior: 'smooth' });
        } else {
          if (scroller.scrollLeft + scroller.clientWidth >= scroller.scrollWidth - 6) scroller.scrollTo({ left: 0, behavior: 'smooth' });
          else scroller.scrollBy({ left: 300, behavior: 'smooth' });
        }
      });
      wrap.appendChild(b);
    });
    elBody.appendChild(wrap);
    elBody.scrollTop = elBody.scrollHeight;
    observeRecommendationCards(wrap, scroller, first);
  }
  // '더 보기' → 채팅 안에서 남은 추천을 이어붙임(페이지 이동 없음)
  function revealMore(moreBtn) {
    var scroller = moreBtn.parentNode, wrap = scroller.parentNode;
    var rest = (wrap && wrap._rest) || [];
    moreBtn.remove();
    if (rest.length) scroller.insertAdjacentHTML('beforeend', rest.map(recoCardHTML).join(''));
    if (rest.length) observeRecommendationCards(wrap, scroller, rest);
    if (wrap) wrap._rest = [];
  }
  function openReco(recoEl) {
    var pid = recoEl && recoEl.dataset && recoEl.dataset.pid;
    if (!pid) return;
    var item = {
      product: { id: pid },
      request_id: recoEl.dataset.requestId || null,
      rank: Number(recoEl.dataset.rank) || null,
      algorithm_version: recoEl.dataset.algorithm || null,
      variant: recoEl.dataset.variant || null,
      surface: 'ai_chat'
    };
    trackRecommendation('recommendation_click', item, 'ai_chat', item.rank);
    closePanel();
    setTimeout(function () {
      if (window.BELLORE_openProductById) window.BELLORE_openProductById(pid);
    }, 120);
  }

  function onMenu(q) {
    if (q === '__profile__') { showProfileSummary(); return; }
    if (q === '__support__') {
      addUser('상담사 연결');
      addBot('상담사(고객센터)로 연결해 드릴게요. 잠시만요…');
      track('inquiry_submit', { value: { via: 'ai_assistant' } });
      setTimeout(function () {
        closePanel();
        if (window.CQDemo && window.CQDemo.open) window.CQDemo.open({ screen: 'c-chat' });
        else toast('고객센터는 마이페이지 > 고객센터에서 이용하실 수 있어요');
      }, 500);
      return;
    }
    elInput.value = q; sendCurrent();
  }
  // 취향 Q&A용 빠른 선택 칩(브랜드/예산) — 누르면 그 내용을 메시지로 보냄
  function addQuickChips() {
    var wrap = document.createElement('div');
    wrap.className = 'bai-menu';
    var opts = ['롤렉스', '오메가', '까르띠에', '튜더', '파텍필립', '예산 500만 이하', '예산 1000만대', '예산 3000만 이상'];
    wrap.innerHTML = opts.map(function (o) { return '<button class="bai-chip" type="button" data-q="' + esc(o) + '">' + esc(o) + '</button>'; }).join('');
    elBody.appendChild(wrap);
    elBody.scrollTop = elBody.scrollHeight;
  }
  // 채팅 안 단일 액션 버튼
  function addActionButton(label, fn) {
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'bai-action';
    b.textContent = label;
    b.addEventListener('click', fn);
    elBody.appendChild(b);
    elBody.scrollTop = elBody.scrollHeight;
  }

  function showProfileSummary() {
    var summaryEpoch = _authEpoch;
    requireConsentedProfile().then(function (p) {
      if (summaryEpoch !== _authEpoch) return;
      addUser('내 취향 분석');
      if (!p) {
        addBot('맞춤 추천 동의 상태를 다시 확인해 주세요.');
        renderConsent();
        return;
      }
      var s = provider.summarizeCustomer(p, null);
      var lines = ['지금까지 분석된 취향이에요:', '', s];
      if (!(p.preferred_brands || []).length) lines = ['아직 분석된 관심 정보가 적어요. 관심 브랜드·모델·예산을 말씀해 주시면 더 정확해져요.'];
      addBot(lines.join('\n'));
      if (p.consent_personalization === true) addActionButton('맞춤 추천 끄기 · 추천 기록 초기화', requestDisablePersonalization);
    });
  }

  function requestDisablePersonalization() {
    var message = '맞춤 추천을 끄고 저장된 대화·행동·취향·추천 기록을 초기화할까요? 이 작업은 되돌릴 수 없습니다.';
    var ask = window.bellConfirm
      ? window.bellConfirm(message, { title: '맞춤 추천 설정', okText: '끄고 초기화', cancelText: '유지하기' })
      : Promise.resolve(window.confirm(message));
    ask.then(function (approved) { if (approved) disablePersonalization(); });
  }

  function disablePersonalization() {
    var disableEpoch = _authEpoch;
    var disableUid = (curUser() && curUser().uid) || '';
    ensureProfile().then(function (profile) {
      var liveUid = (curUser() && curUser().uid) || '';
      if (!disableUid || disableEpoch !== _authEpoch || disableUid !== liveUid ||
          !profile || profile.user_id !== disableUid) throw new Error('AUTH_CHANGED');
      if (dbOn() && sb() && typeof sb().rpc === 'function') {
        return sb().rpc('withdraw_ai_personalization', { p_delete_history: true }).then(function (result) {
          if (result && result.error) throw result.error;
          return result && result.data || { history_deleted: true };
        }).catch(function (error) {
          console.warn('[BelloreAI] 서버 개인화 철회 실패:', error && error.message || error);
          throw error;
        });
      }
      throw new Error('PERSONALIZATION_WITHDRAW_RPC_REQUIRED');
    }).then(function (result) {
      var liveUid = (curUser() && curUser().uid) || '';
      if (disableEpoch !== _authEpoch || disableUid !== liveUid) return;
      clearLocalPersonalizationState(true);
      if (result && result.history_deleted === true) toast('맞춤 추천을 끄고 추천 기록을 초기화했어요');
      else toast('이후 행동 수집과 맞춤 추천을 중단했어요');
      renderConsent();
    }).catch(function (error) {
      var liveUid = (curUser() && curUser().uid) || '';
      if (disableEpoch !== _authEpoch || disableUid !== liveUid) return;
      // 서버 철회가 실패해도 이 기기에서는 즉시 신규 개인화 요청을 멈춘다.
      clearLocalPersonalizationState(true);
      if (elBody) renderConsent();
      console.warn('[BelloreAI] 개인화 중단 저장 실패:', error && error.message || error);
      toast('이 기기에서는 중단했지만 서버 기록 삭제를 완료하지 못했어요. 잠시 후 다시 시도해 주세요');
    });
  }

  var _busy = false;
  function sendCurrent() {
    var msg = (elInput.value || '').trim();
    if (!msg || _busy) return;
    if (!consentGiven()) { renderConsent(); return; }
    _busy = true; elInput.value = '';
    var sendEpoch = _authEpoch;
    var sendUid = (curUser() && curUser().uid) || '';
    addUser(msg);
    var thinking = addTyping();
    handleUserMessage(msg).then(function (res) {
      var liveUid = (curUser() && curUser().uid) || '';
      if (sendEpoch !== _authEpoch || sendUid !== liveUid) return;
      resolveTyping(thinking, res.reply);
      if (res.consentRequired) { renderConsent(); _busy = false; return; }
      addCards(res.recommendations);
      if (res.askPref) addQuickChips();
      _busy = false;
    }).catch(function (e) {
      var liveUid = (curUser() && curUser().uid) || '';
      if (sendEpoch !== _authEpoch || sendUid !== liveUid) return;
      resolveTyping(thinking, '설정을 확인하거나 저장하는 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요.');
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
    var card = el.closest('[data-listing-id],[data-pid],[data-id],.hcard,.wish-recent-row,.wish-recommend-card,.wish-cart-row,.product-card,.pcard,.listing-card') || el;
    var brand = card.getAttribute && (card.getAttribute('data-brand') || '');
    var model = card.getAttribute && (card.getAttribute('data-model') || '');
    var ref = card.getAttribute && (card.getAttribute('data-ref') || card.getAttribute('data-reference') || '');
    var pid = card.getAttribute && (card.getAttribute('data-listing-id') || card.getAttribute('data-pid') || card.getAttribute('data-id') || '');
    var current = window.BELLORE_currentProduct || {};
    if (!brand) {
      var brandEl = card.querySelector && card.querySelector('.hcard-brand');
      brand = (brandEl && brandEl.textContent) || current.brand || '';
    }
    if (!model) {
      var modelEl = card.querySelector && card.querySelector('.hcard-model');
      model = (modelEl && modelEl.textContent) || current.model || '';
    }
    if (!pid) pid = current.listingId || '';
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
      if (!consentGiven() || !loggedIn()) return;
      // 찜·장바구니·추천 카드는 wishlist.js가 실제 상태 변경/확인 완료 뒤
      // 정확한 상품으로 단일 canonical 이벤트를 보낸다. capture 단계에서는
      // 취소된 삭제나 체크박스 클릭을 행동으로 오인하지 않는다.
      if (e.target.closest('.hcard-wish,.hcard-cart,#pmWish,#pmWishTop,#pmCart,.wish-remove,.wish-addcart,' +
          '[data-cart-check],#cartSelectAll,#cartRemoveSelected,#cartOrderSelected,.wish-buy,' +
          '[data-recent-wish],[data-recommend-wish],.wish-recommend-card,.bai-reco')) return;

      // 상세의 즉시 구매 진입만 구매 요청으로 기록한다. 장바구니/찜 주문은
      // 선택상품을 알고 있는 wishlist.js에서 기록한다.
      var purchase = e.target.closest('#pmBuy');
      if (purchase) {
        var purchaseInfo = infoFromEl(purchase);
        if (purchaseInfo.brand || purchaseInfo.reference_number || purchaseInfo.product_id) track('purchase_request', purchaseInfo);
        return;
      }
      // 실제 상품 열기 경로만 조회로 기록한다. 광범위한 [data-pid] 매칭은
      // 선택/삭제 같은 비조회 동작까지 오염시키므로 사용하지 않는다.
      var pc = e.target.closest('.hcard:not(.wish-card),.wish-recent-row,.wish-cart-thumb,' +
        '.product-card,.pcard,.listing-card,[data-open-product]');
      if (pc && e.target.closest('button,a,input,label,select,textarea') && !e.target.closest('.wish-cart-thumb,[data-open-product]')) return;
      if (pc) {
        var info2 = infoFromEl(pc);
        if (info2.brand || info2.reference_number || info2.product_id) track('product_view', info2);
      }
    }, true);
  }

  /* ============================================================
     12) 초기화 + 로그인 연동
     ============================================================ */
  var _activeAuthUid = (curUser() && curUser().uid) || '';
  var _authEpoch = 0;
  function resetAiSessionForAuth(user) {
    var nextUid = (user && (user.uid || user.id)) || '';
    if (nextUid === _activeAuthUid) return;
    _activeAuthUid = nextUid;
    _profileCache = null;
    _impressedRecommendations = {};
    _recommendationTouches = {};
    (_recoObservers || []).forEach(function (observer) { try { observer.disconnect(); } catch (e) {} });
    _recoObservers = [];
    _authEpoch += 1;
    _busy = false;
    if (elBody) {
      elBody.innerHTML = '';
      delete elBody.dataset.init;
    }
    if (elPanel) elPanel.classList.remove('show');
    try { sessionStorage.removeItem('bellore_ai_chat_session'); } catch (e) {}
  }

  function bindAuth() {
    if (B() && B().onAuthChange) {
      B().onAuthChange(function (user) {
        resetAiSessionForAuth(user);
        if (user) flushBufferToDB();
        else _profileCache = null;
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
    recommendCurrentUser: recommendCurrentUser,
    personalizationEnabled: function () {
      var user = curUser();
      return !!(user && consentGiven() && _profileCache &&
        _profileCache.user_id === user.uid && _profileCache.consent_personalization === true);
    },
    trackRecommendation: trackRecommendation,
    trackRecommendationImpressions: trackRecommendationImpressions,
    rememberRecommendationTouch: rememberRecommendationTouch,
    recommendationAttribution: recommendationAttribution,
    generateAlertCandidates: generateAlertCandidates,
    buildAlertCandidates: buildAlertCandidates,
    krwShort: krwShort,
    STAGE_LABEL: STAGE_LABEL,
    openPanel: function () { openPanel(); },
    _internals: { flushBufferToDB: flushBufferToDB }
  };

  /* 고객 마이페이지 메뉴에 'AI 시계비서' 행을 '고객센터' 위에 주입 */
  function injectCustomerMenu() {
    var box = document.getElementById('mpMenuList');
    if (!box || !document.body.classList.contains('mypage-open')) return;
    if (box.querySelector('#mpAiRow')) return;
    var cs = box.querySelector('[data-mpmenu="cs"]');   // 고객센터 행
    var btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'mp-menu-row'; btn.id = 'mpAiRow';
    btn.innerHTML = '<span class="mr-label">AI 시계비서 <b style="color:#8a8f98;font-size:11px;vertical-align:middle">BETA</b></span><span class="mr-arrow">›</span>';
    btn.addEventListener('click', function () { openPanel(); });
    if (cs) box.insertBefore(btn, cs); else box.appendChild(btn);
  }

  function init() {
    buildUI();
    bindAutoTracking();
    setInterval(injectCustomerMenu, 700);   // 마이페이지 열릴 때/재렌더 시 재주입(가벼움)
    if (!bindAuth()) {
      var tries = 0, t = setInterval(function () { if (bindAuth() || ++tries > 20) clearInterval(t); }, 150);
    }
    // 이미 로그인 상태면 버퍼 병합 시도
    setTimeout(function () { if (loggedIn()) flushBufferToDB(); }, 800);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
