import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const [index, page, runtime, legacy, css, sw, build] = await Promise.all([
  read('index.html'),
  read('pages/mypage.html'),
  read('app/pages/standalone-page.js'),
  read('script.js'),
  read('app/features/mypage-personal-shop/mypage-personal-shop.css'),
  read('sw.js'),
  read('tools/build-pages.mjs')
]);

assert.match(index, /id=["']myPageModal["'][^>]*hidden/i,
  'the main catalog shell must own the mypage modal contract');
assert.doesNotMatch(page, /id=["']myPageModal["']/i,
  'the compatibility route must not duplicate the mypage interface');
for (const id of [
  'mpProfile', 'mpMenuList', 'myInterestSection', 'myRecentSection',
  'myPointSection', 'myCouponSection', 'bizInfoModal', 'termsModal',
  'privacyModal', 'refundModal', 'guideModal', 'partnerModal', 'adminPanel',
  'notiPage', 'profilePage', 'settingsPage', 'postModal',
]) {
  assert.match(index, new RegExp(`id=["']${id}["']`), `${id} must remain in the root composition`);
}
assert.match(legacy, /idMap\s*=\s*\{\s*terms:\s*'termsModal',\s*privacy:\s*'privacyModal',\s*refund:\s*'refundModal',\s*guide:\s*'guideModal',\s*biz:\s*'bizInfoModal'\s*\}/,
  '법무·사업자 지원 화면 5개는 설정 화면의 실제 동작에 연결돼야 합니다.');
for (const id of ['notiPage', 'profilePage', 'settingsPage', 'partnerModal', 'adminPanel', 'postModal']) {
  assert.match(legacy, new RegExp(`\\$\\('#${id}'\\)|\\$\\('#${id.replace('Modal', '')}Modal'\\)`),
    `${id} 지원 화면은 런타임 동작에서 참조돼야 합니다.`);
}
assert.match(index, /id=["']btnSettings["']/, 'the working settings entry point must remain');
assert.match(page, /<body[^>]*data-bellore-standalone-page=["']mypage["'][^>]*data-standalone-auth=["']required["']/i);
assert.match(page, /rel=["']canonical["'][^>]*href=["']https:\/\/bellore\.co\.kr\/pages\/mypage\/["']/i);
assert.match(page, /assets\/icons\/favicon-32\.png/, 'the compatibility route must keep the favicon');
const standaloneUrl = page.match(/src=["'](\/app\/pages\/standalone-page\.js\?v=[^"']+)["']/)?.[1];
assert(standaloneUrl, 'the compatibility route must load the shared auth entry');

const authIndex = runtime.indexOf('await enforceStandaloneAuth');
const redirectIndex = runtime.indexOf("window.location.replace('/pages/mypage/')");
const dependencyIndex = runtime.indexOf('for (const dependency of pageDependencies)');
assert(authIndex >= 0 && redirectIndex > authIndex && dependencyIndex > redirectIndex,
  'server auth must finish before mypage redirects or legacy UI dependencies load');
assert.doesNotMatch(runtime, /fetch\(['"]\/index\.html/, 'the compatibility route must not clone the root document');
assert.doesNotMatch(runtime, /hydrateMypageSupport|waitForLegacyOpen/,
  'the removed duplicate composition cannot return');

assert.match(legacy, /initCountdowns\(\);\s*initMypageRoute\(\);/,
  'the mypage route gate runs after legacy handlers bind');
assert.match(legacy, /function verifyMypageUser\([\s\S]*?sbClient\.auth\.getUser\(\)/,
  'mypage access must verify the current user with the auth server');
assert.match(legacy, /function isMypageRoute\([\s\S]*?path === '\/pages\/mypage'/,
  'the clean pathname must be recognized without a root query parameter');
assert.match(legacy, /function initMypageRoute\([\s\S]*?verifyMypageUser\(\)[\s\S]*?if \(allowed\)[\s\S]*?openMyPage\(\)[\s\S]*?revealMypageRoute\(\)/,
  'the root deep link verifies the current user before opening mypage');
assert.match(legacy, /function openMyOrLogin\([\s\S]*?verifyMypageUser\(\)[\s\S]*?if \(allowed\)[\s\S]*?openMyPage\(\)/,
  'the visible MY controls use the same server-verified gate');
assert.match(legacy, /function openMyOrLogin\([\s\S]*?else openLoginModal\(['"]\/pages\/mypage['"]\)/,
  'signed-out MY controls must return to the integrated mypage after login');
assert.doesNotMatch(legacy, /window\.location\.assign\(['"]\/pages\/mypage/,
  'root handlers cannot fall back to the broken standalone composition');
assert.match(legacy, /var wasOpen = !!\(m && !m\.hidden\)/,
  'route cleanup must distinguish a user close from signed-out state initialization');
assert.match(legacy, /url\.pathname\.replace\(\/\\\/\+\$\/, ''\) === '\/pages\/mypage'[\s\S]*?history\.replaceState\(history\.state, '', '\/'\)/,
  'closing the clean mypage route must restore the home URL');
assert.match(legacy, /if \(wasOpen && url\.searchParams\.get\(['"]view['"]\) === ['"]mypage['"]\)[\s\S]*?searchParams\.delete\(['"]view['"]\)/,
  'only closing a visible mypage clears its deep-link query');

assert.match(css, /body\.mypage-open #myPageModal/);
assert.doesNotMatch(css, /data-bellore-standalone-page=["']mypage["']/,
  'the personal-shop design must target the integrated root state');
assert.doesNotMatch(css, /#myPageModal\s*\{[^}]*position:\s*static/s,
  'the root modal cannot be flattened into the document flow');
assert.match(css, /\.partner-settlement-heading\s*\{[^}]*margin-top:\s*18px/s,
  'the moved partner heading replaces the removed inline style');
assert(sw.includes(`'.${standaloneUrl}'`), 'the service worker must precache the exact compatibility entry URL');
assert.match(build, /discoverPageHtmlFiles\(ROOT\)/);
assert.match(build, /pages', 'mypage', 'index\.html'/,
  'the Pages artifact must contain a real clean-route directory index');
assert.match(build, /data-mypage-route-pending[\s\S]*?noindex, follow/,
  'the generated app shell must stay hidden and non-indexable until auth resolves');

console.log('mypage integration: clean-route=1 auth-first=1 support=11 cache=1 passed');
