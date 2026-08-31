import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { discoverPageHtmlFiles } from '../tools/pages-html.mjs';

const root = resolve(import.meta.dirname, '..');
const TABBAR_EXCEPTIONS = new Set(['pages/mypage.html']);
const ACTIVE_TAB = new Map([
  ['pages/orders.html', 'my'],
  ['pages/inquiry.html', ''],
]);

const pages = await discoverPageHtmlFiles(root);
for (const file of pages) {
  if (TABBAR_EXCEPTIONS.has(file)) continue;
  const html = await readFile(resolve(root, file), 'utf8');
  assert.match(html, /<bellore-tabbar\b[^>]*><\/bellore-tabbar>/i, `${file}: 공통 탭바가 필요합니다.`);
  assert.match(html, /app\/ui\/app-tabbar\.css/i, `${file}: 공통 탭바 CSS가 필요합니다.`);
  assert.match(html, /app\/ui\/app-tabbar\.js/i, `${file}: 공통 탭바 모듈이 필요합니다.`);
  const expected = ACTIVE_TAB.get(file);
  assert.notEqual(expected, undefined, `${file}: ACTIVE_TAB 또는 TABBAR_EXCEPTIONS에 명시해야 합니다.`);
  assert.match(html, new RegExp(`<bellore-tabbar\\b[^>]*data-active=["']${expected}["']`, 'i'), `${file}: 활성 탭이 ${expected || '없음'}이어야 합니다.`);
}

const login = await readFile(resolve(root, 'login.html'), 'utf8');
assert.match(login, /<bellore-tabbar\b[^>]*data-active=["']my["']/i, 'login.html: MY 탭이 활성인 공통 탭바가 필요합니다.');
assert.match(login, /assets\/icons\/favicon-32\.png/, 'login.html: 실제 존재하는 파비콘을 사용해야 합니다.');

const component = await readFile(resolve(root, 'app/ui/app-tabbar.js'), 'utf8');
const tabbarAsset = '/app/ui/app-tabbar.js?v=20260831-mypage-pages-loop-v1';
assert.match(component, /\['my', '\/pages\/mypage\/', '마이'/,
  '공통 마이 탭은 앱 셸을 쓰는 정식 마이페이지 주소를 사용해야 합니다.');
const tabbarScriptUrls = await Promise.all([
  'login.html', 'pages/orders.html', 'pages/inquiry.html',
].map(async (file) => {
  const html = await readFile(resolve(root, file), 'utf8');
  return html.match(/src=["'](\/app\/ui\/app-tabbar\.js\?v=[^"']+)["']/i)?.[1] || '';
}));
assert(tabbarScriptUrls.every(Boolean), '공통 탭바를 쓰는 페이지는 캐시키가 있는 모듈 URL을 가져야 합니다.');
assert.equal(new Set(tabbarScriptUrls).size, 1, '공통 탭바 모듈의 캐시키는 모든 페이지에서 같아야 합니다.');
assert(tabbarScriptUrls.every((url) => url === tabbarAsset),
  '공통 탭바는 정식 마이페이지 주소가 포함된 최신 캐시 키를 사용해야 합니다.');
const serviceWorker = await readFile(resolve(root, 'sw.js'), 'utf8');
assert(serviceWorker.includes(`'.${tabbarScriptUrls[0]}'`),
  '공통 탭바 모듈 URL과 서비스워커의 precache URL이 정확히 같아야 합니다.');
assert.match(component, /aria-current=[^\n]*page/, '활성 탭은 aria-current=page를 제공해야 합니다.');
assert.match(component, /tab-wish-badge/, '공통 탭바는 최신 홈 탭바의 보관함 배지를 포함해야 합니다.');
for (const iconPath of ['M3 12L12 3l9 9', 'm20 20-3.6-3.6', 'M20.8 4.6', 'M7.5 7.3', 'M4 21c0-4.4']) {
  assert.match(component, new RegExp(iconPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `공통 탭바에 최신 홈 아이콘 ${iconPath}가 필요합니다.`);
}
const css = await readFile(resolve(root, 'app/ui/app-tabbar.css'), 'utf8');
assert.match(css, /height:\s*calc\(66px \+ env\(safe-area-inset-bottom\)\)/, '탭바 높이는 모바일 safe-area를 포함해야 합니다.');
assert.match(css, /padding-bottom:\s*calc\([^;]*env\(safe-area-inset-bottom\)\)/, '페이지 본문은 safe-area 포함 탭바 높이를 확보해야 합니다.');
assert.match(css, /border-radius:\s*0/, '공통 탭바는 최신 홈 탭바의 평평한 상단을 유지해야 합니다.');
assert.match(css, /backdrop-filter:\s*blur\(20px\)/, '공통 탭바는 최신 홈 탭바의 블러 배경을 유지해야 합니다.');
assert.match(css, /color:\s*#151515/, '공통 탭바 활성색은 최신 홈 탭바와 같아야 합니다.');
assert.match(css, /tab-item\[aria-current=["']page["']\]/, '레거시 페이지 전환기가 active 클래스를 지워도 현재 탭 표시가 유지되어야 합니다.');
const authCss = await readFile(resolve(root, 'app/features/auth-login/auth-login.css'), 'utf8');
assert.match(authCss, /\.auth-logo img\s*\{[^}]*max-width:\s*100%/s, '320px 로그인 화면에서 로고가 가로 넘침을 만들면 안 됩니다.');

console.log(`standalone tabbar: pages=${pages.length} exceptions=${TABBAR_EXCEPTIONS.size} active=4 safe-area=1 passed`);
