import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(join(root, file), 'utf8').replace(/\r\n?/g, '\n');
const migration = read('supabase/migrations/20260826180000_order_financial_state_guard.sql');
const recoveryMigration = read('supabase/migrations/20260826160000_payment_recovery_listing_state.sql');
const workflow = read('.github/workflows/db-maintenance.yml');
const ui = read('script.js');

const locked = ['pending', 'payment_review', 'failed', 'canceled', 'refund_pending', 'refunded'];
const operational = ['inspecting', 'preparing', 'shipping', 'delivered', 'confirmed', 'cancel_req'];
const protectedFields = [
  'amount', 'discount', 'product_price', 'method', 'payment_key', 'provider_transaction_id',
  'receipt_url', 'paid_at', 'refund_amount', 'refunded_at', 'checkout_token_hash',
  'checkout_request_key_hash',
  'refund_intent_code', 'payment_contract_version', 'id', 'order_no', 'customer_id',
  'restock_required', 'payment_review_required', 'payment_terminal_at',
  'listing_id', 'coupon_user_id', 'pay_type',
];

assert.match(migration, /create or replace function public\.guard_order_money_fields\(\)/);
assert.match(migration, /old\.status in \([\s\S]*'pending'[\s\S]*'payment_review'[\s\S]*'failed'[\s\S]*'canceled'[\s\S]*'refund_pending'[\s\S]*'refunded'[\s\S]*\)/);
assert.match(migration, /new\.status in \([\s\S]*'pending'[\s\S]*'payment_review'[\s\S]*'failed'[\s\S]*'canceled'[\s\S]*'refund_pending'[\s\S]*'refunded'[\s\S]*\)/);
assert.match(migration, /or new\.status = 'paid'/);
assert.match(migration, /old\.status = 'pending'[\s\S]*new\.status = 'canceled'[\s\S]*current_setting\('app\.customer_pending_cancel_v1', true\) = 'allowed'[\s\S]*old\.customer_id = auth\.uid\(\)/);
const customerCancel = migration.match(
  /create or replace function public\.order_request_cancel\([\s\S]*?end \$\$;/,
)?.[0] || '';
assert.match(customerCancel, /security definer[\s\S]*set search_path = ''/);
assert.match(customerCancel, /where order_no = p_order_no[\s\S]*for update/);
assert.match(customerCancel, /v_order\.customer_id is distinct from auth\.uid\(\)[\s\S]*FORBIDDEN/);
assert.doesNotMatch(customerCancel, /v_order\.customer_id <> auth\.uid\(\)/,
  'NULL guest ownership must fail closed for an authenticated caller');
assert.match(customerCancel, /v_order\.status = 'pending'[\s\S]*v_new_status := 'canceled'[\s\S]*set_config\('app\.customer_pending_cancel_v1', 'allowed', true\)/);
assert.match(migration, /revoke all on function public\.order_request_cancel\(text,text\)[\s\S]*from public, anon[\s\S]*grant execute[\s\S]*to authenticated/);
for (const field of protectedFields) {
  assert.match(migration, new RegExp(`new\\.${field} is distinct from old\\.${field}`), `${field} is not server-owned`);
}
assert.match(migration, /revoke all on function public\.guard_order_money_fields\(\)[\s\S]*from public, anon, authenticated/);
assert.match(migration, /create trigger trg_guard_order_money_fields[\s\S]*before update on public\.orders/);
assert.match(
  recoveryMigration,
  /revoke all on function public\.clear_confirmed_payment_review_v1\(text,text,bigint\)[\s\S]*from public, anon, authenticated[\s\S]*grant execute[\s\S]*to service_role/,
);

// Deterministic transition model: financial truth is service-owned, while an
// already-paid order may still advance through normal fulfilment operations.
function allowed(role, before, after) {
  if (role === 'service_role' || before === after) return true;
  return !locked.includes(before) && !locked.includes(after) && after !== 'paid';
}
for (const state of locked) {
  assert.equal(allowed('authenticated', state, 'shipping'), false, `${state} escaped financial lock`);
  assert.equal(allowed('authenticated', 'shipping', state), false, `${state} was directly entered`);
}
assert.equal(allowed('authenticated', 'pending', 'paid'), false);
assert.equal(allowed('authenticated', 'pending', 'canceled'), false);
assert.equal(allowed('authenticated', 'paid', 'inspecting'), true);
assert.equal(allowed('authenticated', 'inspecting', 'preparing'), true);
assert.equal(allowed('authenticated', 'delivered', 'confirmed'), true);
assert.equal(allowed('service_role', 'pending', 'paid'), true);
assert.equal(allowed('service_role', 'paid', 'refund_pending'), true);

const selectable = ui.match(/var ADMIN_STATUSES = \[([^\]]+)\]/)?.[1] || '';
const lockedUi = ui.match(/ADMIN_FINANCIAL_LOCKED = \[([^\]]+)\]/)?.[1] || '';
for (const state of [...locked, 'paid']) assert.doesNotMatch(selectable, new RegExp(`['"]${state}['"]`));
for (const state of operational) assert.match(selectable, new RegExp(`['"]${state}['"]`));
for (const state of [...locked, 'cancelled']) assert.match(lockedUi, new RegExp(`['"]${state}['"]`));
assert.match(ui, /o\.status === 'paid' \? \['paid'\]\.concat\(ADMIN_STATUSES\)/);
assert.match(ui, /statusLocked \? ' disabled aria-label="결제 시스템에서 처리 중인 주문 상태"'/);
assert.match(ui, /if \(status !== o\.status\) p = p\.then\(function \(\) \{ return NWBackend\.adminSetOrderStatus\(id, status\); \}\);/);
for (const label of ['결제 확인 중', '결제 실패', '환불 처리 중']) assert.ok(ui.includes(label));

const migrationName = '20260826180000_order_financial_state_guard.sql';
const validateStart = workflow.indexOf('Validate authority and payment migration (always rollback)');
const rollback = workflow.indexOf('          rollback;', validateStart);
const applyStart = workflow.indexOf('Apply authority and payment migration');
const liveStart = workflow.indexOf('Verify live authority and payment ACL');
assert(validateStart >= 0 && rollback > validateStart && workflow.slice(validateStart, rollback).includes(migrationName));
assert(applyStart >= 0 && liveStart > applyStart && workflow.slice(applyStart, liveStart).includes(migrationName));
assert.equal((workflow.match(/tgname='trg_guard_order_money_fields'/g) || []).length, 2);
assert.equal((workflow.match(/new\.order_no is distinct from old\.order_no/g) || []).length, 2);
for (const marker of [
  'pending order escaped provider verification', 'order amount guard did not block',
  'payment contract version guard did not block', 'restock flag guard did not block',
  'payment review flag guard did not block', 'order identity guard did not block',
  'payment terminal timestamp guard did not block',
  'post-fulfilment refund released listing before inspection',
  "update public.orders set status='delivered'", "update public.orders set status='cancel_req'",
  'delivered to cancel-request physical hold verified',
  'pre-fulfilment cancellation release verified',
  'operational order entered financial state directly',
]) assert.ok(workflow.includes(marker), `DB rollback guard test is missing: ${marker}`);

const lineCount = ui.endsWith('\n') ? ui.slice(0, -1).split('\n').length : ui.split('\n').length;
assert(lineCount <= 6653, `script.js exceeds architecture ceiling: ${lineCount}`);

console.log('order financial state guard contracts: ok');
