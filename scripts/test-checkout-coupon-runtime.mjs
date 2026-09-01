import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { installLegacyCheckoutCoupon } from '../app/legacy/checkout-coupon.js';
import { createPaymentFlow } from '../app/features/checkout/payment-flow.js';
import { createPendingPaymentRecovery } from '../app/services/payments/pending-payment-recovery.js';
import { FakeDocument, FakeElement } from './helpers/fake-checkout-dom.mjs';

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
const completedCheckoutRequests = [];
let listingStatus = 'on_sale';
let couponsAvailable = true;
let pendingWriteFails = false;
let confirmResponses = [{ ok: false, error: 'payment_canceled', httpStatus: 409 }];
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
    myCoupons() { return Promise.resolve(couponsAvailable ? [couponUser] : []); },
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
      return Promise.resolve({ orderNo: 'ORDER-1', checkoutRequestKey: 'REQUEST-1', checkoutToken: 'TOKEN-1', amount: payload.amount });
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
  BELLORE_CHECKOUT_REQUEST_RECOVERY: {
    complete(requestKey) { completedCheckoutRequests.push(requestKey); },
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
const sessionValues = new Map();
const sessionStorageObject = {
  setItem(key, value) {
    if (pendingWriteFails && key === 'bellore_pending_order_v2') throw new Error('storage full');
    sessionValues.set(key, String(value));
  },
  getItem(key) { return sessionValues.has(key) ? sessionValues.get(key) : null; },
  removeItem(key) { sessionValues.delete(key); },
};
const historyObject = { replaceState() {} };
const alertFunction = (message) => alerts.push(String(message));
Object.defineProperty(windowObject, 'BELLORE_PENDING_PAYMENT_RECOVERY', {
  value: createPendingPaymentRecovery({
    location: locationObject, history: historyObject, getStorage: () => sessionStorageObject,
  }),
});
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
assert.equal(elements.coCouponSelect.value, '', '사용자가 고르지 않은 쿠폰을 자동 적용하면 안 됩니다.');
assert.equal(elements.coTotal.textContent, '1,300원');
assert.equal(elements.coDiscountRow.hidden, true);
assert.equal(elements.coCouponClear.hidden, true);
assert.equal(elements.coCouponClear.disabled, true);

elements.coCouponSelect.value = couponUser.id;
elements.coCouponSelect.dispatch('change');
assert.equal(elements.coTotal.textContent, '0원');
assert.equal(elements.coDiscountRow.hidden, false);
assert.equal(elements.coCouponClear.hidden, false);
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
for (let index = 0; index < 12; index += 1) await Promise.resolve();
assert.equal(createOrderCalls.length, 1);
assert.equal(createOrderCalls[0].couponUserId, null);
assert.equal(createOrderCalls[0].discount, 0);
assert.equal(createOrderCalls[0].amount, 1300);
assert.equal(paymentRequests.length, 1);
assert.equal(paymentRequests[0].totalAmount, 1300);
assert.equal(paymentRequests[0].redirectUrl, 'http://localhost:4173/?pay=portone',
  '모바일 결제는 승인 재확인이 있는 앱 루트로 돌아와야 합니다.');
assert.equal(confirmCalls.length, 1, '결제창 취소도 같은 주문을 서버에서 한 번 확인해야 합니다.');
assert.equal(confirmCalls[0].paymentId, 'ORDER-1');
assert.equal(confirmCalls[0].checkoutToken, 'TOKEN-1');
assert.equal(confirmCalls[0].checkoutAbandoned, true);
assert.equal(completedCheckoutRequests[0], 'REQUEST-1',
  'response recovery identity clears only after pending order storage read-back succeeds');
assert.equal(elements.prTitle.textContent, '결제가 취소되었습니다');
assert.doesNotMatch(elements.prDesc.textContent, /payment_|provider_|permission|unauthorized|409/i,
  '취소 안내에 개발자 오류 코드를 노출하면 안 됩니다.');
assert.equal(listingRefreshes, 1, '서버가 취소를 확인한 뒤 상품 상태를 다시 불러와야 합니다.');

confirmResponses = [{ ok: false, error: 'payment_canceled', httpStatus: 409 }];
windowObject.PortOne.requestPayment = () => Promise.resolve({ code: 'FAILURE_TYPE_PG' });
elements.coAgreeTerms.checked = true;
elements.coAgreePrivacy.checked = true;
elements.coAgreeOrder.checked = true;
elements.coPayBtn.dispatch('click');
for (let index = 0; index < 12; index += 1) await Promise.resolve();
assert.equal(elements.prTitle.textContent, '결제를 시작하지 못했습니다');
assert.match(elements.prDesc.textContent, /결제된 금액은 없습니다/);
assert.doesNotMatch(elements.prTitle.textContent + elements.prDesc.textContent, /미완료/);

confirmResponses = [
  { ok: false, pending: true, error: 'payment_confirmation_pending', retryAfterMs: 2000, httpStatus: 202 },
  { ok: false, pending: true, error: 'payment_confirmation_pending', retryAfterMs: 2000, httpStatus: 202 },
  { ok: true, order: { id: 'order-1', amount: 1300, listing_id: 'listing-1' }, httpStatus: 200 },
];
const confirmsBeforeRetry = confirmCalls.length;
const refreshesBeforeRetry = listingRefreshes;
const createsBeforeRetry = createOrderCalls.length;
const paymentsBeforeRetry = paymentRequests.length;
windowObject.PortOne.requestPayment = (payload) => {
  paymentRequests.push(payload);
  return Promise.resolve({ paymentId: 'ORDER-1' });
};
elements.coAgreeTerms.checked = true;
elements.coAgreePrivacy.checked = true;
elements.coAgreeOrder.checked = true;
elements.coPayBtn.dispatch('click');
for (let index = 0; index < 20; index += 1) await Promise.resolve();

assert.equal(createOrderCalls.length, createsBeforeRetry + 1, 'HTTP 202 재확인은 새 주문을 만들면 안 됩니다.');
assert.equal(paymentRequests.length, paymentsBeforeRetry + 1, 'HTTP 202 재확인은 결제창을 다시 열면 안 됩니다.');
assert.equal(confirmCalls.length, confirmsBeforeRetry + 3, '같은 승인 요청만 제한적으로 재확인해야 합니다.');
assert(confirmCalls.slice(confirmsBeforeRetry)
  .every((call) => call.paymentId === 'ORDER-1' && call.checkoutToken === 'TOKEN-1'));
assert.equal(elements.prTitle.textContent, '결제가 완료되었습니다');
assert.equal(listingRefreshes, refreshesBeforeRetry + 1, '결제 완료 뒤 카드 상태를 다시 불러와야 합니다.');
assert(diagnostics.filter((entry) => entry[1]?.code === 'payment_confirmation_pending').length >= 2);
assert(diagnostics.every((entry) => entry.length === 2 && !('message' in entry[1])), '로그에 오류 원문을 넣으면 안 됩니다.');

couponsAvailable = false;
listingStatus = 'reserved';
const createsBeforeReserved = createOrderCalls.length;
const paymentsBeforeReserved = paymentRequests.length;
windowObject.BELLORE_openCheckout({
  listingId: 'listing-1', brand: 'HAMILTON', model: '재즈마스터 오픈하트',
  status: 'on_sale', price: 1300, image: 'watch.jpg',
});
await Promise.all([Promise.resolve(), Promise.resolve()]);
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

listingStatus = 'on_sale';
confirmResponses = [{ ok: false, error: 'payment_canceled', httpStatus: 409 }];
const confirmsBeforeRejection = confirmCalls.length;
const createsBeforeRejection = createOrderCalls.length;
windowObject.PortOne.requestPayment = () => Promise.reject(new Error('provider sdk connection lost'));
windowObject.BELLORE_openCheckout({
  listingId: 'listing-1', brand: 'HAMILTON', model: '재즈마스터 오픈하트',
  status: 'on_sale', price: 1300, image: 'watch.jpg',
});
await Promise.all([Promise.resolve(), Promise.resolve()]);
assert.equal(elements.coPayBtn.disabled, false); assert.equal(elements.coPayBtn.textContent, '결제하기');
elements.coAgreeTerms.checked = true;
elements.coAgreePrivacy.checked = true;
elements.coAgreeOrder.checked = true;
elements.coPayBtn.dispatch('click');
for (let index = 0; index < 12; index += 1) await Promise.resolve();
assert.equal(createOrderCalls.length, createsBeforeRejection + 1);
assert.equal(confirmCalls.length, confirmsBeforeRejection + 1, '주문 생성 뒤 결제 SDK가 거절해도 같은 주문을 서버에서 확인해야 합니다.');
assert.equal(confirmCalls.at(-1).paymentId, 'ORDER-1');
assert.equal(confirmCalls.at(-1).checkoutToken, 'TOKEN-1');
assert.equal(confirmCalls.at(-1).checkoutAbandoned, true);
assert.equal(elements.coPayBtn.disabled, false); assert.equal(elements.coPayBtn.textContent, '결제하기');

pendingWriteFails = true;
confirmResponses = [{ ok: false, error: 'payment_canceled', httpStatus: 409 }];
const createsBeforeStorageFailure = createOrderCalls.length;
const paymentsBeforeStorageFailure = paymentRequests.length;
const confirmsBeforeStorageFailure = confirmCalls.length;
const completedBeforeStorageFailure = completedCheckoutRequests.length;
windowObject.PortOne.requestPayment = (payload) => { paymentRequests.push(payload); return Promise.resolve({ paymentId: 'ORDER-1' }); };
windowObject.BELLORE_openCheckout({
  listingId: 'listing-1', brand: 'HAMILTON', model: '재즈마스터 오픈하트',
  status: 'on_sale', price: 1300, image: 'watch.jpg',
});
await Promise.all([Promise.resolve(), Promise.resolve()]);
elements.coAgreeTerms.checked = true; elements.coAgreePrivacy.checked = true; elements.coAgreeOrder.checked = true;
elements.coPayBtn.dispatch('click');
for (let index = 0; index < 12; index += 1) await Promise.resolve();
assert.equal(createOrderCalls.length, createsBeforeStorageFailure + 1);
assert.equal(paymentRequests.length, paymentsBeforeStorageFailure,
  'pending order storage failure must never open the payment provider');
assert.equal(confirmCalls.length, confirmsBeforeStorageFailure + 1,
  'storage failure must close or verify the same uncharged order on the server');
assert.equal(confirmCalls.at(-1).paymentId, 'ORDER-1');
assert.equal(confirmCalls.at(-1).checkoutToken, 'TOKEN-1');
assert.equal(confirmCalls.at(-1).checkoutAbandoned, true);
assert.equal(completedCheckoutRequests.length, completedBeforeStorageFailure,
  'the response-loss capability must remain until pending order storage succeeds');

pendingWriteFails = false;
confirmResponses = [{ ok: true, order: { id: 'recovered-order-id', amount: 1300, listing_id: 'listing-1' }, httpStatus: 200 }];
const originalCreateOrder = windowObject.NWBackend.createOrder;
windowObject.NWBackend.createOrder = (payload) => {
  createOrderCalls.push(payload);
  return Promise.resolve({
    recoveryOnly: true,
    orderNo: 'ORDER-RECOVERED', amount: 1300, listingId: 'listing-1', status: 'pending',
    checkoutRequestKey: 'REQUEST-RECOVERED', checkoutToken: 'b'.repeat(64),
  });
};
const paymentsBeforeRecoveredOrder = paymentRequests.length;
const confirmsBeforeRecoveredOrder = confirmCalls.length;
const completedBeforeRecoveredOrder = completedCheckoutRequests.length;
windowObject.BELLORE_openCheckout({
  listingId: 'listing-1', brand: 'HAMILTON', model: '재즈마스터 오픈하트',
  status: 'on_sale', price: 1300, image: 'watch.jpg',
});
await Promise.all([Promise.resolve(), Promise.resolve()]);
elements.coAgreeTerms.checked = true; elements.coAgreePrivacy.checked = true; elements.coAgreeOrder.checked = true;
elements.coPayBtn.dispatch('click');
for (let index = 0; index < 12; index += 1) await Promise.resolve();
assert.equal(paymentRequests.length, paymentsBeforeRecoveredOrder,
  'recoveryOnly 주문은 PortOne 결제창을 절대 다시 열면 안 됩니다.');
assert.equal(confirmCalls.length, confirmsBeforeRecoveredOrder + 1);
assert.equal(confirmCalls.at(-1).paymentId, 'ORDER-RECOVERED');
assert.equal(confirmCalls.at(-1).checkoutToken, 'b'.repeat(64));
assert.equal(confirmCalls.at(-1).checkoutAbandoned, true,
  '복구 주문은 결제창을 다시 열지 않고 provider 미승인 상태를 bounded 정리해야 합니다.');
assert.equal(completedCheckoutRequests.length, completedBeforeRecoveredOrder + 1,
  '복구 주문을 pending storage로 인계한 뒤 request capability를 정리해야 합니다.');
assert.equal(completedCheckoutRequests.at(-1), 'REQUEST-RECOVERED');

pendingWriteFails = true;
confirmResponses = [{ ok: false, error: 'payment_canceled', httpStatus: 409 }];
const paymentsBeforeUnstoredRecovery = paymentRequests.length;
const confirmsBeforeUnstoredRecovery = confirmCalls.length;
const completedBeforeUnstoredRecovery = completedCheckoutRequests.length;
windowObject.BELLORE_openCheckout({
  listingId: 'listing-1', brand: 'HAMILTON', model: '재즈마스터 오픈하트',
  status: 'on_sale', price: 1300, image: 'watch.jpg',
});
await Promise.all([Promise.resolve(), Promise.resolve()]);
elements.coAgreeTerms.checked = true; elements.coAgreePrivacy.checked = true; elements.coAgreeOrder.checked = true;
elements.coPayBtn.dispatch('click');
for (let index = 0; index < 12; index += 1) await Promise.resolve();
assert.equal(paymentRequests.length, paymentsBeforeUnstoredRecovery,
  '복구 주문 저장 실패도 PortOne 결제창을 다시 열면 안 됩니다.');
assert.equal(confirmCalls.length, confirmsBeforeUnstoredRecovery + 1,
  '복구 정보를 저장하지 못해도 같은 기존 주문의 서버 상태만 확인해야 합니다.');
assert.equal(confirmCalls.at(-1).checkoutAbandoned, true);
assert.equal(completedCheckoutRequests.length, completedBeforeUnstoredRecovery,
  '복구 정보를 저장하지 못하면 request capability를 보존해야 합니다.');
pendingWriteFails = false;
windowObject.NWBackend.createOrder = originalCreateOrder;

for (const code of ['payment_automatically_refunded', 'payment_refund_in_progress', 'payment_refund_pending', 'payment_refunded']) {
  const view = windowObject.BELLORE_PAYMENT_FLOW.confirmationPresentation({ error: code }, 'ORDER-1');
  assert.equal(view.clearPending, true);
  assert.equal(view.refreshListings, true);
}

console.log('checkout coupon, listing preflight, and bounded confirmation retry runtime: ok');
