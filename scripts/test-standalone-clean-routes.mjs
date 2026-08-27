import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const routeSource = await readFile(new URL('app/pages/standalone-route.js', root), 'utf8');

function execute(pathname, search = '', hash = '') {
  let redirectedTo = '';
  let routePendingRemoved = false;
  const context = {
    location: {
      pathname,
      search,
      hash,
      replace(target) { redirectedTo = target; },
    },
    document: {
      documentElement: {
        removeAttribute(name) {
          if (name === 'data-standalone-route-pending') routePendingRemoved = true;
        },
      },
    },
  };
  vm.runInNewContext(routeSource, context);
  return { redirectedTo, routePendingRemoved };
}

for (const [legacy, clean] of [
  ['/pages/mypage.html', '/pages/mypage'],
  ['/pages/orders.html', '/pages/orders'],
  ['/pages/inquiry.html', '/pages/inquiry'],
]) {
  const result = execute(legacy, '?source=legacy', '#section');
  assert.equal(result.redirectedTo, `${clean}?source=legacy#section`);
  assert.equal(result.routePendingRemoved, false, `${legacy}: 리다이렉트 중 보호 CSS를 해제하면 안 됩니다.`);

  const cleanResult = execute(clean);
  assert.equal(cleanResult.redirectedTo, '');
  assert.equal(cleanResult.routePendingRemoved, true, `${clean}: 정식 URL에서는 라우트 보호를 해제해야 합니다.`);
}

for (const page of ['mypage', 'orders', 'inquiry']) {
  const html = await readFile(new URL(`pages/${page}.html`, root), 'utf8');
  const routeIndex = html.indexOf('app/pages/standalone-route.js');
  const bodyIndex = html.indexOf('<body');
  const tabbarIndex = html.indexOf('app/ui/app-tabbar.js');
  const authIndex = html.indexOf('app/pages/standalone-page.js');
  assert.match(html, /<html[^>]*data-standalone-route-pending/i);
  assert.match(html, /<script\s+type=["']module["'][^>]*standalone-route\.js/i);
  assert(routeIndex >= 0 && routeIndex < bodyIndex, `${page}: 레거시 리다이렉트가 인증·UI보다 먼저 실행돼야 합니다.`);
  assert(routeIndex < tabbarIndex && routeIndex < authIndex,
    `${page}: 라우트 모듈은 탭바·인증 진입 모듈보다 먼저 선언돼야 합니다.`);
}

const css = await readFile(new URL('app/pages/standalone-page.css', root), 'utf8');
assert.match(css, /html\[data-standalone-route-pending\]\s+body[\s\S]*visibility:\s*hidden/,
  '레거시 URL 전환 전 화면을 숨기는 보호 CSS가 필요합니다.');

const sw = await readFile(new URL('sw.js', root), 'utf8');
for (const page of ['mypage', 'orders', 'inquiry']) {
  assert.match(sw, new RegExp(`'/pages/${page}':\\s*'\\./pages/${page}\\.html'`),
    `${page}: 확장자 없는 오프라인 경로가 기존 HTML 캐시로 연결돼야 합니다.`);
}

console.log('standalone clean routes: redirects=3 canonical=3 flicker-guard=1 offline=3 passed');
