const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

function fakeButton() {
  let click = null;
  return {
    addEventListener(type, handler) { if (type === 'click') click = handler; },
    removeEventListener(type, handler) { if (type === 'click' && click === handler) click = null; },
    press() { if (click) click(); },
    hasClick() { return !!click; },
  };
}

function fakeEventTarget() {
  const listeners = new Map();
  return {
    addEventListener(type, handler) {
      const handlers = listeners.get(type) || [];
      handlers.push(handler);
      listeners.set(type, handlers);
    },
    removeEventListener(type, handler) {
      listeners.set(type, (listeners.get(type) || []).filter((item) => item !== handler));
    },
    emit(type, detail = {}) {
      for (const handler of [...(listeners.get(type) || [])]) handler({ type, detail });
    },
  };
}

(async () => {
  const root = path.resolve(__dirname, '..');
  const core = await import(pathToFileURL(path.join(root, 'app', 'core', 'market-product-url.mjs')).href);
  const sharing = await import(pathToFileURL(path.join(root, 'app', 'features', 'product-sharing', 'product-sharing.mjs')).href);
  const screenshotProduct = {
    listingId: 'fee2c7b5-62f6-4cb0-8cc5-b4e7cf602e24',
    productNo: 'ROL-N21268-6',
    brand: '롤렉스',
    model: '데이저스트 178274 31mm 풀세트',
  };

  assert.equal(core.normalizeProductNumber(' ROL-N21268-6 '), 'rol-n21268-6');
  assert.equal(
    sharing.productShareUrl(screenshotProduct),
    'https://bellore.co.kr/market/rol-n21268-6/',
    '공개 상품은 상품번호 canonical로 공유합니다.',
  );
  assert.equal(
    sharing.productShareUrl({ listingId: 'id with spaces', productNo: '' }),
    'https://bellore.co.kr/#p=id%20with%20spaces',
    '상품번호가 없으면 이전 앱 딥링크를 유지합니다.',
  );
  assert.equal(
    sharing.productShareUrl({ listingId: 'listing-1', productNo: '잘못된 번호' }),
    'https://bellore.co.kr/#p=listing-1',
    '유효하지 않은 상품번호로 404 canonical을 만들지 않습니다.',
  );

  const [demoId, demoNumber] = core.LEGACY_DEMO_PRODUCTS[0];
  assert.equal(core.publicMarketUrl({ id: demoId, product_no: demoNumber }), '');
  assert.equal(
    sharing.productShareUrl({ listingId: demoId, productNo: demoNumber }),
    `https://bellore.co.kr/#p=${demoId}`,
    '색인 제외 데모 8개는 존재하지 않는 market URL을 공유하지 않습니다.',
  );

  const top = fakeButton();
  const bottom = fakeButton();
  const shared = [];
  const controller = sharing.initProductSharing({
    document: { getElementById: (id) => id === 'pmShareTop' ? top : id === 'pmShare' ? bottom : null },
    navigator: { share: (data) => { shared.push(data); return Promise.resolve(); } },
    getCurrentProduct: () => screenshotProduct,
  });
  top.press();
  bottom.press();
  assert.equal(shared.length, 2, '상단·하단 공유 버튼이 모두 연결됩니다.');
  assert(shared.every((item) => item.url === 'https://bellore.co.kr/market/rol-n21268-6/'));
  controller.destroy();
  assert.equal(top.hasClick(), false);
  assert.equal(bottom.hasClick(), false);

  const routeDocument = fakeEventTarget();
  const routeWindow = fakeEventTarget();
  const routeCalls = [];
  routeWindow.location = { origin: 'https://bellore.co.kr', hash: '#home' };
  routeWindow.history = {
    state: null,
    pushState(state, _title, url) {
      this.state = state;
      routeCalls.push(['push', url]);
      routeWindow.location.hash = new URL(url, routeWindow.location.origin).hash;
    },
    replaceState(state, _title, url) {
      this.state = state;
      routeCalls.push(['replace', url]);
      routeWindow.location.hash = new URL(url, routeWindow.location.origin).hash;
    },
    back() { routeCalls.push(['back']); },
  };
  const routeController = sharing.initProductDetailRoute({ document: routeDocument, window: routeWindow });
  routeDocument.emit('bellore:product-open', { product: screenshotProduct });
  await Promise.resolve();
  assert.deepEqual(routeCalls[0], ['push', '/market/rol-n21268-6/']);
  assert.equal(routeWindow.history.state.belloreProduct, 1);
  assert.equal(routeWindow.history.state.ov, 1);
  routeDocument.emit('bellore:product-open', { product: screenshotProduct });
  await Promise.resolve();
  assert.deepEqual(routeCalls[1], ['replace', '/market/rol-n21268-6/'], '비동기 상세 보강은 새 이력을 만들지 않습니다.');
  let afterRestore = 0;
  routeDocument.emit('bellore:product-close', { afterRestore: () => { afterRestore += 1; } });
  assert.deepEqual(routeCalls[2], ['back']);
  routeWindow.emit('popstate');
  assert.equal(afterRestore, 1);
  routeController.destroy();

  const bootstrap = fs.readFileSync(path.join(root, 'app', 'bootstrap.js'), 'utf8');
  const legacy = fs.readFileSync(path.join(root, 'script.js'), 'utf8');
  const policy = fs.readFileSync(path.join(root, 'tools', 'seo', 'market-policy.mjs'), 'utf8');
  const serviceWorker = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  const buildPages = fs.readFileSync(path.join(root, 'tools', 'build-pages.mjs'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const pageRuntime = fs.readFileSync(path.join(root, 'app', 'legacy', 'page-runtime.js'), 'utf8');

  assert.match(bootstrap, /import \{ initProductDetailRoute, initProductSharing \} from '\.\/features\/product-sharing\/product-sharing\.mjs';/);
  assert.match(bootstrap, /initProductSharing\(\{/);
  assert.match(bootstrap, /initProductDetailRoute\(\{ document, window \}\);/);
  assert.doesNotMatch(legacy, /function shareCurrentProduct\(/, '레거시 UUID 공유 함수가 제거됩니다.');
  const currentProductBlocks = [...legacy.matchAll(/BELLORE_currentProduct\s*=\s*\{([\s\S]*?)\n\s*\};/g)];
  assert.equal(currentProductBlocks.length, 3, '현재 상품 상태 생성 지점 수가 바뀌면 검토가 필요합니다.');
  assert(currentProductBlocks.every((match) => /\bproductNo\s*:/.test(match[1])), '모든 현재 상품 상태가 상품번호를 보존합니다.');
  assert.equal(
    (legacy.match(/no: it\.product_no \|\| String\(it\.id\)\.slice\(0, 8\)\.toUpperCase\(\)/g) || []).length,
    2,
    '비동기 상세 조회도 UUID 대신 상품번호를 우선 표시합니다.',
  );
  assert.doesNotMatch(
    legacy,
    /\bno: String\(it\.id\)\.slice\(0, 8\)\.toUpperCase\(\)/,
    '비동기 상세 조회가 상품번호를 UUID 앞자리로 덮어쓰면 안 됩니다.',
  );
  assert.equal((legacy.match(/dispatchProductRoute\('bellore:product-open'\)/g) || []).length, 3);
  assert.match(legacy, /dispatchProductRoute\('bellore:product-close', afterRestore\)/);
  assert.match(policy, /from '\.\.\/\.\.\/app\/core\/market-product-url\.mjs';/, 'SEO도 앱과 같은 URL 규칙을 사용합니다.');
  for (const asset of [
    './app/core/market-product-url.mjs',
    './app/features/product-sharing/product-sharing.mjs',
  ]) {
    assert(serviceWorker.includes(`'${asset}'`), `서비스워커 누락: ${asset}`);
    assert(buildPages.includes(`'${asset.slice(2)}'`), `Pages allowlist 누락: ${asset}`);
  }
  for (const [asset, releaseKey] of [
    ['script.js', '20260826-payment-recovery-v1'],
    ['app/bootstrap.js', '20260826-payment-recovery-v1'],
    ['sw.js', '20260826-payment-recovery-v1'],
    ['wishlist.js', '20260824-purl-v2'],
    ['search.js', '20260824-purl-v2'],
  ]) {
    const registrationSource = asset === 'sw.js' ? pageRuntime : html;
    assert(registrationSource.includes(`${asset}?v=${releaseKey}`), `런타임 캐시 키 누락: ${asset}`);
  }

  console.log('product sharing market URL invariants: ok');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
