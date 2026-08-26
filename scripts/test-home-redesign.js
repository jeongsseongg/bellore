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
assert.match(data, /export const FEATURED_MAX = 30;/);
assert.doesNotMatch(data, /FEATURED_BADGES/);
assert.doesNotMatch(banners, /feat-tag|FEATURED_BADGES/);
assert.doesNotMatch(bannersCss, /\.feat-tag/);
assert.match(data, /export const HERO_CAMPAIGNS = \[/);
assert.equal((data.match(/image: 'assets\/banners\/hero-\d{2}\.webp'/g) || []).length, 10, '10 hero campaign images');
assert.equal((data.match(/action: '[^']+'/g) || []).length, 10, '10 hero campaign actions');
assert.match(data, /filter: \{ packsAny: \['풀세트'\], gradeMin: 9 \}/);
assert.match(data, /filter: \{ saleOnly: true, sort: 'discount' \}/);
assert.match(banners, /collection\.filter\(campaign\.filter\)/);
assert.match(index, /class="hero-slide hero hero-new hero-default" href="#collection"/);
assert.doesNotMatch(index, /id="heroManageBtn"/);
const topCategoryNav = index.match(/<nav class="cat-bar"[\s\S]*?<\/nav>/)?.[0] || '';
assert.equal((topCategoryNav.match(/class="cat-chip"/g) || []).length, 1, 'top category navigation keeps one item');
assert.match(topCategoryNav, />TIME SALE<\/a>/);
assert.doesNotMatch(topCategoryNav, /UPDATE|미사용신품|오늘의시계/);
assert.match(legacy, /window\.BELLORE_HOME_CAMPAIGNS \|\| \[\]/);
assert.match(legacy, /dataset\.heroAction = b\.action/);
assert.match(legacy, /hero-campaign-copy/);
assert.match(bannersCss, /\.hero-campaign-copy \{/);
assert.match(bannersCss, /\.hero-slide-db\.is-campaign \{[\s\S]*aspect-ratio: 430 \/ 189/, 'hero uses the source banner ratio without letterboxing');
assert.match(bannersCss, /\.hero-slide-db\.is-campaign \.hero-slide-blur \{ display: none; \}/, 'hero removes the cinema-style backdrop bars');
assert.match(bannersCss, /\.hero-campaign-copy \{[\s\S]*background: none/, 'hero copy has no text box');
assert.match(legacy, /class="hero-count">' \+ \(index \+ 1\) \+ '\/' \+ n/);
assert.match(legacy, /class="hero-count-nav hero-count-prev"/);
assert.match(legacy, /class="hero-count-nav hero-count-next"/);
assert.doesNotMatch(legacy, /className = 'hero-dot'/);
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
const categoryBlock = data.slice(data.indexOf('export const CATEGORY_BANNERS'), data.indexOf('export const BUYIN_COPY'));
assert.equal((categoryBlock.match(/filter: \{/g) || []).length, 10, 'every category banner has an explicit filter contract');
for (const rule of ['brandsAny', 'termsAny', 'maxExclusive', "audience: 'women'", 'vintage: true', "packsAny: ['풀세트']"]) assert.ok(data.includes(rule), `banner filter rule: ${rule}`);
assert.match(legacy, /card\.dataset\.vintage = \/빈티지\//);
assert.match(listingDisplay, /featuredMetaText/);
assert.match(listingDisplay, /listing\.pack[\s\S]*'단품'/);
assert.match(collection, /BELLORE_applyColFilters/);
assert.doesNotMatch(banners, /bn-num|counterMarkup/);
assert.match(bannersCss, /\.bn-buy \{[\s\S]*aspect-ratio: 430 \/ 125/, 'buy-in banner keeps the compact home ratio');
assert.match(bannersCss, /\.bn-buy \.bn-fx \{ display: none; \}/, 'buy-in copy does not cover the artwork with an overlay');
assert.match(banners, /while \(next === backgroundIndex && BUYIN_BACKGROUNDS\.length > 1\)/, 'buy-in photo changes independently without an immediate repeat');
assert.match(bannersCss, /\.feat-card \{[\s\S]*aspect-ratio: 430 \/ 189/, 'featured banner is 1.4x taller');
assert.equal((banners.match(/assets\/banners\/product-stage-\d{2}\.webp/g) || []).length, 6, '6 product stages');
assert.equal((banners.match(/assets\/banners\/buyin-\d{2}\.webp/g) || []).length, 6, '6 buy-in backgrounds');
assert.match(rowsCss, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
assert.match(rowsCss, /\.hrow-card \{ flex-basis: 180px; \}/);
assert.match(rowsCss, /\.hrow-block \{ margin: 34px 0; \}/);
assert.match(rowsCss, /\.hrow-card:first-child \{ margin-left: 20px; \}/);
assert.match(rowsCss, /\.hrow-card:focus-visible \{[\s\S]*outline: none;[\s\S]*\.hrow-card:focus-visible \.hrow-name \{[\s\S]*text-decoration: underline;/, 'card focus uses the product name instead of drawing a clipped browser box');
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
  assert.ok(fs.existsSync(path.join(root, `assets/banners/hero-${String(i).padStart(2, '0')}.webp`)), `hero image ${i}`);
}
for (let i = 1; i <= 6; i += 1) {
  assert.ok(fs.existsSync(path.join(root, `assets/banners/product-stage-${String(i).padStart(2, '0')}.webp`)), `product stage ${i}`);
  assert.ok(fs.existsSync(path.join(root, `assets/banners/buyin-${String(i).padStart(2, '0')}.webp`)), `buy-in image ${i}`);
}

console.log('home redesign checks: hero, product and buy-in campaigns passed');
