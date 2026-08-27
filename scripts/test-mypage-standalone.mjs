import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const [index, page, runtime, legacy, sw, build] = await Promise.all([
  read('index.html'),
  read('pages/mypage.html'),
  read('app/pages/standalone-page.js'),
  read('script.js'),
  read('sw.js'),
  read('tools/build-pages.mjs')
]);

assert.doesNotMatch(index, /id=["']myPageModal["']/i,
  'the main catalog shell must not retain the mypage modal markup');
assert.match(page, /<body[^>]*data-bellore-standalone-page=["']mypage["']/i);
assert.match(page, /id=["']myPageModal["'][^>]*hidden/i);
for (const id of ['mpProfile', 'mpMenuList', 'myInterestSection', 'myRecentSection', 'myPointSection', 'myCouponSection']) {
  assert.match(page, new RegExp(`id=["']${id}["']`), `${id} moved with the existing design contract`);
}
assert.match(page, /type=["']module["'][^>]*app\/pages\/standalone-page\.js/i,
  'the page must use one module entry instead of duplicating legacy script tags');
assert.match(runtime, /BELLORE_openMyPage[\s\S]*page === 'mypage'/);
assert.match(runtime, /document\.readyState === 'loading'[\s\S]*openStandalonePage\(\)/,
  'dynamically loaded standalone pages must open after or before DOMContentLoaded');
assert.match(legacy, /else \{\s*setTimeout\(init, 0\);\s*\}/,
  'late-loaded legacy initialization must wait until the script has finished defining its router');
assert.match(legacy, /window\.location\.assign\('\/pages\/mypage\.html'\)/,
  'the existing mypage entry point must deep-link to the standalone page');
assert.match(legacy, /belloreStandalonePage === 'mypage'[\s\S]*history\.back\(\)/,
  'standalone close must preserve browser back navigation');
assert.match(sw, /app\/pages\/standalone-page\.js/);
assert.match(build, /discoverPageHtmlFiles\(ROOT\)/);

console.log('mypage standalone: markup=1 route=1 history=1 cache=1 passed');
