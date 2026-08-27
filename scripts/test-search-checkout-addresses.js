const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

(async () => {
  const root = path.resolve(__dirname, '..');
  const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
  const checkout = await import(pathToFileURL(path.join(root, 'app/features/checkout/checkout-addresses.mjs')).href);

  assert.equal(checkout.formatKoreanPhone('01041027437'), '010-4102-7437');
  assert.equal(checkout.formatKoreanPhone('0106293668'), '010-629-3668');
  assert.equal(checkout.formatKoreanPhone('+82 10 4102 7437'), '010-4102-7437');
  assert.deepEqual(checkout.normalizeAddress({ label: ' 집 ', recipient: ' 홍길동 ', phone: '01041027437', postcode: '12345', addr1: '서울', is_default: true }), {
    id: '', label: '집', recipient: '홍길동', phone: '010-4102-7437', postcode: '12345', addr1: '서울', addr2: '', is_default: true,
  });

  const index = read('index.html');
  for (const id of ['coSameBuyer', 'coManageAddresses', 'coShipName', 'coShipPhone', 'coPostcode', 'coAddr1', 'coAddr2']) {
    assert.match(index, new RegExp(`id="${id}"`));
  }
  for (const removedInlineId of ['coAddressBook', 'coAddressList', 'coAddressLabel', 'coAddressDefault', 'coSaveAddress']) {
    assert.doesNotMatch(index, new RegExp(`id="${removedInlineId}"`));
  }
  const popup = read('app/features/checkout/shipping-address-popup.mjs');
  assert.match(popup, /role="dialog" aria-modal="true"/);
  assert.match(popup, /data-address-new/);
  assert.match(popup, /data-address-action="edit"/);
  assert.match(popup, /data-address-action="default"/);
  assert.match(popup, /data-address-action="delete"/);
  assert.match(popup, /data-address-find/);
  assert.match(popup, /data-address-search-view/);
  assert.match(popup, /\.embed\(postcodeSearch\)/);
  assert.match(popup, /openSearch/);
  assert.doesNotMatch(popup, /\.open\(\)/, '주소 검색은 외부 팝업 대신 주문서 안 임베드 화면을 사용해야 합니다.');
  assert.match(checkout.initCheckoutAddresses.toString(), /createShippingAddressPopup/);
  assert.match(checkout.initCheckoutAddresses.toString(), /coFindAddr/);
  assert.match(read('app/bootstrap.js'), /checkout-addresses\.mjs\?v=20260827-checkout-address-search-v1/);
  assert.match(index, /app\/bootstrap\.js\?v=20260827-checkout-logos-v1/);
  assert.match(read('app/bootstrap.js'), /initCheckoutAddresses\(\{ document, window, getClient:/);
  assert.match(read('payments.js'), /bellore:checkout-opened/);
  assert.doesNotMatch(read('payments.js'), /new window\.daum\.Postcode/);
  const orderCss = read('app/features/checkout/checkout-order.css');
  const payments = read('payments.js');
  assert.match(index, /checkout-order\.css\?v=20260827-checkout-receive-v1/);
  assert.match(index, /<span class="co-title">주문서<\/span>/);
  assert.match(index, /<h3>주문상품<\/h3>/);
  assert.match(orderCss, /--checkout-ink:#151515/);
  assert.match(orderCss, /border-bottom:8px solid var\(--checkout-section\)/);
  assert.doesNotMatch(orderCss, /#24623e|#173f2a|#edf5f0|#c0392b/i);
  assert.match(index, /id="coSubtotal"/);
  assert.match(index, /id="coShipping"/);
  assert.match(index, /id="coAmountTotal"/);
  assert.match(payments, /shippingEl\.textContent = shipping > 0/);
  assert.match(orderCss, /#checkoutModal \.co-method\.active \.co-method-radio/);
  for (const id of ['coDetailBrand', 'coDetailModel', 'coDetailRef', 'coDetailNo', 'coDetailSize', 'coDetailYear', 'coDetailComponents', 'coDetailMovement', 'coDetailCondition', 'coDetailDescription']) {
    assert.match(index, new RegExp(`id="${id}"`));
  }
  assert.match(index, /발렉스 프리미엄 안전배송/);
  assert.match(index, /고가 시계 전문 운송사 발렉스가 보험과 전용 포장을 포함해 안전하게 배송합니다/);
  assert.match(index, /벨로르 매장 직접거래/);
  assert.match(index, />방문 일정 문의 <span/);
  assert.doesNotMatch(index, /직접거래 문의 010-6293-6668/);
  const presentation = read('app/features/checkout/checkout-presentation.js');
  assert.match(presentation, /methodVisual/);
  assert.match(presentation, /co-method-icon/);
  for (const icon of ['card.svg', 'virtual-account.svg', 'naverpay-badge.svg', 'kakaopay.png', 'tosspay.png']) {
    assert.match(presentation, new RegExp(`assets/payment-methods/${icon.replace('.', '\\.')}`));
  }
  assert.doesNotMatch(presentation, /💳|🏦|mark: 'N'|mark: 'K'|mark: 'T'/);
  assert.match(presentation, /coDetailDescriptionWrap/);
  assert.match(read('script.js'), /checkoutProductFromListing/);
  assert.match(read('app/legacy/page-runtime.js'), /BELLORE_BRAND_KR \? window\.BELLORE_BRAND_KR\(bd\)/);
  assert.match(read('script.js'), /BELLORE_BRAND_KR\(c\.dataset\.brand\)/);

  const migration = read('supabase/migrations/20260826150000_customer_shipping_addresses.sql');
  assert.match(migration, /create table if not exists public\.shipping_addresses/);
  assert.match(migration, /if address_count >= 10/);
  assert.match(migration, /shipping_addresses_one_default_idx/);
  assert.match(migration, /pg_advisory_xact_lock\(hashtextextended\(new\.user_id::text, 0\)\)/);
  assert.match(migration, /auth\.jwt\(\) ->> 'role'/);
  assert.doesNotMatch(migration, /auth\.role\(\)/);
  for (const operation of ['select', 'insert', 'update', 'delete']) {
    assert.match(migration, new RegExp(`shipping_addresses_${operation}_own`));
  }
  assert.match(migration, /update public\.profiles set postcode = new\.postcode/);

  console.log('search + checkout address checks: 35 passed');
})().catch((error) => { console.error(error); process.exitCode = 1; });
