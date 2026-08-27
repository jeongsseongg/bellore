const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const advisor = fs.readFileSync(path.join(root, 'ai-advisor.js'), 'utf8');
const brandsCatalog = fs.readFileSync(path.join(root, 'brands.js'), 'utf8');
const recommendationEngine = fs.readFileSync(path.join(root, 'app', 'legacy', 'recommendation-engine.js'), 'utf8');
const payments = fs.readFileSync(path.join(root, 'payments.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const serviceWorker = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const advisorSql = fs.readFileSync(path.join(root, 'ai_advisor.sql'), 'utf8');
const privacyMigration = fs.readFileSync(path.join(root, 'supabase', 'recommendation_v2_migration.sql'), 'utf8');
const aiLearn = fs.readFileSync(path.join(root, 'supabase', 'functions', 'ai-learn', 'index.ts'), 'utf8');
const wishlist = fs.readFileSync(path.join(root, 'wishlist.js'), 'utf8');

assert.match(advisor, /profile\.consent_personalization !== true/);
assert.match(advisor, /lsGet\(CONSENT_KEY, ''\) === user\.uid/);
assert.match(advisor, /!consentGiven\(\) \|\| !loggedIn\(\)/);
assert.match(advisor, /requireConsentedProfile/);
assert.match(advisor, /grant_ai_personalization_consent/);
assert.doesNotMatch(advisor, /from\('customer_ai_profiles'\)\.insert/);
assert.match(advisor, /_authEpoch/);
assert.match(advisor, /_profileCache = null;\s*_impressedRecommendations = \{\};\s*_recommendationTouches = \{\};/);
assert.match(advisor, /IntersectionObserver/);
assert.match(advisor, /getAttribute\('data-pid'\)/);
assert.match(advisor, /cart_add:\s*\{ stage: 'high_intent', probability: 68 \}/);
assert.match(advisor, /purchase_request:\s*\{ stage: 'ready_to_buy', probability: 88 \}/);
assert.match(advisor, /fetchRecommendationSignals\(profile\)/);
assert.match(advisor, /RECOMMENDATION_CATALOG_TIMEOUT/);
assert.match(advisor, /RECOMMENDATION_SIGNALS_UNAVAILABLE/);
assert.match(advisor, /RECOMMENDATION_ENGINE_UNAVAILABLE/);
assert.match(advisor, /inventory_lookup_unavailable/);
assert.doesNotMatch(advisor, /var fallback = recommendForProfile/);
assert.match(advisor, /canPersonalize \? signals\.interests : \[\]/);
assert.match(advisor, /\.eq\('event_type', 'recommendation_impression'\)/);
assert.match(advisor, /ephemeral_context: true/);
assert.match(wishlist, /contextItems: getCart\(\)\.slice\(\)/);
assert.match(advisor, /purchase_complete:\s*null/);
assert.match(advisor, /recommendation_impression/);
assert.match(advisor, /recommendation_click/);
assert.match(advisor, /cart_remove/);
assert.match(advisor, /구매의도 지수/);
assert.doesNotMatch(recommendationEngine, /Math\.random/);
assert.match(recommendationEngine, /heuristic_action_proxy/);
assert.match(recommendationEngine, /purchased_cooldown/);
assert.match(html, /app\/legacy\/recommendation-engine\.js\?v=20260826-member-verification-live-v2/);
assert.match(html, /ai-advisor\.js\?v=20260826-member-verification-live-v2/);
assert.match(html, /payments\.js\?v=20260827-checkout-methods-v1/);
assert(html.indexOf('recommendation-engine.js') < html.indexOf('wishlist.js'));
assert(html.indexOf('recommendation-engine.js') < html.indexOf('ai-advisor.js'));
assert.match(html, /선택적 맞춤 추천과 프로파일링/);
assert.match(payments, /BelloreAnalytics\.purchaseComplete/);
assert.doesNotMatch(payments, /BelloreAI\.track\('purchase_complete'/,
  '서버 권위 결제 경로는 미배포 개인화 paid 진단 이벤트를 직접 확정하지 않습니다.');
const serviceWorkerVersion = serviceWorker.match(/const VERSION = "([^"]+)"/)?.[1];
assert(serviceWorkerVersion, 'service worker must declare a cache version');
assert.match(serviceWorkerVersion, /^bellore-v\d+-/);
assert.match(serviceWorker, /recommendation-engine\.js/);
assert.match(serviceWorker, /ignoreSearch: true/);
assert.match(serviceWorker, /req\.mode === 'navigate'/);
assert.match(wishlist, /trackBehavior\('cart_remove'/);
assert.match(wishlist, /observeCartRecommendationImpressions/);
assert.doesNotMatch(wishlist, /trackRecommendationImpressions\(recommendations\.map/);
assert.match(advisorSql, /recommendation_v2_migration\.sql/);
assert.match(privacyMigration, /grant_ai_personalization_consent/);
assert.match(privacyMigration, /AI_PERSONALIZATION_CONSENT_REQUIRED/);
assert.match(privacyMigration, /for update/);
assert.match(privacyMigration, /ai_consent_ledger/);
assert.match(privacyMigration, /on delete cascade/);
assert.match(privacyMigration, /interval '90 days'/);
assert.doesNotMatch(privacyMigration, /cron\.schedule\(/);
assert.match(aiLearn, /buy_intent_index: p\.buy_probability/);
assert.doesNotMatch(aiLearn, /buying_stage: p\.buying_stage, buy_probability:/);
assert.match(aiLearn, /구매확률·성공확률·퍼센트로 표현하지 말고/);
assert.match(aiLearn, /fit_score: Number\(item\.score\)/);
assert.match(aiLearn, /fit_score와 고객의 구매의도 지수는 내부 휴리스틱/);

function runtime(options) {
  options = options || {};
  const localConsent = options.localConsent === true;
  const remoteConsent = options.remoteConsent === true;
  const profileExists = options.profileExists !== false;
  const calls = [];
  const store = new Map();
  if (localConsent) store.set('bellore_ai_consent', JSON.stringify('user-1'));
  const profile = {
    id: 'profile-1', user_id: 'user-1', consent_personalization: remoteConsent,
    preferred_brands: [], preferred_models: [], preferred_references: [],
    buying_stage: 'browsing', buy_probability: 15
  };
  const sbClient = {
    from(table) {
      const state = { table, action: 'select', payload: null };
      const builder = {
        select() { state.action = 'select'; return builder; },
        eq() { return builder; },
        in() { return builder; },
        gte() { return builder; },
        limit() { return builder; },
        order() { return builder; },
        insert(payload) { state.action = 'insert'; state.payload = payload; calls.push({ ...state }); return Promise.resolve({ data: payload, error: null }); },
        update(payload) { state.action = 'update'; state.payload = payload; calls.push({ ...state }); return builder; },
        then(resolve, reject) {
          const data = table === 'customer_ai_profiles' && profileExists ? [profile] : [];
          return Promise.resolve({ data, error: null }).then(resolve, reject);
        }
      };
      return builder;
    }
  };
  const localStorage = {
    getItem(key) { return store.has(key) ? store.get(key) : null; },
    setItem(key, value) { store.set(key, String(value)); },
    removeItem(key) { store.delete(key); }
  };
  const document = { readyState: 'loading', addEventListener() {} };
  const window = {
    NWBackend: { currentUser() { return { uid: 'user-1' }; } },
    BelloreRecommendationEngine: require(path.join(root, 'app', 'legacy', 'recommendation-engine.js')),
    sbClient, localStorage, document, console, setTimeout() {}, setInterval() {}, addEventListener() {}
  };
  const sandbox = { window, document, localStorage, console, setTimeout() {}, setInterval() {} };
  vm.runInNewContext(brandsCatalog, sandbox, { filename: 'brands.js' });
  vm.runInNewContext(advisor, sandbox, { filename: 'ai-advisor.js' });
  return { api: window.BelloreAI, calls, store };
}

(async function () {
  const missing = runtime({ profileExists: false });
  assert.equal(await missing.api.ensureProfile(), null,
    'a missing profile must be created only by the consent RPC');
  assert.equal(missing.calls.length, 0,
    'profile lookup must never fall back to a direct browser INSERT');

  const referenceQuery = missing.api.rules.analyze('롤렉스 14060 추천해줘');
  assert.deepEqual(Array.from(referenceQuery.references), ['14060']);
  assert.equal(referenceQuery.budget, null,
    'a five-digit manufacturer reference must not become a budget');

  const referencePriceQuestion = missing.api.rules.analyze('롤렉스 14060 가격 알려줘');
  assert.deepEqual(Array.from(referencePriceQuestion.references), ['14060']);
  assert.equal(referencePriceQuestion.budget, null,
    'asking the price of a reference is not declaring a budget');

  const referenceAndBudget = missing.api.rules.analyze('14060 예산 1500만원');
  assert.deepEqual(Array.from(referenceAndBudget.references), ['14060']);
  assert.equal(referenceAndBudget.budget.min, 12750000);
  assert.equal(referenceAndBudget.budget.max, 17250000);

  const budgetQuery = missing.api.rules.analyze('예산 1500 이하로 추천해줘');
  assert.equal(budgetQuery.references.length, 0);
  assert.equal(budgetQuery.budget.max, 15000000,
    'an explicit bare-number budget cue must still support 만원-domain shorthand');

  const exclusionQuery = missing.api.rules.analyze('롤렉스 말고 오메가 추천해줘');
  assert.deepEqual(Array.from(exclusionQuery.brands), ['오메가']);
  assert.deepEqual(Array.from(exclusionQuery.excluded_brands), ['롤렉스'],
    'an explicitly excluded brand must never be learned as a positive preference');

  [
    ['미도 말고 해밀턴 추천해줘', '미도', '해밀턴'],
    ['론진 말고 피아제 추천해줘', '론진', '피아제'],
    ['로저 드뷔 빼고 오메가 추천해줘', '로저드뷔', '오메가'],
    ['세이코 제외하고 롤렉스 추천해줘', '세이코', '롤렉스']
  ].forEach(([query, excluded, included]) => {
    const parsed = missing.api.rules.analyze(query);
    assert.deepEqual(Array.from(parsed.excluded_brands), [excluded]);
    assert.deepEqual(Array.from(parsed.brands), [included]);
  });

  ['was2112', 'H326160', 'WBP201B', 'DBVE4088', 'WAV511C', 'PAM01564']
    .forEach((reference) => {
      const parsed = missing.api.rules.analyze(`${reference} 추천해줘`);
      assert.deepEqual(Array.from(parsed.references), [reference.toUpperCase()],
        `letter-leading manufacturer reference must be extracted: ${reference}`);
      assert.equal(parsed.budget, null);
    });

  [
    '예산 1200~1500', '예산 1200~1500만원', '1200~1500만원 예산',
    '가격대 1200에서 1500만원', '1200부터 1500만원까지 예산'
  ]
    .forEach((query) => {
      const parsed = missing.api.rules.analyze(query);
      assert.deepEqual(Array.from(parsed.references), [],
        `budget range endpoints must not become references: ${query}`);
      assert.deepEqual({ min: parsed.budget.min, max: parsed.budget.max },
        { min: 12000000, max: 15000000 });
    });

  const mixedRange = missing.api.rules.analyze('H326160 예산 1200~1500만원');
  assert.deepEqual(Array.from(mixedRange.references), ['H326160']);
  assert.deepEqual({ min: mixedRange.budget.min, max: mixedRange.budget.max },
    { min: 12000000, max: 15000000 });

  const stockCode = missing.api.rules.analyze('BRT-N8263-1 찾아줘');
  assert.deepEqual(Array.from(stockCode.product_numbers), ['BRT-N8263-1']);
  assert.deepEqual(Array.from(stockCode.references), [],
    'a Bellore stock number must not leak its N8263 segment into manufacturer references');
  assert.equal(stockCode.budget, null);

  [
    '스크롤 내려서 다른 추천 더 보여줘',
    '컨트롤하기 쉬운 시계 추천',
    '재미도 있고 가성비 좋은 시계 추천해줘',
    '이 모델 의미도 설명해줘'
  ].forEach((query) => {
    assert.deepEqual(Array.from(missing.api.rules.analyze(query).brands), [],
      `short brand names must not match inside ordinary words: ${query}`);
  });
  assert.deepEqual(Array.from(missing.api.rules.analyze('롤 추천').brands), ['롤렉스']);
  assert.deepEqual(Array.from(missing.api.rules.analyze('미도 추천').brands), ['미도']);

  const inventoryBrands = [
    '그랜드세이코', '까르띠에', '로저드뷔', '론진', '롤렉스', '리브토만', '몽블랑',
    '미도', '바쉐론콘스탄틴', '보메 메르시에', '부쉐러', '불가리', '브라이틀링',
    '브랜드미상', '브레게', '블랑팡', '샤넬', '세이코', '에르메스', '예거르쿨트르',
    '오리스', '오메가', '위블로', '제니스', '제랄드 젠타', '코럼', '콩코드',
    '태그호이어', '파네라이', '파텍필립', '프랭크뮬러', '피아제', '해밀턴', 'IWC'
  ];
  inventoryBrands.forEach((brand) => {
    assert.deepEqual(Array.from(missing.api.rules.analyze(`${brand} 추천`).brands), [brand],
      `inventory brand must resolve to one exact canonical value: ${brand}`);
  });
  assert.deepEqual(Array.from(missing.api.rules.analyze('그랜드 세이코 추천').brands), ['그랜드세이코']);
  assert.deepEqual(Array.from(missing.api.rules.analyze('세이코 추천').brands), ['세이코']);
  const excludeGrand = missing.api.rules.analyze('그랜드세이코 말고 세이코 추천');
  assert.deepEqual(Array.from(excludeGrand.excluded_brands), ['그랜드세이코']);
  assert.deepEqual(Array.from(excludeGrand.brands), ['세이코']);
  const excludeSeiko = missing.api.rules.analyze('세이코 말고 그랜드세이코 추천');
  assert.deepEqual(Array.from(excludeSeiko.excluded_brands), ['세이코']);
  assert.deepEqual(Array.from(excludeSeiko.brands), ['그랜드세이코']);

  [
    ['롤렉스 데이트저스트 추천', '데이저스트'],
    ['롤렉스 데이저스트 추천', '데이저스트'],
    ['롤렉스 Datejust 추천', '데이저스트'],
    ['롤렉스 Submariner 추천', '서브마리너'],
    ['태그호이어 카레라 추천', '까레라'],
    ['태그호이어 까레라 추천', '까레라'],
    ['롤렉스 셀리니 추천', '셀리니'],
    ['샤넬 J12 추천', 'J12']
  ].forEach(([query, model]) => {
    assert.deepEqual(Array.from(missing.api.rules.analyze(query).models), [model],
      `model alias must resolve to the inventory family: ${query}`);
  });

  [
    ['예산 1천5백만원', 12750000, 17250000],
    ['예산 2천5백만원', 21250000, 28750000],
    ['3천5백만원 이하', null, 35000000],
    ['예산 1억5천만원', 127500000, 172500000]
  ].forEach(([query, min, max]) => {
    const parsed = missing.api.rules.analyze(query);
    assert.equal(parsed.budget.min, min, query);
    assert.equal(parsed.budget.max, max, query);
    assert.deepEqual(Array.from(parsed.references), [], query);
  });

  assert.notEqual(missing.api.rules.analyze('팔목이 얇은데 롤렉스 추천해줘').buying_stage, 'sell_intent');
  assert.notEqual(missing.api.rules.analyze('팔에 잘 어울리는 오메가 추천').buying_stage, 'sell_intent');
  assert.equal(missing.api.rules.analyze('롤렉스 팔고 싶어요').buying_stage, 'sell_intent');

  ['가격 1500 정도 롤렉스 추천', '1500 가격대로 추천', '가격은 1500 정도로 추천']
    .forEach((query) => {
      const parsed = missing.api.rules.analyze(query);
      assert.deepEqual(Array.from(parsed.references), [], query);
      assert.deepEqual({ min: parsed.budget.min, max: parsed.budget.max },
        { min: 12750000, max: 17250000 }, query);
    });
  const refPriceOnly = missing.api.rules.analyze('14060 가격 알려줘');
  assert.deepEqual(Array.from(refPriceOnly.references), ['14060']);
  assert.equal(refPriceOnly.budget, null);

  const blocked = runtime({ localConsent: false, remoteConsent: false });
  await blocked.api.track('cart_add', { brand: '롤렉스' });
  assert.equal(blocked.calls.length, 0, 'no personalization event may be written before consent');
  const blockedMessage = await blocked.api.handleUserMessage('롤렉스 추천해줘');
  assert.equal(blockedMessage.consentRequired, true);
  assert.equal(blocked.calls.length, 0, 'conversation/profile writes must also be zero before consent');

  const stale = runtime({ localConsent: true, remoteConsent: false });
  await stale.api.track('cart_add', { brand: '롤렉스' });
  await stale.api.trackRecommendationImpressions([{
    product: { id: '00000000-0000-4000-8000-000000000001', brand: '롤렉스' },
    request_id: 'stale-request', rank: 1
  }], 'cart');
  await stale.api._internals.flushBufferToDB();
  const staleMessage = await stale.api.handleUserMessage('롤렉스 추천해줘');
  assert.equal(staleMessage.consentRequired, true);
  assert.equal(stale.calls.length, 0, 'remote consent=false must override a stale local consent token');
  assert.equal(stale.store.has('bellore_ai_consent'), false, 'stale local consent token must be removed');

  const allowed = runtime({ localConsent: true, remoteConsent: true });
  await allowed.api.track('cart_add', { brand: '롤렉스' });
  const event = allowed.calls.find((call) => call.table === 'customer_events' && call.action === 'insert');
  const interest = allowed.calls.find((call) => call.table === 'customer_watch_interests' && call.action === 'insert');
  const profileUpdate = allowed.calls.find((call) => call.table === 'customer_ai_profiles' && call.action === 'update');
  assert.equal(event.payload.event_type, 'cart_add');
  assert.equal(interest.payload.interest_score, 25);
  assert.equal(profileUpdate.payload.buying_stage, 'high_intent');
  assert.equal(profileUpdate.payload.buy_probability, 68);

  await allowed.api.trackRecommendationImpressions([{
    product: { id: '00000000-0000-4000-8000-000000000001', brand: '롤렉스', model: '서브마리너' },
    request_id: 'request-1', rank: 1, score: 72,
    algorithm_version: 'bellore-reco-v2.0.0', variant: 'balanced_v1',
    candidate_sources: ['catalog', 'profile_brand'],
    breakdown: { score_kind: 'heuristic_action_proxy', features: { relevance: 0.8 } }
  }], 'cart');
  const impression = allowed.calls.filter((call) => call.table === 'customer_events' && call.action === 'insert')
    .find((call) => Array.isArray(call.payload) && call.payload[0].event_type === 'recommendation_impression');
  assert.equal(impression.payload[0].value.request_id, 'request-1');
  assert.equal(impression.payload[0].value.rank, 1);
  assert.equal(impression.payload[0].value.algorithm_version, 'bellore-reco-v2.0.0');

  const touched = allowed.api.rememberRecommendationTouch({
    product: { id: '00000000-0000-4000-8000-000000000001', brand: '롤렉스' },
    request_id: 'request-click-1', rank: 2, algorithm_version: 'bellore-reco-v2.0.0',
    variant: 'balanced_v1', experiment_id: null
  }, 'ai-advisor', 2);
  assert.equal(touched.request_id, 'request-click-1');
  await allowed.api.track('cart_add', {
    product_id: '00000000-0000-4000-8000-000000000001', brand: '롤렉스'
  });
  const attributedCart = allowed.calls.slice().reverse().find((call) =>
    call.table === 'customer_events' && call.action === 'insert' &&
    !Array.isArray(call.payload) && call.payload.event_type === 'cart_add');
  assert.equal(attributedCart.payload.value.recommendation.request_id, 'request-click-1',
    'downstream actions must carry the originating recommendation request');

  console.log('customer algorithm and consent invariants: ok');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
