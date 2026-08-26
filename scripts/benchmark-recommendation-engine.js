#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');
const engine = require(path.join(__dirname, '..', 'recommendation-engine.js'));

const dataDir = path.join(__dirname, '..', 'data');
const audit = JSON.parse(fs.readFileSync(path.join(dataDir, 'watch-catalog-audit-20260821-158.json'), 'utf8'));
const batchFiles = fs.readdirSync(dataDir).filter((name) => /^watch-batch-20260821(?:-\d+)?\.json$/.test(name));
const batchById = new Map();

for (const file of batchFiles) {
  const json = JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf8'));
  for (const row of json.products || []) batchById.set(row.sourceId, row);
}

const products = audit.products.map((base) => {
  const row = batchById.get(base.sourceId) || {};
  return {
    id: base.sourceId,
    brand: row.brand || base.brand,
    model: row.modelName || base.modelName,
    reference_no: row.referenceNo || '',
    product_no: row.productNo || base.productNo,
    price: row.sellingPrice || 0,
    status: 'on_sale',
    condition: row.condition || base.condition,
    size_mm: row.sizeMm || null,
    dial_color: row.dialColor || '',
    material: row.material || '',
    pack: row.pack || '',
    accessories: row.accessories || '',
    has_warranty: row.hasWarranty === true,
    photos: row.imageUrls || [],
    created_at: row.createdAt || base.createdAt
  };
});

const coverage = {
  products: products.length,
  batchDetailed: batchById.size,
  id: products.filter((p) => p.id).length,
  brand: products.filter((p) => p.brand).length,
  model: products.filter((p) => p.model).length,
  price: products.filter((p) => p.price > 0).length,
  photo: products.filter((p) => p.photos.length > 0).length,
  manufacturerReference: products.filter((p) => p.reference_no).length,
  condition: products.filter((p) => p.condition).length
};

const exactProduct = products.find((p) => p.reference_no && p.price > 0);
if (!exactProduct) throw new Error('Reference fixture not found in catalog artifacts.');

const profile = {
  preferred_brands: [exactProduct.brand],
  preferred_models: [exactProduct.model],
  preferred_references: [exactProduct.reference_no],
  budget_min: Math.floor(exactProduct.price * 0.85),
  budget_max: Math.ceil(exactProduct.price * 1.15),
  buy_probability: 68
};

const options = {
  products,
  profile,
  interests: [{
    brand: exactProduct.brand,
    model: exactProduct.model,
    reference_number: exactProduct.reference_no,
    interest_score: 55,
    last_wishlisted_at: '2026-08-21T00:00:00Z'
  }],
  events: [{
    event_type: 'cart_add',
    product_id: exactProduct.id,
    brand: exactProduct.brand,
    model: exactProduct.model,
    reference_number: exactProduct.reference_no,
    created_at: '2026-08-21T12:00:00Z'
  }],
  limit: 10,
  now: '2026-08-22T00:00:00Z',
  tieSeed: 'benchmark-user',
  variant: 'balanced_v1'
};

const initial = engine.rank(options);
const order = initial.items.map((item) => item.product.id).join(',');
let deterministic = true;
const times = [];
for (let i = 0; i < 250; i += 1) {
  const start = performance.now();
  const run = engine.rank(options);
  times.push(performance.now() - start);
  if (run.items.map((item) => item.product.id).join(',') !== order) deterministic = false;
}
times.sort((a, b) => a - b);

const cold = engine.rank({
  products,
  personalized: false,
  limit: 10,
  now: '2026-08-22T00:00:00Z',
  tieSeed: 'non-personal-catalog'
});
const coldBrands = cold.items.reduce((out, item) => {
  out[item.product.brand] = (out[item.product.brand] || 0) + 1;
  return out;
}, {});

const impossible = engine.rank({
  products,
  profile,
  hardConstraints: { brands: ['존재하지 않는 브랜드'] },
  limit: 10,
  now: '2026-08-22T00:00:00Z'
});

console.log(JSON.stringify({
  algorithmVersion: engine.VERSION,
  artifactCoverage: coverage,
  exactReferenceFixture: {
    id: exactProduct.id,
    brand: exactProduct.brand,
    reference: exactProduct.reference_no,
    rankedFirst: initial.items[0] && initial.items[0].product.id === exactProduct.id,
    score: initial.items[0] && initial.items[0].score
  },
  deterministicRuns: 251,
  deterministic,
  latencyMs: {
    median: Number(times[Math.floor(times.length * 0.5)].toFixed(3)),
    p95: Number(times[Math.floor(times.length * 0.95)].toFixed(3)),
    max: Number(times[times.length - 1].toFixed(3))
  },
  coldStartTop10: {
    distinctBrands: Object.keys(coldBrands).length,
    maxSameBrand: Math.max(...Object.values(coldBrands)),
    brands: coldBrands
  },
  impossibleQueryReturned: impossible.items.length,
  impossibleQueryFiltered: impossible.audit.filtered.query_brand || 0
}, null, 2));
