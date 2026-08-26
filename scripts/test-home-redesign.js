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
const legacy = read('script.js');
const buildPages = read('tools/build-pages.mjs');

const order = ['rowSaleBlock', 'rowDropBlock', 'catBannerBlock', 'rowNewBlock', 'buyBannerBlock', 'homeOnSale'];
order.reduce((previous, id) => {
  const current = index.indexOf(`id="${id}"`);
  assert.ok(current > previous, `home section order: ${id}`);
  return current;
}, -1);

assert.equal((data.match(/image: 'assets\/banners\/category-\d{2}\.webp'/g) || []).length, 10, '10 category images');
assert.match(data, /export const HERO_CAMPAIGNS = \[/, 'hero campaigns stay in the current release');
assert.equal((data.match(/image: 'assets\/banners\/hero-\d{2}\.webp'/g) || []).length, 8, 'iconic deletion leaves 8 hero images');
assert.doesNotMatch(data, /action: 'icons'/, 'deleted iconic campaign must not return');
assert.doesNotMatch(data, /hero-04\.webp/, 'deleted iconic artwork must not be referenced');
assert.match(banners, /collection\.openPreset\(\{ action: campaign\.action, label: campaign\.title \}\)/, 'hero click keeps the collection contract');
assert.match(bannersCss, /data-hero-action="vintage"[\s\S]*right: 5%;[\s\S]*width: 34%/, 'vintage copy stays in the right empty area');
assert.match(bannersCss, /data-hero-action="diver"[\s\S]*background-position: 68% center/, 'diver artwork shifts left to reveal the right watch');
assert.match(data, /export const FEATURED_MAX = 10;/);
assert.match(data, /export const FEATURED_BADGES = \[/);
assert.match(data, /export const HERO_COPY = \[/);
assert.doesNotMatch(data, /됩니다|그렇습니다|보여드립니다|늦지 않습니다/);
assert.match(banners, /const ROTATION_MS = 15000;/);
assert.match(banners, /const FEATURED_AFTER_CARD = 6;/);
assert.match(banners, /shuffled\(listings\)\.slice\(0, FEATURED_MAX\)/);
assert.doesNotMatch(banners, /bn-num|counterMarkup/);
assert.equal((bannersCss.match(/aspect-ratio: 430 \/ 125/g) || []).length, 2, 'category and buy-in banners are 1.2x taller');
assert.match(bannersCss, /\.feat-card \{[\s\S]*aspect-ratio: 430 \/ 189/, 'featured banner is 1.4x taller');
assert.match(banners, /function balancedTitleLines\(value\)/, 'featured title uses deterministic balanced lines');
assert.match(banners, /class="feat-showcase"/, 'featured product uses a separate showroom layer');
assert.match(banners, /class="feat-nm-line"/, 'featured title renders explicit semantic lines');
assert.match(bannersCss, /\.feat-ph \{[\s\S]*height: 78%[\s\S]*object-fit: contain/, 'featured cutout remains fully visible inside the stage');
assert.match(bannersCss, /\.feat-plinth \{/, 'featured cutout stands on a display plinth');
assert.match(bannersCss, /\.feat-gs \{[\s\S]*bottom: 11%/, 'featured cutout is grounded by a restrained shadow');
assert.match(rowsCss, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
assert.match(rowsCss, /\.hrow-card \{ flex-basis: 180px; \}/);
assert.match(rowsCss, /\.hrow-block \{ margin: 34px 0; \}/);
assert.match(rowsCss, /\.hrow-card:first-child \{ margin-left: 20px; \}/);
assert.match(rowsCss, /\.hrow-view-all:last-child \{ margin-right: 20px; \}/);
assert.match(rows, /mount: 'rowDropBlock', key: 'home_row_drop', title: 'TIME SALE'/);
assert.match(rows, /class="hrow-meta"/);
assert.match(rowAdmin, /브랜드 · 상태 · 구성품/);
assert.match(rowAdmin, /backend\.getSiteContent\(row\.config\.key\)/);
assert.match(rowAdmin, /backend\.saveSiteContent\(activeRow\.config\.key/);
assert.match(rowAdmin, /row\.settingsButton\.hidden = !isAdmin/);
assert.match(rowsCss, /\.hrow-settings\[hidden\] \{ display: none; \}/);
assert.match(buildPages, /'app\/features\/home-rows\/home-row-admin\.js'/);
assert.match(rows, /class="hrow-view-all"/);
assert.doesNotMatch(rows, /hrow-more/);
assert.doesNotMatch(index, /hrow-more/);
assert.match(legacy, /rows\.slice\(0, 12\)/);

for (let i = 1; i <= 10; i += 1) {
  const file = `assets/banners/category-${String(i).padStart(2, '0')}.webp`;
  assert.ok(fs.existsSync(path.join(root, file)), file);
}

console.log('home redesign checks: 31 passed');
