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
  checkout.indexOf('if (!CHECKOUT_ENABLED)') < checkout.indexOf('admin.rpc("create_checkout_order_edge_v2"'),
  'checkout rollout gate must run before the order RPC',
);

assert.match(reconcile, /PAYMENT_RECONCILE_ENABLED"\) === "true"/);
assert.ok(
  reconcile.indexOf('if (!RECONCILE_ENABLED)') < reconcile.indexOf('const loaded = await loadReconciliationOrders'),
  'reconciliation rollout gate must run before loading orders',
);
assert.match(reconcileWorkflow, /vars\.PAYMENT_RECONCILE_ENABLED == 'true'/);
assert.doesNotMatch(dbWorkflow, /SUPABASE_VALIDATION_DB_URL/);
assert.match(dbWorkflow, /supabase\/postgres@sha256:[0-9a-f]{64}/);
assert.match(dbWorkflow, /--platform linux\/amd64 --network none/);
assert.match(dbWorkflow, /--schema-only/);
assert.match(dbWorkflow, /docker exec --env PGPASSWORD="\$PAYMENT_VALIDATION_PASSWORD"[\s\S]{0,100}-i "\$PAYMENT_VALIDATION_CONTAINER"/);
assert.match(dbWorkflow, /if: inputs\.task == 'validate-authority-payment'/);
assert.match(dbWorkflow, /payment_operations_temporarily_unavailable/);
assert.equal((dbWorkflow.match(/probe_lock (?:create-checkout|confirm-payment|cancel-payment|payment-webhook|reconcile-payments)/g) || []).length, 5);
assert.match(dbWorkflow, /Waiting 180 seconds[\s\S]*sleep 180/);
assert.match(dbWorkflow, /lock_timeout=5000/);
assert.match(dbWorkflow, /statement_timeout=300000/);
assert.match(dbWorkflow, /insert into supabase_migrations\.schema_migrations/);
assert.doesNotMatch(
  dbWorkflow.match(/Validate authority and payment migration \(always rollback\)[\s\S]*?Apply authority and payment migration/)?.[0] || '',
  /inputs\.task == 'apply-authority-payment'/,
  'production apply must not run the rollback fixture step',
);

const validationBlock = dbWorkflow.match(
  /Validate authority and payment migration \(always rollback\)[\s\S]*?Apply authority and payment migration/,
)?.[0] || '';
const immediate = validationBlock.lastIndexOf('set constraints all immediate;');
const rollback = validationBlock.lastIndexOf('rollback;');
assert.ok(immediate >= 0 && immediate < rollback, 'deferred constraints must fire before validation rollback');

for (const migration of [
  '20260826155000_payment_operation_hold.sql',
  '20260826160000_payment_recovery_listing_state.sql',
  '20260826170000_checkout_claim_integrity.sql',
  '20260826180000_order_financial_state_guard.sql',
  '20260826190000_payment_finalization_closed_order_contract.sql',
  '20260826203000_checkout_cancellation_release.sql',
]) {
  assert.match(guide, new RegExp(migration.replaceAll('.', '\\.')));
}
assert.match(guide, /DB 제어 RPC가 없거나 false이면 닫히는 새 Edge 함수 다섯 개/);
assert.match(guide, /`payment_webhook` → `confirm_payment` → `cancel_payment` 제어만 먼저 개방/);
assert.match(guide, /마지막으로 DB `create_checkout`/);

console.log('payment rollout fail-closed gates: ok');
