import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCheckoutClient } from '../app/services/payments/checkout-client.js';
import { createPaymentNetwork } from '../app/services/payments/payment-network.js';
import { createPendingPaymentRecovery } from '../app/services/payments/pending-payment-recovery.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(join(root, file), 'utf8').replace(/\r\n?/g, '\n');

let timerCallback = null;
let cleared = false;
let passedSignal = null;
class FakeAbortController {
  constructor() {
    const listeners = [];
    this.signal = { aborted: false, addEventListener: (_name, fn) => listeners.push(fn) };
    this.abort = () => { this.signal.aborted = true; listeners.forEach((fn) => fn()); };
  }
}
const network = createPaymentNetwork({
  fetchImpl: (_url, options) => {
    passedSignal = options.signal;
    return new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
  },
  AbortControllerImpl: FakeAbortController,
  setTimer: (fn) => { timerCallback = fn; return 7; },
  clearTimer: (id) => { assert.equal(id, 7); cleared = true; },
});
const pendingRequest = network.request('/checkout', { method: 'POST' }, 30_000);
await Promise.resolve();
assert(passedSignal && !passedSignal.aborted);
timerCallback();
await assert.rejects(pendingRequest, (error) => error.name === 'AbortError');
assert.equal(cleared, true);

let syncThrowClears = 0;
const syncThrowNetwork = createPaymentNetwork({
  fetchImpl() { throw new Error('synchronous fetch failure'); },
  AbortControllerImpl: FakeAbortController,
  setTimer: () => 8,
  clearTimer: (id) => { assert.equal(id, 8); syncThrowClears += 1; },
});
await assert.rejects(syncThrowNetwork.request('/checkout'), /synchronous fetch failure/);
assert.equal(syncThrowClears, 1, '동기 fetch 예외도 timeout timer를 반드시 정리해야 합니다.');

const checkoutClient = createCheckoutClient();
const previousAttempt = { requestKey: '11111111-1111-4111-8111-111111111111', checkoutToken: 'b'.repeat(64) };
const recoveryRequests = [];
let completedPrevious = 0;
const recoveredOrder = await checkoutClient.create({
  data: { listingId: 'listing-new', amount: 1400 },
  profile: null,
  paymentConfig: { checkoutUrl: '/checkout' },
  anonKey: 'anon-key',
  recovery: {
    async prepare() { throw Object.assign(new Error('checkout_request_changed'), { code: 'checkout_request_changed' }); },
    current: () => previousAttempt,
    complete() { completedPrevious += 1; },
    discardIfSafe() {},
  },
  getAccessToken: async () => 'access-token',
  request: async (_url, options, timeoutMs) => {
    recoveryRequests.push({ body: JSON.parse(options.body), timeoutMs });
    return new Response(JSON.stringify({
      exists: true, status: 'pending', orderNo: 'BLR-RECOVERED-1', amount: 1300,
      listingId: 'listing-old', checkoutRequestKey: previousAttempt.requestKey,
      checkoutToken: previousAttempt.checkoutToken,
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  },
});
assert.equal(recoveredOrder.recoveryOnly, true);
assert.equal(recoveredOrder.orderNo, 'BLR-RECOVERED-1');
assert.deepEqual(recoveryRequests, [{
  body: { action: 'recover', checkoutRequestKey: previousAttempt.requestKey, checkoutToken: previousAttempt.checkoutToken },
  timeoutMs: 15_000,
}]);
assert.equal(completedPrevious, 0, '복구 조회만으로 미확정 주문 capability를 지우면 안 됩니다.');

const sameAttempt = { requestKey: '22222222-2222-4222-8222-222222222222', checkoutToken: 'c'.repeat(64) };
const samePayloadRequests = [];
const samePayloadRecovered = await checkoutClient.create({
  data: { listingId: 'listing-same', amount: 1300 }, profile: null,
  paymentConfig: { checkoutUrl: '/checkout' }, anonKey: 'anon-key',
  recovery: {
    prepare: async () => sameAttempt, current: () => sameAttempt,
    complete() { throw new Error('unresolved order must remain recoverable'); },
    discardIfSafe() {},
  },
  getAccessToken: async () => 'access-token',
  request: async (_url, options) => {
    const body = JSON.parse(options.body); samePayloadRequests.push(body);
    if (body.action === 'recover') return new Response(JSON.stringify({
      exists: true, status: 'pending', orderNo: 'BLR-SAME-1', amount: 1300,
      listingId: 'listing-same', checkoutRequestKey: sameAttempt.requestKey,
      checkoutToken: sameAttempt.checkoutToken,
    }), { status: 200 });
    return new Response(JSON.stringify({ error: 'checkout_request_conflict' }), { status: 409 });
  },
});
assert.equal(samePayloadRecovered.recoveryOnly, true);
assert.deepEqual(samePayloadRequests.map((body) => body.action || 'create'), ['create', 'recover'],
  '같은 payload 충돌은 새 결제 생성 없이 기존 주문을 한 번만 조회해야 합니다.');

const oldAttempt = { requestKey: '33333333-3333-4333-8333-333333333333', checkoutToken: 'd'.repeat(64) };
const newAttempt = { requestKey: '44444444-4444-4444-8444-444444444444', checkoutToken: 'e'.repeat(64) };
let terminalPrepareCount = 0;
let terminalCompleteCount = 0;
const terminalRequests = [];
const recreated = await checkoutClient.create({
  data: { listingId: 'listing-recreate', amount: 1300 }, profile: null,
  paymentConfig: { checkoutUrl: '/checkout' }, anonKey: 'anon-key',
  recovery: {
    prepare: async () => (++terminalPrepareCount === 1 ? oldAttempt : newAttempt),
    current: () => oldAttempt,
    complete: (key) => { assert.equal(key, oldAttempt.requestKey); terminalCompleteCount += 1; },
    discardIfSafe() {},
  },
  getAccessToken: async () => 'access-token',
  request: async (_url, options) => {
    const body = JSON.parse(options.body); terminalRequests.push(body);
    if (body.action === 'recover') return new Response(JSON.stringify({
      exists: false, checkoutRequestKey: oldAttempt.requestKey, checkoutToken: oldAttempt.checkoutToken,
    }), { status: 200 });
    if (body.checkoutRequestKey === oldAttempt.requestKey) {
      return new Response(JSON.stringify({ error: 'checkout_request_conflict' }), { status: 409 });
    }
    return new Response(JSON.stringify({
      orderNo: 'BLR-NEW-1', amount: 1300,
      checkoutRequestKey: newAttempt.requestKey, checkoutToken: newAttempt.checkoutToken,
    }), { status: 200 });
  },
});
assert.equal(recreated.orderNo, 'BLR-NEW-1');
assert.equal(terminalPrepareCount, 2);
assert.equal(terminalCompleteCount, 1);
assert.deepEqual(terminalRequests.map((body) => body.action || body.checkoutRequestKey),
  [oldAttempt.requestKey, 'recover', newAttempt.requestKey],
  'terminal 충돌 복구는 기존 조회 후 새 요청을 정확히 한 번만 생성해야 합니다.');

function storage(initial = null) {
  const values = new Map();
  if (initial) values.set('bellore_pending_order_v2', JSON.stringify(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
    value: (key) => values.get(key) ?? null,
  };
}

const token = 'a'.repeat(64);
const store = storage({ orderNo: 'BLR-RECOVERY-1', checkoutToken: token, amount: 1300, createdAt: 1000 });
const location = { search: '', pathname: '/', hash: '' };
const replaced = [];
let clock = 5000;
const recovery = createPendingPaymentRecovery({
  location,
  history: { replaceState: (_state, _title, url) => replaced.push(url) },
  getStorage: () => store,
  now: () => clock,
});
const verifies = [];
const results = [];
const callbacks = {
  verify: (...args) => verifies.push(args),
  showResult: (...args) => results.push(args),
  customerMessage: () => '안전한 안내',
};
assert.equal(recovery.handle(callbacks).reason, 'pending_rechecked');
assert.deepEqual(verifies[0], ['BLR-RECOVERY-1', null, null, token, false]);
assert.equal(JSON.parse(store.value('bellore_pending_order_v2')).retryCount, 1);
clock = 6000;
assert.equal(recovery.handle(callbacks).reason, 'retry_throttled');
assert.equal(verifies.length, 1);

clock = 9000;
location.search = '?pay=portone&paymentId=BLR-RECOVERY-1&utm_source=test';
assert.equal(recovery.handle(callbacks).reason, 'callback_verified');
assert.equal(verifies.length, 2);
assert.equal(replaced.at(-1), '/?utm_source=test');

location.search = '?pay=portone&paymentId=BLR-OTHER';
assert.equal(recovery.handle(callbacks).reason, 'payment_id_mismatch');
assert.equal(verifies.length, 2);
assert.match(results.at(-1)[2], /다시 결제하지 말고/);

const emptyStore = storage();
const cancelLocation = { search: '?pay=portone&code=PAY_PROCESS_CANCEL', pathname: '/', hash: '' };
const cancelResults = [];
const cancelRecovery = createPendingPaymentRecovery({
  location: cancelLocation,
  history: { replaceState() {} },
  getStorage: () => emptyStore,
  now: () => 10_000,
});
assert.equal(cancelRecovery.handle({ ...callbacks, showResult: (...args) => cancelResults.push(args) }).reason, 'explicit_cancel');
assert.equal(cancelResults[0][1], '결제가 취소되었습니다');
assert.equal(cancelResults[0][2], '결제는 진행되지 않았습니다.');

const historyFailureStore = storage({ orderNo: 'BLR-RECOVERY-3', checkoutToken: token, amount: 1300, createdAt: 1000 });
const historyFailureVerifies = [];
const historyFailureRecovery = createPendingPaymentRecovery({
  location: { search: '?pay=portone&paymentId=BLR-RECOVERY-3', pathname: '/', hash: '' },
  history: { replaceState() { throw new Error('history unavailable'); } },
  getStorage: () => historyFailureStore,
  now: () => 5000,
});
assert.equal(historyFailureRecovery.handle({
  ...callbacks, verify: (...args) => historyFailureVerifies.push(args),
}).reason, 'callback_verified');
assert.equal(historyFailureVerifies.length, 1, 'URL 정리 실패가 기존 주문 확인을 막으면 안 됩니다.');

const ignoredWriteStore = storage({ orderNo: 'BLR-STALE-1', checkoutToken: 'f'.repeat(64), amount: 1300, listingId: 'listing-old', createdAt: 1000 });
ignoredWriteStore.setItem = () => {};
const ignoredWriteRecovery = createPendingPaymentRecovery({
  location: { search: '', pathname: '/', hash: '' }, history: { replaceState() {} },
  getStorage: () => ignoredWriteStore, now: () => 5000,
});
assert.equal(ignoredWriteRecovery.capture({
  orderNo: 'BLR-NEW-CAPTURE', checkoutToken: token, amount: 1300, listingId: 'listing-new',
}), null, 'setItem이 새 값을 보존하지 못하면 capture 성공으로 처리하면 안 됩니다.');

const writeFailureStore = storage({ orderNo: 'BLR-RECOVERY-2', checkoutToken: token, amount: 1300, createdAt: 1000 });
writeFailureStore.setItem = () => { throw new Error('storage full'); };
const writeFailureResults = [];
const writeFailureVerifies = [];
const writeFailureRecovery = createPendingPaymentRecovery({
  location: { search: '', pathname: '/', hash: '' },
  history: { replaceState() {} },
  getStorage: () => writeFailureStore,
  now: () => 5000,
});
assert.equal(writeFailureRecovery.handle({
  verify: (...args) => writeFailureVerifies.push(args),
  showResult: (...args) => writeFailureResults.push(args),
  customerMessage: () => '안전한 안내',
}).reason, 'pending_write_failed');
assert.equal(writeFailureVerifies.length, 0, '재확인 횟수를 저장하지 못하면 네트워크 재확인을 시작하면 안 됩니다.');
assert.match(writeFailureResults[0][2], /다시 결제하지 말고/);

const payments = read('payments.js');
const backend = read('supabase.js');
const checkoutClientSource = read('app/services/payments/checkout-client.js');
const worker = read('sw.js');
assert.match(payments, /checkoutGeneration \+= 1/);
assert.match(payments, /requestProduct !== product \|\| requestGeneration !== checkoutGeneration/);
assert.match(payments, /BELLORE_PENDING_PAYMENT_RECOVERY/);
assert.match(payments, /order\.recoveryOnly === true[\s\S]*?verifyPayment\(order\.orderNo, null, order\.listingId, order\.checkoutToken, true, true\)/,
  '응답 유실 주문은 기존 주문 확인만 해야 합니다.');
const recoveryOnlyBranch = payments.slice(payments.indexOf('order && order.recoveryOnly === true'), payments.indexOf("if (!Number.isSafeInteger(serverAmount) || serverAmount !== amount)"));
assert.doesNotMatch(recoveryOnlyBranch, /PortOne\.requestPayment/, '복구 전용 분기는 결제사 창을 절대 다시 열면 안 됩니다.');
assert.match(backend, /client\.create\(\{[\s\S]*?request: paymentFetch/);
assert.match(checkoutClientSource, /request\(paymentConfig\.checkoutUrl,[\s\S]*?\}, 30_000\)/);
assert.match(backend, /paymentFetch\(PAY\.confirmUrl,[\s\S]*?\}, 75000\)/);
assert.match(worker, /paymentReturn[\s\S]*res\.status === 200 && !paymentReturn/);
assert.match(worker, /paymentReturn \? null : await caches\.match\(req\)/);

console.log('payment client recovery, timeout, and stale-attempt guards: ok');
