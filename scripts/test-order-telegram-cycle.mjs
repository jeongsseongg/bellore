import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { buildOrderAdvanceCallback, parseCallback, parseOrderAdvanceCommand } from '../supabase/functions/_shared/telegram-ops-core.mjs';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('주문 운영 명령을 순차 단계로 해석한다', () => {
  assert.deepEqual(parseOrderAdvanceCommand('/7471 검수완료'), { inputKey:'7471', action:'inspection_complete', label:'검수완료' });
  assert.deepEqual(parseOrderAdvanceCommand('/7471 배송시작 CJ대한통운 1234-5678'), { inputKey:'7471', action:'shipping', label:'배송시작', courier:'CJ대한통운', trackingNo:'1234-5678' });
  assert.deepEqual(parseOrderAdvanceCommand('/7471 배송완료'), { inputKey:'7471', action:'delivered', label:'배송완료' });
  assert.deepEqual(parseOrderAdvanceCommand('/7471 픽업완료'), { inputKey:'7471', action:'pickup_delivered', label:'픽업완료' });
  assert.equal(parseOrderAdvanceCommand('/7471 배송시작'), null);
});

test('배송 callback은 Telegram 64바이트 제한 안에서 왕복한다', () => {
  const value=buildOrderAdvanceCallback('7471','shipping','CJ대한통운','1234-5678');
  assert.ok(new TextEncoder().encode(value).length<=64);
  assert.deepEqual(parseCallback(value), { kind:'order_advance', inputKey:'7471', action:'shipping', courier:'CJ대한통운', trackingNo:'1234-5678' });
});

test('DB RPC는 순차 상태·운송장·고객알림·Telegram outbox를 함께 보장한다', async () => {
  const sql=await read('supabase/migrations/20260902170000_order_full_lifecycle_notifications.sql');
  assert.match(sql,/ORDER_NOT_INSPECTING/);
  assert.match(sql,/ORDER_NOT_PREPARING/);
  assert.match(sql,/ORDER_TRACKING_REQUIRED/);
  assert.match(sql,/insert into public\.notifications[\s\S]*'order_'\|\|new\.status/);
  assert.match(sql,/'order_status_changed','order_room'/);
  assert.match(sql,/revoke all on function public\.telegram_ops_advance_order[\s\S]*authenticated/);
  assert.match(sql,/grant execute[\s\S]*to service_role/);
});

test('Edge는 주문 상태 명령과 callback을 전용 모듈에 위임한다', async () => {
  const index=await read('supabase/functions/telegram-ops/index.ts');
  const module=await read('supabase/functions/telegram-ops/telegram-order-cycle.mjs');
  assert.match(index,/orderCycle\.handleMessage/);
  assert.match(index,/orderCycle\.handleCallback/);
  assert.match(module,/telegram_ops_advance_order/);
  assert.match(module,/고객 마이페이지와 알림함에 반영되었습니다/);
});
