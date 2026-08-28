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
  assert.match(checkout.initCheckoutAddresses.toString(), /createShippingAddressPopup/);
  assert.match(read('app/bootstrap.js'), /checkout-addresses\.mjs\?v=20260826-shipping-address-popup-v2/);
  assert.match(read('app/bootstrap.js'), /initCheckoutAddresses\(\{ document, window, getClient:/);
  assert.match(read('payments.js'), /bellore:checkout-opened/);
  for (const asset of ['card.svg', 'virtual-account.svg', 'naverpay-badge.svg', 'kakaopay.png', 'tosspay.png']) {
    assert.ok(fs.statSync(path.join(root, 'assets/payment-methods', asset)).size > 0, `${asset} must be a non-empty checkout asset`);
  }
  const presentation = read('app/features/checkout/checkout-presentation.js');
  assert.match(presentation, /methodMarkup/);
  assert.match(presentation, /installCheckoutUi/);
  for (const id of ['coDetailBrand', 'coDetailModel', 'coDetailRef', 'coDetailNo', 'coDetailSize', 'coDetailYear', 'coDetailComponents', 'coDetailMovement', 'coDetailCondition', 'coDetailDescription']) {
    assert.match(index, new RegExp(`id="${id}"`));
  }
  assert.match(presentation, /coDetailDescriptionWrap/);
  assert.match(read('script.js'), /checkoutProductFromListing/);
  assert.match(read('payments.js'), /import\('\.\/app\/features\/checkout\/checkout-presentation\.js/);
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

  console.log('search + checkout address checks: 32 passed');
})().catch((error) => { console.error(error); process.exitCode = 1; });
