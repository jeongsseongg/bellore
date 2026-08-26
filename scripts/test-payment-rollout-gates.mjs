import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

const checkout = read('supabase/functions/create-checkout/index.ts');
const reconcile = read('supabase/functions/reconcile-payments/index.ts');
const reconcileWorkflow = read('.github/workflows/payment-reconcile.yml');
const dbWorkflow = read('.github/workflows/db-maintenance.yml');
const guide = read('docs/PAYMENTS_SETUP.md');

assert.match(checkout, /PAYMENT_CHECKOUT_ENABLED"\) === "true"/);
assert.ok(
  checkout.indexOf('if (!CHECKOUT_ENABLED)') < checkout.indexOf('admin.rpc("create_checkout_order_edge_v1"'),
  'checkout rollout gate must run before the order RPC',
);

assert.match(reconcile, /PAYMENT_RECONCILE_ENABLED"\) === "true"/);
assert.ok(
  reconcile.indexOf('if (!RECONCILE_ENABLED)') < reconcile.indexOf('const loaded = await loadReconciliationOrders'),
  'reconciliation rollout gate must run before loading orders',
);
assert.match(reconcileWorkflow, /vars\.PAYMENT_RECONCILE_ENABLED == 'true'/);
assert.match(dbWorkflow, /PGCONN: \$\{\{ secrets\.SUPABASE_VALIDATION_DB_URL \}\}/);
assert.match(dbWorkflow, /if: inputs\.task == 'validate-authority-payment'/);
assert.match(dbWorkflow, /checkout_temporarily_unavailable/);
assert.match(dbWorkflow, /reconciliation_temporarily_disabled/);
assert.match(dbWorkflow, /lock_timeout=5000/);
assert.match(dbWorkflow, /statement_timeout=300000/);
assert.match(dbWorkflow, /insert into supabase_migrations\.schema_migrations/);
assert.doesNotMatch(
  dbWorkflow.match(/Validate authority and payment migration \(always rollback\)[\s\S]*?Apply authority and payment migration/)?.[0] || '',
  /inputs\.task == 'apply-authority-payment'/,
  'production apply must not run the rollback fixture step',
);

const immediate = dbWorkflow.lastIndexOf('set constraints all immediate;');
const rollback = dbWorkflow.lastIndexOf('rollback;');
assert.ok(immediate >= 0 && immediate < rollback, 'deferred constraints must fire before validation rollback');

for (const migration of [
  '20260826160000_payment_recovery_listing_state.sql',
  '20260826170000_checkout_claim_integrity.sql',
  '20260826180000_order_financial_state_guard.sql',
  '20260826190000_payment_finalization_closed_order_contract.sql',
]) {
  assert.match(guide, new RegExp(migration.replaceAll('.', '\\.')));
}
assert.match(guide, /잠금 함수 → 별도 DB 검증 → 운영 DB 적용 → Edge 전체 → 웹훅 → 정적 사이트 → 정적 배포 재잠금 → 재대조 → 체크아웃 개방/);
assert.match(guide, /`PRODUCTION_DEPLOY_ENABLED=false`를 다시 확인/);

console.log('payment rollout fail-closed gates: ok');
