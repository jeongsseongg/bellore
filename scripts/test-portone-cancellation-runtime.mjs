import assert from 'node:assert/strict';
import {
  cancelAndReconcile,
  finalizeKnownProviderCancellation,
  queueCancellationIntent,
} from '../supabase/functions/_shared/portone-cancellation.ts';

const originalFetch = globalThis.fetch;
const setFetch = (value) => Object.defineProperty(globalThis, 'fetch', {
  configurable: true, writable: true, value,
});
const baseInput = {
  operationControl: 'cancel_payment',
  apiBase: 'https://api.portone.test',
  apiSecret: 'secret',
  storeId: 'store-live',
  paymentId: 'payment-1',
  orderNo: 'order-1',
  refundAmount: 1300,
  intentCode: 'amount_mismatch_auto_cancel',
  reason: 'customer_safe_reason',
};

function response(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function adminRecorder(options = {}) {
  const calls = [];
  return {
    calls,
    admin: {
      rpc(name, args) {
        calls.push({ name, args });
        if (name === 'read_payment_operation_control_v1') {
          if (options.failGuard) return Promise.resolve({ data: null, error: { message: 'guard unavailable' } });
          return Promise.resolve({ data: true, error: null });
        }
        if (name === 'is_payment_operation_hash_held_v1') {
          if (options.failGuard) return Promise.resolve({ data: null, error: { message: 'guard unavailable' } });
          return Promise.resolve({ data: options.held === true, error: null });
        }
        if (name === 'finalize_order_refund_v2') {
          if (options.failFinalize) return Promise.resolve({ data: null, error: { message: 'refund_amount_mismatch' } });
          return Promise.resolve({ data: { ok: true }, error: null });
        }
        if (options.failFollowupMarker && calls.filter((call) => call.name === 'mark_order_refund_pending').length > 1) {
          return Promise.resolve({ data: false, error: { message: 'followup marker failed' } });
        }
        return Promise.resolve({ data: true, error: null });
      },
    },
  };
}

try {
  {
    let providerCalled = false;
    setFetch(async () => {
      providerCalled = true;
      throw new Error('durable queue must not call PortOne inside webhook latency');
    });
    const recorder = adminRecorder();
    assert.equal(await queueCancellationIntent(
      recorder.admin, 'order-queued', 'amount_mismatch_auto_cancel', 'payment_webhook',
    ), true);
    assert.deepEqual(recorder.calls.at(-1), {
      name: 'mark_order_refund_pending',
      args: {
        p_order_no: 'order-queued',
        p_reason: 'cancellation_intent:amount_mismatch_auto_cancel',
      },
    });
    assert.equal(providerCalled, false,
      'webhook must return after durable intent and leave provider cancellation to reconciliation');
  }

  {
    let providerCalled = false;
    setFetch(async () => {
      providerCalled = true;
      throw new Error('held cancellation must not call PortOne');
    });
    const recorder = adminRecorder({ held: true });
    const result = await cancelAndReconcile({ ...baseInput, admin: recorder.admin });
    assert.equal(providerCalled, false);
    assert.equal(result.dbFinalized, false);
    assert.equal(recorder.calls.some((call) => call.name === 'mark_order_refund_pending'), false,
      'held cancellation must stop before durable intent mutation');
  }

  {
    let providerCalled = false;
    setFetch(async () => {
      providerCalled = true;
      throw new Error('unavailable guard must not call PortOne');
    });
    const recorder = adminRecorder({ failGuard: true });
    const result = await cancelAndReconcile({ ...baseInput, admin: recorder.admin });
    assert.equal(providerCalled, false);
    assert.equal(result.dbFinalized, false);
    assert.equal(recorder.calls.some((call) => call.name === 'mark_order_refund_pending'), false);
  }

  {
    const requests = [];
    setFetch(async (_url, init) => {
      requests.push(init);
      return response({ cancellation: { id: 'cancel-1', status: 'SUCCEEDED', totalAmount: 1300 } });
    });
    const recorder = adminRecorder();
    const result = await cancelAndReconcile({ ...baseInput, admin: recorder.admin });
    const body = JSON.parse(requests[0].body);
    assert.equal(body.amount, 1300);
    assert.equal(body.currentCancellableAmount, 1300);
    assert.equal(body.reason, '벨로르 결제 취소');
    const finalize = recorder.calls.find((call) => call.name === 'finalize_order_refund_v2');
    assert.equal(finalize.args.p_refund_amount, 1300,
      '전액 취소 요청과 PortOne 누적 취소액이 같을 때만 DB 환불을 확정해야 합니다.');
    assert.equal(result.dbFinalized, true);
    assert.equal(result.cancelledAmount, 1300);
  }

  {
    let requestCount = 0;
    setFetch(async () => {
      requestCount += 1;
      return requestCount === 1
        ? response({ error: 'response_lost' }, 500)
        : response({ storeId: 'store-live', status: 'CANCELLED', amount: { cancelled: 1300 } });
    });
    const recorder = adminRecorder();
    const result = await cancelAndReconcile({ ...baseInput, admin: recorder.admin });
    const finalize = recorder.calls.find((call) => call.name === 'finalize_order_refund_v2');
    assert.equal(finalize.args.p_refund_amount, 1300,
      'POST 응답 복구 조회도 전액 취소가 확인돼야 DB를 확정해야 합니다.');
    assert.equal(result.recovered, true);
    assert.equal(result.cancelledAmount, 1300);
  }

  {
    let requestCount = 0;
    setFetch(async () => {
      requestCount += 1;
      if (requestCount === 1) throw new DOMException('connection ended', 'AbortError');
      return response({ storeId: 'store-live', status: 'CANCELLED', amount: { cancelled: 1300 } });
    });
    const recorder = adminRecorder();
    const result = await cancelAndReconcile({ ...baseInput, admin: recorder.admin });
    assert.equal(requestCount, 2, '취소 POST 응답 유실 시 provider 결제 조회로 즉시 복구해야 합니다.');
    assert.equal(result.recovered, true);
    assert.equal(result.dbFinalized, true);
  }

  {
    setFetch(async () => response({ cancellation: { id: 'cancel-partial', status: 'SUCCEEDED', totalAmount: 900 } }));
    const recorder = adminRecorder();
    const result = await cancelAndReconcile({ ...baseInput, admin: recorder.admin });
    assert.equal(recorder.calls.some((call) => call.name === 'finalize_order_refund_v2'), false,
      '일부 금액만 취소되면 상품을 다시 판매 가능으로 열면 안 됩니다.');
    assert.equal(result.dbFinalized, false);
    assert.equal(result.cancelledAmount, 900);
    assert.equal(result.tracked, true);
  }

  {
    setFetch(async () => response({ cancellation: { id: 'cancel-2', status: 'SUCCEEDED' } }));
    const recorder = adminRecorder({ failFollowupMarker: true });
    const result = await cancelAndReconcile({ ...baseInput, admin: recorder.admin });
    assert.equal(recorder.calls.some((call) => call.name === 'finalize_order_refund_v2'), false,
      '실제 취소액이 없으면 환불 완료 DB 확정을 하면 안 됩니다.');
    assert.equal(result.dbFinalized, false);
    assert.equal(result.providerRefunded, true);
    assert.equal(result.tracked, true,
      '선기록이 성공했으면 후속 메모 실패가 복구 추적 상태를 지우면 안 됩니다.');
  }

  {
    setFetch(async () => response({ cancellation: { id: 'cancel-3', status: 'REQUESTED' } }));
    const recorder = adminRecorder({ failFollowupMarker: true });
    const result = await cancelAndReconcile({ ...baseInput, admin: recorder.admin });
    assert.equal(result.state, 'requested');
    assert.equal(result.tracked, true,
      '취소 의도 선기록 뒤 후속 상태 메모가 실패해도 추적 가능 상태입니다.');
  }

  {
    const recorder = adminRecorder();
    const result = await finalizeKnownProviderCancellation({
      admin: recorder.admin,
      operationControl: 'reconcile_payments',
      orderNo: 'order-provider-cancelled-full',
      refundAmount: 1300,
      expectedOrderAmount: 1300,
      reason: 'provider_cancelled_full_amount',
    });
    const finalize = recorder.calls.find((call) => call.name === 'finalize_order_refund_v2');
    assert.equal(finalize.args.p_refund_amount, 1300,
      '이미 취소된 결제도 주문 전액 1,300원이 확인될 때만 DB 환불을 확정해야 합니다.');
    assert.equal(result.dbFinalized, true);
  }

  {
    const recorder = adminRecorder({ failFinalize: true });
    const result = await finalizeKnownProviderCancellation({
      admin: recorder.admin,
      operationControl: 'reconcile_payments',
      orderNo: 'order-provider-cancelled-partial',
      refundAmount: 900,
      expectedOrderAmount: 1300,
      reason: 'provider_cancelled_partial_amount',
    });
    assert.equal(recorder.calls.some((call) => call.name === 'finalize_order_refund_v2'), true,
      'helper가 금액 불일치를 선판정하면 기존 durable 자동취소 intent를 이용한 응답유실 복구가 막힙니다.');
    assert.equal(recorder.calls.at(-1).name, 'mark_order_payment_review');
    assert.equal(result.dbFinalized, false);
    assert.equal(result.cancelledAmount, 900);
    assert.equal(result.tracked, true);
  }

  {
    const recorder = adminRecorder();
    const result = await finalizeKnownProviderCancellation({
      admin: recorder.admin,
      operationControl: 'reconcile_payments',
      orderNo: 'order-auto-cancel-response-lost',
      refundAmount: 1100,
      expectedOrderAmount: 1000,
      reason: 'provider_cancelled_after_amount_mismatch_auto_cancel',
    });
    const finalize = recorder.calls.find((call) => call.name === 'finalize_order_refund_v2');
    assert.equal(finalize.args.p_refund_amount, 1100,
      '취소 승인 뒤 호출자가 종료돼도 webhook/reconcile이 실제 취소액을 DB durable intent에 재검증시켜야 합니다.');
    assert.equal(result.dbFinalized, true);
    assert.equal(result.cancelledAmount, 1100);
  }

  {
    const recorder = adminRecorder();
    const result = await finalizeKnownProviderCancellation({
      admin: recorder.admin,
      operationControl: 'reconcile_payments',
      orderNo: 'order-provider-cancelled-missing-total',
      refundAmount: 1300,
      expectedOrderAmount: Number.NaN,
      reason: 'provider_cancelled_missing_order_total',
    });
    assert.equal(recorder.calls.some((call) => call.name === 'finalize_order_refund_v2'), false,
      '주문 총액이 유효한 양의 안전 정수가 아니면 환불 확정을 금지해야 합니다.');
    assert.equal(recorder.calls.at(-1).name, 'mark_order_payment_review');
    assert.equal(result.dbFinalized, false);
    assert.equal(result.tracked, true);
  }
} finally {
  setFetch(originalFetch);
}

console.log('PortOne cancellation actual-amount and durable-intent runtime: ok');
