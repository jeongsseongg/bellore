import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const [index, runtime, backend, hubRuntime, hubCss, pageCss, pageRuntime, authGate, wishlist, sellPages, sellStatus, sw, build, saved, recent, support, chat] = await Promise.all([
  read('index.html'), read('script.js'), read('supabase.js'),
  read('app/features/mypage-account-hub/account-hub-runtime.js'),
  read('app/features/mypage-account-hub/account-hub.css'),
  read('app/features/mypage-account-hub/account-pages.css'),
  read('app/features/mypage-account-hub/account-pages.js'),
  read('app/pages/standalone-auth-gate.mjs'), read('wishlist.js'),
  read('app/features/sell-method/sell-service-pages.js'), read('app/features/sell-method/sell-record-status.js'), read('sw.js'),
  read('tools/build-pages.mjs'), read('pages/saved.html'), read('pages/recent.html'),
  read('pages/support.html'), read('cq-demo.js')
]);

const orderIndex = index.indexOf('id="mpOrderPreview"');
const saleIndex = index.indexOf('id="mpSalePreview"');
assert(orderIndex > 0 && saleIndex > orderIndex, '최근 주문은 판매 진행보다 먼저 표시돼야 합니다.');
const accountSlice = index.slice(orderIndex, index.indexOf('id="mpMenuList"'));
assert.doesNotMatch(accountSlice, />전체보기</);
assert.doesNotMatch(accountSlice, /<strong>내 시계<\/strong>/);
assert.match(accountSlice, /id="mpOrderDelete"[^>]*>주문 삭제/);
assert.match(accountSlice, /id="mpSaleCancel">견적 취소/);
assert.match(accountSlice, />시계 추가로 견적받기</);
assert.match(index, /href="\/pages\/support\.html"/);

assert.match(hubCss, /\.mp-account-summary\s*\{[\s\S]*?gap:\s*5px/);
assert.match(hubCss, /\.mp-order-actions,[\s\S]*?overflow:\s*hidden[\s\S]*?border-radius:\s*11px/);
assert.match(hubCss, /#notiPage \.noti-item\s*\{[\s\S]*?border-radius:\s*18px/);
assert(hubCss.split('\n').length < 400, '계정 허브 CSS는 400줄 미만이어야 합니다.');
assert(pageCss.split('\n').length < 400, '독립 계정 페이지 CSS는 400줄 미만이어야 합니다.');

assert.match(backend, /quote_expires_at/);
assert.match(backend, /expiresMs <= Date\.now\(\)\) \? 'closed'/);
assert.match(backend, /Backend\.cancelMyQuote[\s\S]*?\.eq\('customer_id', rawUser\.id\)[\s\S]*?\.in\('status', \['pending', 'open'\]\)/);
assert.match(sellStatus, /function isExpiredCompare/);
assert.match(sellStatus, /function isActiveSellRecord/);
assert.match(sellPages, /const visible = records\.filter\(isActiveSellRecord\)/);

assert.match(runtime, /window\.location\.assign\('\/pages\/saved'\)/);
assert.match(runtime, /window\.location\.assign\('\/pages\/recent'\)/);
assert.match(runtime, /window\.location\.assign\('\/pages\/support'/);
assert.match(runtime, /window\.location\.assign\('\/pages\/orders'/);
assert.match(runtime, /role="button" tabindex="0" data-nid/);
assert.match(runtime, /u\.phoneVerified \? '휴대폰번호 변경' : '본인인증'/);
assert.match(runtime, /data-sstep="legal"|openLegalPage/);
assert.match(hubRuntime, /openLegalPage/);
assert.match(hubRuntime, /normalizeQuotes/);
assert.match(backend, /verifiedName:/);
assert.match(backend, /birthDate:/);

for (const [name, page] of [['saved', saved], ['recent', recent], ['support', support]]) {
  assert.match(page, new RegExp(`data-bellore-standalone-page="${name}"[^>]*data-standalone-auth="required"`));
  assert.doesNotMatch(page, /<script(?![^>]*src=)[^>]*>/);
  assert.doesNotMatch(page, /style=/);
  assert.match(authGate, new RegExp(`${name}: 'required'`));
  assert.match(sw, new RegExp(`'/pages/${name}': '\\./pages/${name}\\.html'`));
}
assert.match(wishlist, /getRecent: viewedItems/);
assert.match(pageRuntime, /page === 'saved'/);
assert.match(pageRuntime, /page === 'recent'/);
assert.match(pageRuntime, /page === 'support'/);
assert.match(chat, /class="cq-chat-contact"[\s\S]*?010-8004-6665/);
assert.match(build, /app\/features\/mypage-account-hub\/account-pages\.js/);
assert.match(build, /app\/features\/mypage-account-hub\/account-hub-runtime\.js/);

console.log('mypage account hub: layout=1 expiry=1 actions=2 routes=5 pages=3 identity=1 settings=1 passed');
