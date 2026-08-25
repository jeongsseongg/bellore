import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { installLegacyCheckoutCoupon } from '../app/legacy/checkout-coupon.js';
import { createPaymentFlow } from '../app/features/checkout/payment-flow.js';

class FakeElement {
  constructor(id = '') {
    this.id = id;
    this.value = '';
    this.textContent = '';
    this.className = '';
    this.hidden = false;
    this.disabled = false;
    this.checked = false;
    this.src = '';
    this.style = {};
    this.listeners = new Map();
    this._innerHTML = '';
  }

  set innerHTML(value) {
    this._innerHTML = String(value);
    if (this.id === 'coCouponSelect') this.value = '';
  }

  get innerHTML() { return this._innerHTML; }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  dispatch(type) {
    const event = {
      type,
      target: this,
      preventDefault() {},
    };
    for (const listener of this.listeners.get(type) || []) listener(event);
  }

  focus() { this.focused = true; }
  closest() { return null; }
  querySelector(selector) { return selector === '.co-scroll' ? this.scrollElement : null; }
}

class FakeDocument {
  constructor(elements) {
    this.readyState = 'loading';
    this.elements = elements;
    this.listeners = new Map();
    this.body = { style: {} };
  }

  querySelector(selector) {
    if (selector.startsWith('#')) return this.elements[selector.slice(1)] || null;
    return null;
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  dispatch(type) {
    for (const listener of this.listeners.get(type) || []) listener({ type });
  }
}

const ids = [
  'checkoutModal', 'coClose', 'coShipSec', 'coCouponSec', 'coCouponSelect', 'coCouponClear',
  'coCouponCode', 'coCouponApply', 'coCouponMsg', 'coDiscountRow', 'coDiscount', 'coTotal',
  'coImg', 'coBrand', 'coModel', 'coListPrice', 'coName', 'coPhone', 'coEmail', 'coShipName',
  'coShipPhone', 'coPostcode', 'coAddr1', 'coAddr2', 'coShipReq', 'coMethods', 'coPayBtn',
  'coFindAddr', 'coAgreeTerms', 'coAgreePrivacy', 'coAgreeOrder', 'prHome', 'payResult',
  'prIcon', 'prTitle', 'prDesc',
];
const elements = Object.fromEntries(ids.map((id) => [id, new FakeElement(id)]));
elements.checkoutModal.scrollElement = { scrollTop: 0 };
elements.coCouponClear.hidden = true;
elements.coCouponClear.disabled = true;
elements.coDiscountRow.hidden = true;
elements.coName.value = '테스트 구매자';
elements.coPhone.value = '01012345678';
elements.coEmail.value = 'buyer@example.com';
elements.coPostcode.value = '04570';
elements.coAddr1.value = '서울 중구 다산로 258';
elements.coAgreeTerms.checked = true;
elements.coAgreePrivacy.checked = true;
elements.coAgreeOrder.checked = true;

const documentObject = new FakeDocument(elements);
const alerts = [];
const createOrderCalls = [];
const paymentRequests = [];
const confirmCalls = [];
const diagnostics = [];
let listingStatus = 'on_sale';
let confirmResponses = [{ ok: true }];
let listingRefreshes = 0;
const couponUser = {
  id: 'coupon-user-1',
  status: 'active',
  coupon: {
    title: '전액 할인 테스트',
    discount_type: 'amount',
    discount_value: 1300,
    apply_to: 'order',
    expires_at: null,
  },
};

const locationObject = {
  hostname: 'localhost',
  origin: 'http://localhost:4173',
  pathname: '/market/ham-n6267-1/',
  search: '',
  hash: '',
};
const windowObject = {
  BELLORE_PAYMENTS: {
    storeId: 'store-test',
    checkoutUrl: '/checkout',
    confirmUrl: '/confirm',
    channels: [{ id: 'card', label: '카드', channelKey: 'channel-test', payMethod: 'CARD' }],
  },
  NWBackend: {
    enabled: true,
    currentUser() { return null; },
    myCoupons() { return Promise.resolve([couponUser]); },
    couponDiscount(coupon, base) {
      if (coupon.discount_type === 'amount') return Math.min(Number(coupon.discount_value) || 0, base);
      if (coupon.discount_type === 'percent') return Math.floor(base * (Number(coupon.discount_value) || 0) / 100);
      return 0;
    },
    getListing(id) {
      return Promise.resolve({ id, status: listingStatus, price: 1300, sale_price: null, tags: [] });
    },
    createOrder(payload) {
      createOrderCalls.push(payload);
      return Promise.resolve({ orderNo: 'ORDER-1', checkoutToken: 'TOKEN-1', amount: payload.amount });
    },
    confirmOrder(payload) {
      confirmCalls.push(payload);
      return Promise.resolve(confirmResponses.shift() || { ok: true });
    },
    refreshListings() { listingRefreshes += 1; },
  },
  PortOne: {
    requestPayment(payload) {
      paymentRequests.push(payload);
      return Promise.resolve({ code: 'CANCEL' });
    },
  },
  BELLORE_CUSTOMER_FEEDBACK: {
    message(value) {
      const code = value && (value.code || value.error || value.message);
      return code === 'listing_reserved'
        ? '이 상품은 다른 결제 진행으로 잠시 예약되어 있습니다.'
        : '고객용 결제 안내';
    },
    paymentProviderFeedback() { return '고객용 결제 결과 안내'; },
  },
  location: locationObject,
  console: { warn(...args) { diagnostics.push(args); } },
  setTimeout(callback) { callback(); return 1; },
  open() {},
};
const sessionStorageObject = { setItem() {}, getItem() { return null; }, removeItem() {} };
const historyObject = { replaceState() {} };
const alertFunction = (message) => alerts.push(String(message));
Object.defineProperty(windowObject, 'BELLORE_PAYMENT_FLOW', {
  value: createPaymentFlow({ window: windowObject, notify: alertFunction }),
});
installLegacyCheckoutCoupon({ windowObject, documentObject });

const source = await readFile(new URL('../payments.js', import.meta.url), 'utf8');
vm.runInNewContext(source, {
  window: windowObject,
  document: documentObject,
  location: locationObject,
  history: historyObject,
  sessionStorage: sessionStorageObject,
  URLSearchParams,
  alert: alertFunction,
  console: { warn() {} },
});

documentObject.dispatch('DOMContentLoaded');
windowObject.BELLORE_openCheckout({
  listingId: 'listing-1',
  brand: 'HAMILTON',
  model: '재즈마스터 오픈하트',
  price: 1300,
  image: 'watch.jpg',
});
await Promise.resolve();
await Promise.resolve();

elements.coAgreeTerms.checked = true;
elements.coAgreePrivacy.checked = true;
elements.coAgreeOrder.checked = true;

assert.match(elements.coCouponSelect.innerHTML, /value="coupon-user-1"/, '사용 가능한 쿠폰 option이 실제로 렌더링되어야 합니다.');
elements.coCouponSelect.value = couponUser.id;
elements.coCouponSelect.dispatch('change');
assert.equal(elements.coTotal.textContent, '0원');
assert.equal(elements.coDiscountRow.hidden, false);
assert.equal(elements.coCouponClear.hidden, false);
assert.equal(elements.coCouponClear.disabled, false);

elements.coPayBtn.dispatch('click');
assert.equal(createOrderCalls.length, 0, '100원 미만 결제는 주문 생성 전에 차단되어야 합니다.');
assert.match(alerts.at(-1), /선택한 쿠폰을 적용하면/);

elements.coCouponClear.dispatch('click');
assert.equal(elements.coCouponSelect.value, '');
assert.equal(elements.coCouponClear.hidden, true);
assert.equal(elements.coDiscountRow.hidden, true);
assert.equal(elements.coTotal.textContent, '1,300원');
assert.equal(elements.coCouponMsg.textContent, '쿠폰 적용을 해제했습니다.');

elements.coPayBtn.dispatch('click');
await Promise.resolve();
await Promise.resolve();
await Promise.resolve();
await Promise.resolve();
await Promise.resolve();
assert.equal(createOrderCalls.length, 1);
assert.equal(createOrderCalls[0].couponUserId, null);
assert.equal(createOrderCalls[0].discount, 0);
assert.equal(createOrderCalls[0].amount, 1300);
assert.equal(paymentRequests.length, 1);
assert.equal(paymentRequests[0].totalAmount, 1300);
assert.equal(paymentRequests[0].redirectUrl, 'http://localhost:4173/?pay=portone',
  '모바일 결제는 승인 재확인이 있는 앱 루트로 돌아와야 합니다.');

confirmResponses = [
  { ok: false, pending: true, error: 'payment_confirmation_pending', retryAfterMs: 2000, httpStatus: 202 },
  { ok: false, pending: true, error: 'payment_confirmation_pending', retryAfterMs: 2000, httpStatus: 202 },
  { ok: true, order: { id: 'order-1', amount: 1300, listing_id: 'listing-1' }, httpStatus: 200 },
];
windowObject.PortOne.requestPayment = (payload) => {
  paymentRequests.push(payload);
  return Promise.resolve({ paymentId: 'ORDER-1' });
};
elements.coAgreeTerms.checked = true;
elements.coAgreePrivacy.checked = true;
elements.coAgreeOrder.checked = true;
elements.coPayBtn.dispatch('click');
for (let index = 0; index < 20; index += 1) await Promise.resolve();

assert.equal(createOrderCalls.length, 2, 'HTTP 202 재확인은 새 주문을 만들면 안 됩니다.');
assert.equal(paymentRequests.length, 2, 'HTTP 202 재확인은 결제창을 다시 열면 안 됩니다.');
assert.equal(confirmCalls.length, 3, '같은 승인 요청만 제한적으로 재확인해야 합니다.');
assert(confirmCalls.every((call) => call.paymentId === 'ORDER-1' && call.checkoutToken === 'TOKEN-1'));
assert.equal(elements.prTitle.textContent, '결제가 완료되었습니다');
assert.equal(listingRefreshes, 1, '결제 완료 뒤 카드 상태를 다시 불러와야 합니다.');
assert(diagnostics.filter((entry) => entry[1]?.code === 'payment_confirmation_pending').length >= 2);
assert(diagnostics.every((entry) => entry.length === 2 && !('message' in entry[1])), '로그에 오류 원문을 넣으면 안 됩니다.');

listingStatus = 'reserved';
const createsBeforeReserved = createOrderCalls.length;
const paymentsBeforeReserved = paymentRequests.length;
windowObject.BELLORE_openCheckout({
  listingId: 'listing-1', brand: 'HAMILTON', model: '재즈마스터 오픈하트',
  status: 'on_sale', price: 1300, image: 'watch.jpg',
});
await Promise.resolve();
await Promise.resolve();
elements.coAgreeTerms.checked = true;
elements.coAgreePrivacy.checked = true;
elements.coAgreeOrder.checked = true;
elements.coPayBtn.dispatch('click');
for (let index = 0; index < 8; index += 1) await Promise.resolve();
assert.equal(createOrderCalls.length, createsBeforeReserved, '예약중 전환은 주문 생성 전에 차단되어야 합니다.');
assert.equal(paymentRequests.length, paymentsBeforeReserved, '예약중 상품은 결제사 창을 열면 안 됩니다.');
assert.match(alerts.at(-1), /구매가 진행 중/);
assert.equal(elements.coPayBtn.disabled, true, '예약중 확인 뒤 결제 버튼은 다시 활성화되면 안 됩니다.');
assert.equal(elements.coPayBtn.textContent, '예약중');

console.log('checkout coupon, listing preflight, and bounded confirmation retry runtime: ok');
