import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { installLegacyCheckoutCoupon } from '../app/legacy/checkout-coupon.js';

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
    createOrder(payload) {
      createOrderCalls.push(payload);
      return Promise.resolve({ orderNo: 'ORDER-1', checkoutToken: 'TOKEN-1', amount: payload.amount });
    },
    confirmOrder() { return Promise.resolve({ ok: true }); },
  },
  PortOne: {
    requestPayment(payload) {
      paymentRequests.push(payload);
      return Promise.resolve({ code: 'CANCEL' });
    },
  },
  BELLORE_CUSTOMER_FEEDBACK: {
    message() { return '고객용 결제 안내'; },
    paymentProviderFeedback() { return '고객용 결제 결과 안내'; },
  },
  location: locationObject,
  open() {},
};
const sessionStorageObject = { setItem() {}, getItem() { return null; } };
const historyObject = { replaceState() {} };
const alertFunction = (message) => alerts.push(String(message));
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
assert.equal(createOrderCalls.length, 1);
assert.equal(createOrderCalls[0].couponUserId, null);
assert.equal(createOrderCalls[0].discount, 0);
assert.equal(createOrderCalls[0].amount, 1300);
assert.equal(paymentRequests.length, 1);
assert.equal(paymentRequests[0].totalAmount, 1300);

console.log('checkout coupon select, minimum amount, clear, and retry runtime: ok');
