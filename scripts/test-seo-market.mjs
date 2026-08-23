import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  fetchPublicListings,
  prepareMarketListings,
} from '../tools/seo/market-data.mjs';
import { LEGACY_DEMO_PRODUCTS } from '../tools/seo/market-policy.mjs';
import { renderMarketIndex, renderProductPage } from '../tools/seo/market-render.mjs';
import { renderSitemap, writeMarketArtifacts } from '../tools/seo/market-write.mjs';

let passed = 0;

async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}: ${error.stack || error.message}`);
    process.exitCode = 1;
  }
}

function listing(index = 1, overrides = {}) {
  const number = `TST-N${index}-1`;
  const base = `https://bellore.co.kr/assets/products/test-${index}`;
  return {
    id: `listing-${index}`,
    product_no: number,
    title: '테스트브랜드',
    description: `테스트모델 ${index}`,
    price: 1_100_000 + index,
    sale_price: null,
    category: '벨로르판매',
    status: 'on_sale',
    condition: '중고 8/10 · 상급',
    condition_notes: '착용 이력이 있는 중고 상품입니다.\n8/10 · 상급\n전체적으로 깔끔하게 관리된 컨디션입니다.',
    has_warranty: null,
    has_diamond: false,
    image_url: `${base}/front.webp`,
    image_urls: [`${base}/front.webp`, `${base}/01.webp`, `${base}/02.webp`],
    reference_no: null,
    size_mm: 41,
    stamping: null,
    purchase_year: null,
    set_grade: '구성품 정보없음 / 등급 정보없음',
    accessories: null,
    pack: '구성품 정보없음',
    components: null,
    movement: '오토매틱',
    case_spec: null,
    band_spec: null,
    dial_color: null,
    material: '스테인리스 스틸',
    misu: null,
    special_note: null,
    detail_desc: '화면에 노출하면 안 되는 일반 상품 설명',
    sale_method: '벨로르가 직접 판매하고 결제까지 책임집니다',
    ship_info: '결제 후 2~4일 이내 발송',
    tags: ['테스트브랜드'],
    sale_started_at: '2026-08-20T00:00:00Z',
    created_at: '2026-08-20T00:00:00Z',
    updated_at: '2026-08-21T00:00:00Z',
    ...overrides,
  };
}

function demoRows() {
  return LEGACY_DEMO_PRODUCTS.map(([id, product_no]) => ({ id, product_no, status: 'on_sale' }));
}

function structuredData(html) {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map((match) => JSON.parse(match[1]));
}

function response({ ok = true, status = 200, rows = [], total = rows.length, text = '' } = {}) {
  return {
    ok,
    status,
    headers: { get: (name) => name.toLowerCase() === 'content-range' ? `0-${Math.max(0, rows.length - 1)}/${total}` : null },
    json: async () => rows,
    text: async () => text,
  };
}

await test('166 source rows publish exactly 158 and exclude only the 8 immutable demos', () => {
  const rows = [...Array.from({ length: 158 }, (_, index) => listing(index + 1)), ...demoRows()];
  const result = prepareMarketListings(rows);
  assert.deepEqual(result.metrics, { source: 166, excludedLegacyDemos: 8, hidden: 0, published: 158 });
  assert.equal(renderSitemap(result.products, '2026-08-24').count, 160);
});

await test('future real customer consignment is included instead of category-filtered', () => {
  const row = listing(1, { category: '고객판매' });
  const result = prepareMarketListings([row], { minProducts: 1 });
  assert.equal(result.products.length, 1);
  assert.equal(result.metrics.excludedLegacyDemos, 0);
});

await test('demo identifiers fail closed when an ID or product number is reused', () => {
  const [demoId, demoNumber] = LEGACY_DEMO_PRODUCTS[0];
  assert.throws(
    () => prepareMarketListings([listing(1, { id: demoId, product_no: 'TST-N1-1' })], { minProducts: 1 }),
    /레거시 데모 ID의 상품번호가 변경됨/,
  );
  assert.throws(
    () => prepareMarketListings([listing(1, { id: 'new-owner-row', product_no: demoNumber })], { minProducts: 1 }),
    /레거시 데모 상품번호가 다른 상품에 재사용됨/,
  );
});

await test('duplicate product numbers, unknown statuses and partial drops stop the build', () => {
  assert.throws(
    () => prepareMarketListings([listing(1), listing(2, { product_no: 'tst-n1-1' })], { minProducts: 1 }),
    /중복 상품번호/,
  );
  assert.throws(
    () => prepareMarketListings([listing(1, { status: 'reserved' })], { minProducts: 1 }),
    /지원하지 않는 상품 상태/,
  );
  assert.throws(
    () => prepareMarketListings([listing(1)], { minProducts: 2 }),
    /공개 상품 급감/,
  );
});

await test('supported sold status maps to OutOfStock and hidden listings are omitted', () => {
  const rows = [listing(1, { status: 'sold' }), listing(2, { status: 'hidden' })];
  const result = prepareMarketListings(rows, { minProducts: 1 });
  assert.equal(result.metrics.hidden, 1);
  assert.equal(result.products[0].availability, 'https://schema.org/OutOfStock');
});

await test('missing or ambiguous image sets stop the build', () => {
  const oneImage = listing(1, { image_urls: ['https://bellore.co.kr/front.webp'], image_url: 'https://bellore.co.kr/front.webp' });
  assert.throws(() => prepareMarketListings([oneImage], { minProducts: 1 }), /이미지가 2장 미만/);
  const mismatch = listing(2, { image_url: 'https://bellore.co.kr/other.webp' });
  assert.throws(() => prepareMarketListings([mismatch], { minProducts: 1 }), /대표 이미지와 image_urls 첫 이미지/);
});

await test('Supabase HTTP errors and partial Content-Range responses reject', async () => {
  const config = { url: 'https://example.supabase.co', key: 'public-test-key' };
  await assert.rejects(
    fetchPublicListings(config, { fetchImpl: async () => response({ ok: false, status: 503, text: 'unavailable' }) }),
    /Supabase listings 503/,
  );
  await assert.rejects(
    fetchPublicListings(config, { fetchImpl: async () => response({ rows: [listing(1)], total: 2 }) }),
    /부분 응답: 1\/2/,
  );
  const rows = await fetchPublicListings(config, { fetchImpl: async () => response({ rows: [listing(1)] }) });
  assert.equal(rows.length, 1);
});

await test('product page has unique metadata, Product/Offer/Breadcrumb and every image alt', () => {
  const row = listing(1, {
    condition_notes: '착용 이력이 있는 중고 상품입니다.\n8/10 · 상급\n평가 근거: 내부 검수 메모\n상품화 처리 기록',
  });
  const product = prepareMarketListings([row], { minProducts: 1 }).products[0];
  const html = renderProductPage(product);
  assert.match(html, /<title>테스트브랜드 테스트모델 1 TST-N1-1 \| 벨로르<\/title>/);
  assert.match(html, /<link rel="canonical" href="https:\/\/bellore\.co\.kr\/market\/tst-n1-1\/">/);
  assert.match(html, /<meta property="og:url" content="https:\/\/bellore\.co\.kr\/market\/tst-n1-1\/">/);
  assert.doesNotMatch(html, /화면에 노출하면 안 되는 일반 상품 설명|추가 정보|평가 근거|상품화 처리/);
  const images = [...html.matchAll(/<img\b[^>]*>/g)].map((match) => match[0]);
  assert.equal(images.length, product.photos.length);
  assert(images.every((tag) => /\balt="[^"]+"/.test(tag)));
  const detailMarkup = html.match(/<div class="detail-gallery">([\s\S]*?)<\/div>/)?.[1] || '';
  assert(!detailMarkup.includes(product.heroImage));
  assert.equal((detailMarkup.match(/<img\b/g) || []).length, product.photos.length - 1);
  const data = structuredData(html);
  const schemaProduct = data.find((item) => item['@type'] === 'Product');
  assert.deepEqual(schemaProduct.image, product.photos);
  assert.equal(schemaProduct.offers.seller.name, '벨로르 BELLORE');
  assert.equal(schemaProduct.offers.availability, 'https://schema.org/InStock');
  assert(data.some((item) => item['@type'] === 'BreadcrumbList'));
  assert.match(html, />정보없음</);
});

await test('market hub uses crawlable product anchors and non-empty image alt text', () => {
  const products = prepareMarketListings([listing(1), listing(2)], { minProducts: 1 }).products;
  const html = renderMarketIndex(products);
  for (const product of products) {
    assert(html.includes(`href="${product.canonicalPath}"`));
    assert(html.includes(`alt="${product.name} ${product.productNumber} 정면 이미지"`));
  }
  assert.equal(structuredData(html)[0].mainEntity.numberOfItems, 2);
});

await test('artifact publish removes stale market pages and emits no merchant feed', async () => {
  const scratch = await mkdtemp(join(tmpdir(), 'bellore-seo-market-'));
  const out = join(scratch, '_site');
  try {
    await mkdir(join(out, 'market', 'stale-product'), { recursive: true });
    await writeFile(join(out, 'market', 'stale-product', 'index.html'), 'stale');
    await writeFile(join(out, 'sitemap.xml'), 'old sitemap');
    const products = prepareMarketListings([listing(1)], { minProducts: 1 }).products;
    const result = await writeMarketArtifacts(out, products, { buildDate: '2026-08-24' });
    assert.equal(result.productPages, 1);
    assert.equal(result.sitemapUrls, 3);
    await assert.rejects(readFile(join(out, 'market', 'stale-product', 'index.html')));
    assert.match(await readFile(join(out, 'market', 'index.html'), 'utf8'), /1개 상품/);
    assert.match(await readFile(join(out, 'market', 'tst-n1-1', 'index.html'), 'utf8'), /TST-N1-1/);
    assert.match(await readFile(join(out, 'sitemap.xml'), 'utf8'), /<loc>https:\/\/bellore\.co\.kr\/market\/tst-n1-1\/<\/loc>/);
    await assert.rejects(readFile(join(out, 'feed', 'google-merchant.xml')));
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});

if (!process.exitCode) console.log(`SEO market tests: ${passed}/10 passed`);
