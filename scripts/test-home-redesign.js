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
const rowsCss = read('app/features/home-rows/home-rows.css');
const legacy = read('script.js');
const redesignCss = read('bellore-redesign.css');
const collection = read('app/legacy/legacy-collection.js');

const order = ['rowSaleBlock', 'rowDropBlock', 'catBannerBlock', 'rowNewBlock', 'buyBannerBlock', 'homeOnSale'];
order.reduce((previous, id) => {
  const current = index.indexOf(`id="${id}"`);
  assert.ok(current > previous, `home section order: ${id}`);
  return current;
}, -1);

assert.equal((data.match(/image: 'assets\/banners\/category-\d{2}\.webp'/g) || []).length, 10, '10 category images');
assert.equal((data.match(/image: 'assets\/banners\/hero-\d{2}\.webp'/g) || []).length, 10, '10 hero images');
assert.equal((data.match(/action: '(?:fullset|wedding|vintage|icons|newest|highend|sale|diver|women|santos)'/g) || []).length, 10, '10 hero actions');
assert.match(data, /export const FEATURED_MAX = 10;/);
assert.match(data, /export const FEATURED_BADGES = \[/);
assert.match(data, /export const HERO_COPY = \[/);
assert.doesNotMatch(data, /됩니다|그렇습니다|보여드립니다|늦지 않습니다/);
assert.match(banners, /const ROTATION_MS = 15000;/);
assert.match(banners, /collection\.openPreset\(\{ action: campaign\.action/);
assert.match(banners, /const FEATURED_AFTER_CARD = 6;/);
assert.match(banners, /shuffled\(listings\)\.slice\(0, FEATURED_MAX\)/);
assert.doesNotMatch(banners, /bn-num|counterMarkup/);
assert.match(bannersCss, /aspect-ratio: 430 \/ 104/);
assert.match(bannersCss, /\.hero-slide-db\.is-campaign \{[\s\S]*aspect-ratio: 1893 \/ 831;/);
assert.match(bannersCss, /\.hero-slide-db\.is-campaign \.hero-slide-bg \{ background-size: contain; \}/);
assert.match(legacy, /setInterval\(next, 15000\)/);
assert.match(legacy, /slide\.dataset\.heroAction = b\.action/);
assert.match(collection, /openPreset\(preset\)/);
assert.match(collection, /function matchesPreset\(card, action\)/);
assert.match(rowsCss, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
assert.match(rowsCss, /\.hrow-card \{ flex-basis: 180px; \}/);
assert.match(rowsCss, /\.hrow-block \{ margin: 34px 0; \}/);
assert.match(rows, /class="hrow-view-all"/);
assert.doesNotMatch(rows, /hrow-more/);
assert.doesNotMatch(index, /hrow-more/);
assert.match(legacy, /rows\.slice\(0, 12\)/);
assert.match(rows, /text\.referenceText \? `<span class="hrow-reference">/);
assert.match(rows, /text\.featureMovement \? `<span class="hrow-spec">/);
assert.doesNotMatch(rows, /class="hrow-trust"/, 'customer cards do not expose condition scores or accessory summaries');
assert.match(rowsCss, /\.hrow-card \{[\s\S]*display: flex; flex-direction: column;/);
assert.match(rowsCss, /\.hrow-model \{[\s\S]*min-height: 20px; max-height: 40px;/);
assert.match(rowsCss, /\.hrow-price \{[\s\S]*height: 26px; min-height: 26px; margin-top: auto;/);
assert.doesNotMatch(legacy, /hcard-ref is-empty/);
assert.doesNotMatch(legacy, /hcard-pack is-empty/);
assert.match(legacy, /function listingAccessoryInfo\(it\)/);
assert.doesNotMatch(legacy, /class="hcard-trust"/, 'collection cards do not expose condition scores or accessory summaries');
assert.match(redesignCss, /#homeOnSale \.hcard,[\s\S]*display: flex;[\s\S]*flex-direction: column;/);
assert.match(redesignCss, /#homeOnSale \.home-sale-grid,[\s\S]*align-items: stretch !important;/);
assert.match(redesignCss, /#homeOnSale \.hcard-model,[\s\S]*min-height: 21px; max-height: 42px;/);
assert.match(redesignCss, /#homeOnSale \.hcard-price,[\s\S]*height: 25px; min-height: 25px; margin-top: auto;/);

for (let i = 1; i <= 10; i += 1) {
  const file = `assets/banners/category-${String(i).padStart(2, '0')}.webp`;
  assert.ok(fs.existsSync(path.join(root, file)), file);
  const hero = `assets/banners/hero-${String(i).padStart(2, '0')}.webp`;
  assert.ok(fs.existsSync(path.join(root, hero)), hero);
}

console.log('home redesign checks: hero collections included');
