const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const index = read('index.html');
const data = read('app/features/home-banners/home-banner-data.js');
const banners = read('app/features/home-banners/home-banners.js');
const bannersCss = read('app/features/home-banners/home-banners.css');
const rows = read('app/features/home-rows/home-rows.js');
const rowAdmin = read('app/features/home-rows/home-row-admin.js');
const rowsCss = read('app/features/home-rows/home-rows.css');
const merchandising = read('app/features/home-merchandising/home-merchandising.js');
const listingDisplay = read('app/core/listing-display.js');
const collection = read('app/legacy/legacy-collection.js');
const legacy = read('script.js');
const buildPages = read('tools/build-pages.mjs');

const order = ['rowSaleBlock', 'rowDropBlock', 'catBannerBlock', 'rowNewBlock', 'buyBannerBlock', 'homeOnSale'];
order.reduce((previous, id) => {
  const current = index.indexOf(`id="${id}"`);
  assert.ok(current > previous, `home section order: ${id}`);
  return current;
}, -1);

assert.equal((data.match(/image: 'assets\/banners\/category-\d{2}\.webp'/g) || []).length, 10, '10 category images');
assert.match(data, /export const FEATURED_MAX = 10;/);
assert.doesNotMatch(data, /FEATURED_BADGES/);
assert.doesNotMatch(banners, /feat-tag|FEATURED_BADGES/);
assert.doesNotMatch(bannersCss, /\.feat-tag/);
assert.match(data, /export const HERO_COPY = \[/);
assert.equal((data.match(/title: \['검수가 끝난,', '미사용급 풀세트'\]/g) || []).length, 1, 'one fixed hero slogan');
assert.match(data, /9점 이상 모든 구성품을 갖춘 시계/);
assert.match(data, /export const HERO_FILTER = \{ packsAny: \['풀세트'\], gradeMin: 9 \};/);
assert.match(banners, /collection\.filter\(HERO_FILTER\)/);
assert.match(index, /class="hero-slide hero hero-new hero-default" href="#collection"/);
assert.doesNotMatch(index, /id="heroManageBtn"/);
const topCategoryNav = index.match(/<nav class="cat-bar"[\s\S]*?<\/nav>/)?.[0] || '';
assert.equal((topCategoryNav.match(/class="cat-chip"/g) || []).length, 1, 'top category navigation keeps one item');
assert.match(topCategoryNav, />TIME SALE<\/a>/);
assert.doesNotMatch(topCategoryNav, /UPDATE|미사용신품|오늘의시계/);
assert.match(legacy, /window\.belloreSetBanners = function \(list\) \{ list = \[\];/);
for (const text of ['매일을 함께할 클래식', '1,000만원 이상의 명작', '깊이에서도 흔들리지 않는', '500만원 미만 컬렉션', '여성 명품시계', '1,000만원 미만 컬렉션', '예물 시계', '빈티지 컬렉션', '풀세트 컬렉션', '300만원 미만 컬렉션']) {
  assert.ok(data.includes(text), `category copy: ${text}`);
}
const buyinBlock = data.slice(data.indexOf('export const BUYIN_COPY'), data.indexOf('export const FEATURED_MAX'));
assert.equal((buyinBlock.match(/title: \['[^']+\?'\]/g) || []).length, 15, '15 buy-in questions');
assert.doesNotMatch(data, /됩니다|그렇습니다|보여드립니다|늦지 않습니다/);
assert.match(banners, /const ROTATION_MS = 15000;/);
assert.match(banners, /const FEATURED_AFTER_CARD = 6;/);
assert.match(banners, /shuffled\(listings\)\.slice\(0, FEATURED_MAX\)/);
assert.match(banners, /collection\.filter\(banner\.filter\)/);
assert.equal((data.match(/filter: \{/g) || []).length, 10, 'every category banner has an explicit filter contract');
for (const rule of ['brandsAny', 'termsAny', 'maxExclusive', "audience: 'women'", 'vintage: true', "packsAny: ['풀세트']"]) assert.ok(data.includes(rule), `banner filter rule: ${rule}`);
assert.match(legacy, /card\.dataset\.vintage = \/빈티지\//);
assert.match(listingDisplay, /featuredMetaText/);
assert.match(listingDisplay, /listing\.pack[\s\S]*'단품'/);
assert.match(collection, /BELLORE_applyColFilters/);
assert.doesNotMatch(banners, /bn-num|counterMarkup/);
assert.equal((bannersCss.match(/aspect-ratio: 430 \/ 125/g) || []).length, 2, 'category and buy-in banners are 1.2x taller');
assert.match(bannersCss, /\.feat-card \{[\s\S]*aspect-ratio: 430 \/ 189/, 'featured banner is 1.4x taller');
assert.match(rowsCss, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
assert.match(rowsCss, /\.hrow-card \{ flex-basis: 180px; \}/);
assert.match(rowsCss, /\.hrow-block \{ margin: 34px 0; \}/);
assert.match(rowsCss, /\.hrow-card:first-child \{ margin-left: 20px; \}/);
assert.match(rowsCss, /\.hrow-view-all:last-child \{ margin-right: 20px; \}/);
assert.match(rows, /mount: 'rowDropBlock', key: 'home_row_drop', title: 'TIME SALE'/);
assert.match(rows, /class="hrow-meta"/);
assert.match(rows, /listingPresentation/);
assert.match(rows, /hrow-reference/);
assert.match(rows, /featureMovement/);
assert.match(rowAdmin, /backend\.getSiteContent\(row\.config\.key\)/);
assert.match(rowAdmin, /backend\.saveSiteContent\(activeRow\.config\.key/);
assert.match(rowAdmin, /row\.settingsButton\.hidden = !isAdmin/);
assert.match(rowAdmin, /노출 상품 직접 지정/);
assert.match(rowAdmin, /JSON\.stringify\(\{ productIds: selectedIds \}\)/);
assert.match(rows, /manualFirst\(/);
assert.match(rows, /weeklySpecialIds\(\)/);
assert.match(rows, /<span>상품 설정<\/span>/);
assert.match(rowsCss, /\.hrow-settings\[hidden\] \{ display: none; \}/);
assert.match(buildPages, /'app\/features\/home-rows\/home-row-admin\.js'/);
assert.match(rows, /class="hrow-view-all"/);
assert.doesNotMatch(rows, /hrow-more/);
assert.doesNotMatch(index, /hrow-more/);
assert.match(legacy, /rows\.slice\(0, 12\)/);
assert.match(merchandising, /BelloreRecommendationEngine/);
assert.match(merchandising, /personalized:\s*false/);
assert.match(merchandising, /surface:\s*'weekly_special'/);
assert.match(merchandising, /surface:\s*'recommended_listings'/);

for (let i = 1; i <= 10; i += 1) {
  const file = `assets/banners/category-${String(i).padStart(2, '0')}.webp`;
  assert.ok(fs.existsSync(path.join(root, file)), file);
}

console.log('home redesign checks: 39 passed');
