const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const index = read('index.html');
const bootstrap = read('app/bootstrap.js');
const quicklinks = read('app/features/home-quicklinks/home-quicklinks.js');
const css = read('app/features/home-quicklinks/home-quicklinks.css');

assert.match(index, /id="homeQuickCategories"/);
assert.ok(index.indexOf('id="homeQuickCategories"') > index.indexOf('id="heroCarousel"'));
assert.ok(index.indexOf('id="homeQuickCategories"') < index.indexOf('id="rowSaleBlock"'));
assert.match(bootstrap, /initHomeQuicklinks\(\{ document, window, collection \}\)/);

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
assert.match(quicklinks, /collection\.filterByPrice\(null, 3000000\)/);
assert.match(quicklinks, /collection\.search\('빈티지'\)/);
assert.match(css, /grid-template-columns: repeat\(6,/);
assert.match(css, /border-radius: 50%/);
assert.match(css, /aspect-ratio: 1893 \/ 831/);
assert.match(css, /background-size: contain/);
assert.match(css, /container-type: inline-size/);
assert.doesNotMatch(css, /\.page-home \.hero-default \.hero-image \{[^}]*background-size: cover/);
assert.match(css, /home-banner-1\.png/);
assert.ok(fs.existsSync(path.join(root, 'assets', 'home-banner-1.png')), 'single home banner image');
assert.match(css, /\.page-home \.hero-carousel \{[\s\S]*width: 100%;[\s\S]*max-width: none;[\s\S]*margin-left: 0;[\s\S]*margin-right: 0;[\s\S]*border-radius: 0;/);
assert.match(css, /margin: calc\(18px \+ 4pt\) auto 30px/);
assert.match(css, /margin-top: calc\(14px \+ 4pt\)/);
assert.match(css, /\.page-home \.hero-carousel \{[\s\S]*margin-top: 0;/);

console.log('home quicklinks checks: 42 passed');
