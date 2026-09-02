import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  createOrderCancellationController,
  orderCancelQuestion,
} from '../app/features/mypage-personal-shop/mypage-requested-actions.js';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('주문 상태별 취소 확인 문구를 표시한다', () => {
  assert.equal(orderCancelQuestion('paid'), '배송 준비 중입니다.\n주문을 취소할까요?');
  assert.equal(orderCancelQuestion('shipping'), '현재 배송중입니다.\n배송완료 후 주문을 취소할까요?');
  assert.equal(orderCancelQuestion('delivered'), '배송이 완료되었습니다.\n주문을 취소할까요?');
});

test('네를 누르면 서버 요청 후 정확한 접수 안내를 표시한다', async () => {
  const calls = [];
  const notices = [];
  const events = [];
  const controller = createOrderCancellationController({
    document: { dispatchEvent: (event) => events.push(event.type) },
    window: {
      CustomEvent: class CustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } },
      bellConfirm: async (question) => { calls.push(['confirm', question]); return true; },
      alert: (notice) => notices.push(notice),
    },
    backend: {
      requestCancel: async (orderNo, reason) => { calls.push(['request', orderNo, reason]); return 'cancel_req'; },
    },
  });
  const button = { disabled: false };
  const status = await controller.request({ orderNo: 'ORDER-1', status: 'shipping', button });

  assert.equal(status, 'cancel_req');
  assert.deepEqual(calls, [
    ['confirm', '현재 배송중입니다.\n배송완료 후 주문을 취소할까요?'],
    ['request', 'ORDER-1', '배송중 고객 주문취소 요청'],
  ]);
  assert.deepEqual(notices, ['주문취소 요청이 접수되었습니다.\n담당자가 확인 후 연락드리겠습니다.']);
  assert.deepEqual(events, ['bellore:mypage-order-refresh', 'bellore:order-cancel-complete']);
  assert.equal(button.disabled, false);
});

test('배송완료까지 취소요청으로 접수하고 관리자와 Telegram에 알린다', async () => {
  const migration = await read('supabase/migrations/20260902131852_order_cancel_request_telegram.sql');
  const action = await read('app/features/mypage-personal-shop/mypage-requested-actions.js');

  assert.match(migration, /status in \('paid', 'inspecting', 'preparing', 'shipping', 'delivered'\)/);
  assert.match(migration, /v_new_status := 'cancel_req'/);
  assert.match(migration, /event_type, target, payload[\s\S]*'order_cancel_requested'[\s\S]*'order_room'/);
  assert.match(migration, /insert into public\.notifications[\s\S]*'order_cancel_request'/);
  assert.match(migration, /customer_id is distinct from auth\.uid\(\)/);
  assert.match(migration, /revoke all on function public\.order_request_cancel\(text,text\)[\s\S]*from public, anon/);
  assert.match(action, /주문취소 요청이 접수되었습니다\.\\n담당자가 확인 후 연락드리겠습니다\./);
  assert.doesNotMatch(action, /bellPrompt\('주문을 취소합니다/);
});

test('모든 주문취소는 정밀검수 완료 기록 뒤에만 환불한다', async () => {
  const migration = await read('supabase/migrations/20260902131852_order_cancel_request_telegram.sql');
  const cancellation = await read('supabase/functions/cancel-payment/index.ts');
  const backend = await read('supabase.js');
  const ui = await read('script.js');

  assert.match(migration, /add column if not exists cancel_inspected_at timestamptz/);
  assert.match(migration, /create or replace function public\.admin_mark_order_cancel_inspected/);
  assert.match(migration, /v_order\.status <> 'cancel_req' then raise exception 'BAD_STATE'/);
  assert.match(migration, /old\.status = 'cancel_req'[\s\S]*new\.status in \('canceled', 'refund_pending', 'refunded'\)[\s\S]*CANCEL_INSPECTION_REQUIRED/);
  assert.match(cancellation, /select\("id,order_no,status,amount,payment_key,refund_amount,cancel_inspected_at"\)/);
  assert.match(cancellation, /order\.status !== "cancel_req" \|\| !order\.cancel_inspected_at/);
  assert.match(backend, /admin_mark_order_cancel_inspected/);
  assert.match(ui, /취소요청 · 정밀검수 중/);
  assert.match(ui, /정밀검수 완료 · 취소처리 대기/);
  assert.match(ui, /정밀검수를 완료한 취소요청 주문만 환불할 수 있습니다/);
});
