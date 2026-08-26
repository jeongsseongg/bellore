const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const index = read('index.html');
const bootstrap = read('app/bootstrap.js');
const quicklinks = read('app/features/home-quicklinks/home-quicklinks.js');
const css = read('app/features/home-quicklinks/home-quicklinks.css');
const collection = read('app/legacy/legacy-collection.js');
const pageRuntime = read('app/legacy/page-runtime.js');

assert.match(index, /id="homeQuickCategories"/);
assert.ok(index.indexOf('id="homeQuickCategories"') > index.indexOf('id="heroCarousel"'));
assert.ok(index.indexOf('id="homeQuickCategories"') < index.indexOf('id="rowSaleBlock"'));
assert.match(bootstrap, /initHomeQuicklinks\(\{ document, window, collection \}\)/);
assert.match(bootstrap, /home-quicklinks\.js\?v=20260826-hero-campaigns-v7/);
assert.match(bootstrap, /legacy-collection\.js\?v=20260825-home-typography-admin-layout-v8/);

for (const label of ['TIME SALE', '브랜드', '빈티지', '300만원 ↓', '시계판매', '수리\/진단']) {
  assert.match(quicklinks, new RegExp(`label: '${label}'`));
}
for (const action of ['timesale', 'search', 'vintage', 'under300', 'sell', 'repair']) {
  assert.match(quicklinks, new RegExp(`action: '${action}'`));
}
assert.match(quicklinks, /label: 'TIME SALE', action: 'timesale', image: 'assets\/home-quicklinks\/under-300\.png'/);
assert.match(quicklinks, /label: '300만원 ↓', action: 'under300', image: 'assets\/home-quicklinks\/time-sale\.png'/);
for (const image of ['time-sale.png', 'brand-search.png', 'vintage.png', 'under-300.png', 'sell-watch.png', 'repair-diagnosis.png']) {
  assert.ok(quicklinks.includes(`assets/home-quicklinks/${image}`), image);
  assert.ok(fs.existsSync(path.join(root, 'assets', 'home-quicklinks', image)), image);
}

assert.match(quicklinks, /CONTENT_KEY = 'home_quick_categories'/);
assert.match(quicklinks, /backend\.saveSiteContent\(CONTENT_KEY/);
assert.match(quicklinks, /settingsButton\.hidden = !isAdmin/);
assert.match(quicklinks, /collection\.filter\(\{ maxInclusive: 3000000 \}\)/);
assert.match(quicklinks, /collection\.filter\(\{ vintage: true \}\)/);
assert.match(quicklinks, /action === 'search'\) return collection\.filter\(\{\}\)/);
assert.match(quicklinks, /collection\.filter\(\{ saleOnly: true \}\)/);
assert.doesNotMatch(quicklinks, /getElementById\('searchInput'\)/);
assert.doesNotMatch(quicklinks, /navigate\(doc, win, 'cat-sale'\)/);
assert.match(collection, /open\(\) \{[\s\S]*openCollectionPage\(\);[\s\S]*return true;/);
assert.match(collection, /querySelector\('\.tab-item\[data-nav="collection"\]'\) \|\| doc\.querySelector\('\[data-nav="collection"\]'\)/);
assert.match(pageRuntime, /homeRule\.saleOnly && c\.dataset\.saleactive !== '1'/);
assert.match(pageRuntime, /homeRule\.maxInclusive != null/);
assert.match(index, /전체 <b id="catTotalCount">0<\/b>개/);
assert.match(index, /id="catFilteredCount" hidden>현재 <b id="catCount">0<\/b>개/);
assert.match(css, /grid-template-columns: repeat\(6,/);
assert.match(css, /border-radius: 50%/);
assert.match(css, /aspect-ratio: 3155 \/ 1662/);
assert.match(css, /background-size: contain, cover/);
assert.match(css, /container-type: inline-size/);
assert.doesNotMatch(css, /\.page-home \.hero-default \.hero-image \{[^}]*background-size: cover/);
assert.match(css, /home-banner-1\.png/);
assert.ok(fs.existsSync(path.join(root, 'assets', 'home-banner-1.png')), 'single home banner image');
assert.match(css, /\.page-home \.hero-carousel \{[\s\S]*width: 100%;[\s\S]*max-width: none;[\s\S]*margin-left: 0;[\s\S]*margin-right: 0;[\s\S]*border-radius: 0;/);
assert.match(css, /margin: -16px auto 16px/);
assert.match(css, /margin-top: -12px/);
assert.match(css, /\.page-home \.hero-carousel \{[\s\S]*margin-top: 0;/);
assert.doesNotMatch(index, /hero-fullset-link/);
assert.match(index, /class="hq-scrollbar"[\s\S]*class="hq-scrollbar-thumb"/);
assert.match(quicklinks, /rail\.addEventListener\('scroll', syncScrollbar, \{ passive: true \}\)/);
assert.match(quicklinks, /thumbWidth = Math\.max\(36,/);
assert.match(quicklinks, /if \(maxScroll <= 1\) \{[\s\S]*scrollbar\.hidden = true;/);
assert.match(quicklinks, /scrollbar\.hidden = false;[\s\S]*thumbWidth = Math\.max\(36,/);
assert.doesNotMatch(quicklinks, /trackWidth \* 2 \/ 3/);
assert.match(quicklinks, /data-hq-action="\$\{escapeText\(item\.action\)\}"/);
assert.match(quicklinks, /\['300만원 미만', '300만원 이하'\]\.includes\(label\)\) label = '300만원 ↓'/);
assert.match(css, /border-radius: 18px 18px 0 0/);
assert.match(css, /\.hq-scrollbar \{ display: block; width: 66\.6667%; height: 3px; margin: 10px auto 0;/);
assert.match(css, /\.hq-scrollbar \{ display: block; width: 66\.6667%; height: 3px; margin: 6px auto 0;/);

console.log('home quicklinks checks: 61 passed');
