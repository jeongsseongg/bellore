#!/usr/bin/env node
'use strict';

const assert = require('assert');
const path = require('path');
const engine = require(path.join(__dirname, '..', 'app', 'legacy', 'recommendation-engine.js'));

const NOW = '2026-08-22T00:00:00.000Z';

function product(id, brand, model, price, extra) {
  return Object.assign({
    id,
    brand,
    model,
    price,
    status: 'on_sale',
    condition: '중고 8/10',
    size_mm: 40,
    dial_color: '블랙',
    material: '스테인리스 스틸',
    pack: '일부 구성',
    photos: [`https://example.test/${id}.webp`],
    created_at: '2026-07-01T00:00:00.000Z'
  }, extra || {});
}

const catalog = [
  product('r1', '롤렉스', '서브마리너 논데이트', 12000000, { reference_no: '124060' }),
  product('r2', '롤렉스', 'GMT 마스터 II', 16500000, { reference_no: '126710BLRO' }),
  product('r3', '롤렉스', '데이저스트 41', 13800000, { reference_no: '126334' }),
  product('r4', '롤렉스', '데이토나', 43000000, { reference_no: '126500LN' }),
  product('o1', '오메가', '스피드마스터 문워치', 8500000, { reference_no: '310.30' }),
  product('o2', '오메가', '씨마스터 다이버 300M', 7100000, { reference_no: '210.30' }),
  product('c1', '까르띠에', '산토스 미디움', 9200000, { reference_no: 'WSSA0029' }),
  product('t1', '튜더', '블랙베이 58', 4800000, { reference_no: 'M79030N' }),
  product('b1', '브라이틀링', '슈퍼오션', 5200000, { reference_no: 'A17366' }),
  product('p1', '파텍필립', '아쿠아넛', 98000000, { reference_no: '5167A' }),
  product('sold', '롤렉스', '판매완료', 10000000, { status: 'sold' }),
  product('hidden', '오메가', '숨김', 7000000, { status: 'hidden' })
];

const profile = {
  preferred_brands: ['롤렉스'],
  preferred_models: ['서브마리너'],
  preferred_references: ['124060'],
  budget_min: 9000000,
  budget_max: 14000000,
  preferred_color: '블랙',
  buy_probability: 68
};

function rank(extra) {
  return engine.rank(Object.assign({ products: catalog, profile, limit: 6, now: NOW }, extra || {}));
}

// 1) Eligibility is a hard gate and is audited separately from ranking.
const eligible = rank({ excludeIds: ['c1'] });
assert(!eligible.items.some((x) => ['sold', 'hidden', 'c1'].includes(x.product.id)));
assert.strictEqual(eligible.audit.filtered.unavailable, 2);
assert.strictEqual(eligible.audit.filtered.excluded, 1);

// 2) Exact reference + budget match should outrank looser brand matches.
const exact = rank();
assert.strictEqual(exact.items[0].product.id, 'r1');
assert(exact.items[0].reason.includes('레퍼런스'));

// 3) Explicit query constraints never silently fall back to another brand.
const noFallback = rank({ hardConstraints: { brands: ['바쉐론 콘스탄틴'] } });
assert.strictEqual(noFallback.items.length, 0);
assert.strictEqual(noFallback.audit.filtered.query_brand, 10);

// 4) Explicit exclusion language is a hard gate, not a weak negative score.
const explicitExclusion = engine.rank({
  products: catalog,
  personalized: false,
  hardConstraints: { exclude_brands: ['롤렉스'] },
  limit: 10,
  now: NOW
});
assert(explicitExclusion.items.every((item) => item.product.brand !== '롤렉스'));
assert.strictEqual(explicitExclusion.audit.filtered.query_excluded_brand, 4);

// 5) A strong explicit negative signal downranks the same product.
const positiveOnly = rank({
  events: [{ event_type: 'cart_add', product_id: 'r1', created_at: '2026-08-21T23:00:00Z' }]
});
const withNegative = rank({
  events: [
    { event_type: 'cart_add', product_id: 'r1', created_at: '2026-08-21T23:00:00Z' },
    { event_type: 'recommendation_dismiss', product_id: 'r1', created_at: '2026-08-21T23:30:00Z' }
  ]
});
const posScore = positiveOnly.items.find((x) => x.product.id === 'r1').score;
const negScore = withNegative.items.find((x) => x.product.id === 'r1').score;
assert(negScore < posScore, `${negScore} should be lower than ${posScore}`);

// 6) Wishlist/cart are current states: the latest add/remove wins both ways.
function scoreForR1(events) {
  return rank({ events, limit: 10 }).items.find((x) => x.product.id === 'r1').base_score;
}
const recentWishAdd = { event_type: 'wishlist_add', product_id: 'r1', created_at: '2026-08-21T23:00:00Z' };
const oldWishRemove = { event_type: 'wishlist_remove', product_id: 'r1', created_at: '2026-08-20T00:00:00Z' };
const recentWishRemove = { event_type: 'wishlist_remove', product_id: 'r1', created_at: '2026-08-21T23:00:00Z' };
const oldWishAdd = { event_type: 'wishlist_add', product_id: 'r1', created_at: '2026-08-20T00:00:00Z' };
assert.strictEqual(scoreForR1([oldWishRemove, recentWishAdd]), scoreForR1([recentWishAdd]));
assert.strictEqual(scoreForR1([oldWishAdd, recentWishRemove]), scoreForR1([recentWishRemove]));
const recentCartAdd = { event_type: 'cart_add', product_id: 'r1', created_at: '2026-08-21T23:00:00Z' };
const oldCartRemove = { event_type: 'cart_remove', product_id: 'r1', created_at: '2026-08-20T00:00:00Z' };
const recentCartRemove = { event_type: 'cart_remove', product_id: 'r1', created_at: '2026-08-21T23:00:00Z' };
const oldCartAdd = { event_type: 'cart_add', product_id: 'r1', created_at: '2026-08-20T00:00:00Z' };
assert.strictEqual(scoreForR1([oldCartRemove, recentCartAdd]), scoreForR1([recentCartAdd]));
assert.strictEqual(scoreForR1([oldCartAdd, recentCartRemove]), scoreForR1([recentCartRemove]));
const otherRolexWishRemove = {
  event_type: 'wishlist_remove', product_id: 'r2', brand: '롤렉스',
  created_at: '2026-08-21T23:30:00Z'
};
assert.strictEqual(
  scoreForR1([recentWishAdd, otherRolexWishRemove]),
  scoreForR1([recentWishAdd]),
);
const otherRolexCartRemove = {
  event_type: 'cart_remove', product_id: 'r2', brand: '롤렉스',
  created_at: '2026-08-21T23:30:00Z'
};
assert.strictEqual(
  scoreForR1([recentCartAdd, otherRolexCartRemove]),
  scoreForR1([recentCartAdd]),
);

// 7) Repeated identical views are saturated by action type, not added forever.
const oneView = rank({
  events: [{ event_type: 'product_view', product_id: 'r1', created_at: '2026-08-21T23:00:00Z' }]
});
const repeatedViews = rank({
  events: Array.from({ length: 40 }, () => ({
    event_type: 'product_view', product_id: 'r1', created_at: '2026-08-21T23:00:00Z'
  }))
});
assert.strictEqual(
  oneView.items.find((x) => x.product.id === 'r1').base_score,
  repeatedViews.items.find((x) => x.product.id === 'r1').base_score
);

// 7) Time decay makes a recent cart signal stronger than an old one.
const recentCart = rank({ events: [{ event_type: 'cart_add', product_id: 'o1', created_at: '2026-08-21T00:00:00Z' }] });
const oldCart = rank({ events: [{ event_type: 'cart_add', product_id: 'o1', created_at: '2025-08-21T00:00:00Z' }] });
assert(
  recentCart.items.find((x) => x.product.id === 'o1').base_score >
  oldCart.items.find((x) => x.product.id === 'o1').base_score
);

// 8) A completed unique-stock purchase closes the exact product/reference loop.
const afterPurchase = rank({
  events: [{
    event_type: 'purchase_complete', product_id: 'r1', reference_number: '124060',
    created_at: '2026-08-20T00:00:00Z'
  }]
});
assert(!afterPurchase.items.some((x) => x.product.id === 'r1'));
assert.strictEqual(afterPurchase.audit.filtered.purchased_cooldown, 1);
assert(afterPurchase.items.every((x) => x.breakdown.features.intent_index <= 0.10));

// 9) The top list is diverse unless the customer explicitly constrained a brand.
const cold = engine.rank({ products: catalog, limit: 6, now: NOW, personalized: false });
const coldBrandCounts = cold.items.reduce((out, item) => {
  out[item.product.brand] = (out[item.product.brand] || 0) + 1;
  return out;
}, {});
assert(Math.max(...Object.values(coldBrandCounts)) <= 2);
assert(Object.keys(coldBrandCounts).length >= 3);

const rolexOnly = rank({ hardConstraints: { brands: ['롤렉스'] }, limit: 4 });
assert(rolexOnly.items.length >= 3);
assert(rolexOnly.items.every((x) => x.product.brand === '롤렉스'));

// 10) Output is deterministic; there is no request-time random jitter.
const baselineOrder = rank().items.map((x) => x.product.id).join(',');
for (let i = 0; i < 25; i += 1) {
  assert.strictEqual(rank().items.map((x) => x.product.id).join(','), baselineOrder);
}

// 11) Scores are bounded and explicitly labelled as proxies, not probabilities.
exact.items.forEach((item) => {
  assert(item.score >= 0 && item.score <= 100);
  assert.strictEqual(item.breakdown.score_kind, 'heuristic_action_proxy');
  Object.values(item.breakdown.action_proxies).forEach((value) => assert(value >= 0 && value <= 1));
  assert(Array.isArray(item.candidate_sources) && item.candidate_sources.length > 0);
  assert(item.reason.length > 0);
});

// 12) Inventory product numbers are not mistaken for manufacturer references.
const normalized = engine.normalizeProduct({
  id: 'inventory-only', brand: '롤렉스', model: '테스트', product_no: 'ROL-N2286-1', price: 1
});
assert.strictEqual(normalized.reference_number, '');
assert.strictEqual(normalized.product_no, 'ROL-N2286-1');

const stockNumberResult = engine.rank({
  products: catalog.concat([normalized]),
  personalized: false,
  hardConstraints: { product_numbers: ['rol-n2286-1'] },
  limit: 3,
  now: NOW,
  tieSeed: 'stock-number'
});
assert.deepStrictEqual(stockNumberResult.items.map((item) => item.product.id), ['inventory-only']);
assert.strictEqual(stockNumberResult.audit.filtered.query_product_number,
  catalog.filter((item) => !['sold', 'hidden'].includes(item.status)).length);

const exactReferenceGate = engine.rank({
  products: [
    product('ref-exact', '롤렉스', '데이트저스트', 10000000, { reference_no: '16233' }),
    product('ref-substring', '롤렉스', '데이트저스트', 10000000, { reference_no: '116233' }),
    product('ref-punct', '오메가', '씨마스터', 10000000, { reference_no: '210.30' })
  ],
  personalized: false,
  hardConstraints: { references: ['16233'] },
  now: NOW,
  limit: 3
});
assert.deepStrictEqual(exactReferenceGate.items.map((item) => item.product.id), ['ref-exact']);
const punctReferenceGate = engine.rank({
  products: [product('ref-punct', '오메가', '씨마스터', 10000000, { reference_no: '210.30' })],
  personalized: false,
  hardConstraints: { references: ['21030'] },
  now: NOW,
  limit: 1
});
assert.deepStrictEqual(punctReferenceGate.items.map((item) => item.product.id), ['ref-punct']);
const categoricalReference = engine.rank({
  products: [product('ref-substring', '롤렉스', '데이트저스트', 10000000, { reference_no: '116233' })],
  profile: { preferred_references: ['16233'] },
  personalized: true,
  now: NOW,
  limit: 1
}).items[0];
assert.strictEqual(categoricalReference.breakdown.features.reference_match, 0);
assert(!categoricalReference.reason.includes('레퍼런스'));

// Brand is categorical: Seiko must not include Grand Seiko (or vice versa).
const exactBrandGate = engine.rank({
  products: [
    product('seiko', '세이코', '프레사지', 1000000),
    product('grand-seiko', '그랜드세이코', '스프링드라이브', 8000000)
  ],
  hardConstraints: { brands: ['세이코'] },
  personalized: false,
  limit: 5,
  now: NOW
});
assert.deepStrictEqual(exactBrandGate.items.map((item) => item.product.id), ['seiko']);
assert.strictEqual(exactBrandGate.audit.filtered.query_brand, 1);

const inventoryModelAlias = engine.rank({
  products: [
    product('datejust', '롤렉스', '데이저스트 1601 금통', 12000000),
    product('cellini', '롤렉스', '셀리니 화이트골드', 9000000)
  ],
  hardConstraints: { brands: ['롤렉스'], models: ['데이저스트'] },
  personalized: false,
  limit: 5,
  now: NOW
});
assert.deepStrictEqual(inventoryModelAlias.items.map((item) => item.product.id), ['datejust']);

// 13) Recommendation price matches the storefront/payment 72-hour sale rule.
const activeSale = engine.normalizeProduct(product('sale-active', '오메가', '세일', 10000000, {
  sale_price: 8000000, tags: ['sale'], sale_started_at: '2026-08-21T00:00:00Z'
}), NOW);
assert.strictEqual(activeSale.price, 8000000);
assert.strictEqual(activeSale.prev_price, 10000000);
assert.strictEqual(activeSale.sale_active, true);
[
  { sale_price: 8000000, tags: [], sale_started_at: '2026-08-21T00:00:00Z' },
  { sale_price: 8000000, tags: ['sale'], sale_started_at: '2026-08-18T00:00:00Z' },
  { sale_price: 12000000, tags: ['sale'], sale_started_at: '2026-08-21T00:00:00Z' }
].forEach((extra) => {
  const normalizedPrice = engine.normalizeProduct(
    product('sale-invalid', '오메가', '정가', 10000000, extra), NOW);
  assert.strictEqual(normalizedPrice.price, 10000000);
  assert.strictEqual(normalizedPrice.sale_active, false);
});

// 13) Sticky experiment assignment is deterministic and returns known variants.
const variants = [{ id: 'control', allocation: 0.5 }, { id: 'challenger', allocation: 0.5 }];
const assigned = engine.assignVariant('user-123', 'reco-v2-eval', variants);
assert.strictEqual(engine.assignVariant('user-123', 'reco-v2-eval', variants), assigned);
assert(['control', 'challenger'].includes(assigned));

// 14) Ranking never mutates the caller's catalog.
const before = JSON.stringify(catalog);
rank();
assert.strictEqual(JSON.stringify(catalog), before);

// 15) Non-personal mode ignores every cached profile field, including budget.
const nonPersonalWithProfile = engine.rank({
  products: catalog, profile, personalized: false, limit: 6, now: NOW, tieSeed: 'privacy-audit'
});
const nonPersonalWithoutProfile = engine.rank({
  products: catalog, personalized: false, limit: 6, now: NOW, tieSeed: 'privacy-audit'
});
assert.deepStrictEqual(
  nonPersonalWithProfile.items.map((item) => ({ id: item.product.id, score: item.score, reason: item.reason })),
  nonPersonalWithoutProfile.items.map((item) => ({ id: item.product.id, score: item.score, reason: item.reason }))
);
assert(nonPersonalWithProfile.items.every((item) => item.breakdown.personalized === false));
assert(nonPersonalWithProfile.items.every((item) => item.breakdown.features.brand_match === 0));
assert(nonPersonalWithProfile.items.every((item) => item.breakdown.features.budget_active === false));

console.log(JSON.stringify({
  ok: true,
  algorithmVersion: engine.VERSION,
  assertions: 46,
  deterministicRuns: 26,
  coldStartBrandsInTop6: Object.keys(coldBrandCounts).length,
  negativeSignalDelta: Number((posScore - negScore).toFixed(1)),
  filteredUnavailable: eligible.audit.filtered.unavailable
}, null, 2));
