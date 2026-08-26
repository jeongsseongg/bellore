import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  guardPaymentOperation,
  paymentOperationSha256,
  readPaymentOperationControl,
  readPaymentOperationHold,
} from '../supabase/functions/_shared/payment-operation-guard.ts';
import { lookupPortOnePayment } from '../supabase/functions/_shared/payment-recovery.ts';
import { cancelPortOnePayment } from '../supabase/functions/_shared/portone-cancellation.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(join(root, file), 'utf8').replace(/\r\n?/g, '\n');
const holdMigration = read('supabase/migrations/20260826155000_payment_operation_hold.sql');
const recoveryMigration = read('supabase/migrations/20260826160000_payment_recovery_listing_state.sql');
const claimMigration = read('supabase/migrations/20260826170000_checkout_claim_integrity.sql');
const finalMigration = read('supabase/migrations/20260826190000_payment_finalization_closed_order_contract.sql');
const workflow = read('.github/workflows/db-maintenance.yml');
const paymentsSetup = read('docs/PAYMENTS_SETUP.md');
const lookup = read('supabase/functions/_shared/payment-recovery.ts');
const cancellation = read('supabase/functions/_shared/portone-cancellation.ts');
const checkout = read('supabase/functions/create-checkout/index.ts');
const confirm = read('supabase/functions/confirm-payment/index.ts');
const cancel = read('supabase/functions/cancel-payment/index.ts');
const webhook = read('supabase/functions/payment-webhook/index.ts');
const reconcile = read('supabase/functions/reconcile-payments/index.ts');
const reconciliationOrders = read('supabase/functions/_shared/reconciliation-orders.ts');

const rpcClient = (handler) => ({ rpc: handler });
assert.equal(await paymentOperationSha256('hold-runtime-fixture'),
  'b692c1892ff5c73d2a9cf1339a88a537be2add2b0b222bbbf5ae3d00edb44db9');

assert.deepEqual(
  await readPaymentOperationControl(rpcClient(async () => ({ data: true, error: null })), 'payment_webhook'),
  { ok: true, enabled: true },
);
for (const response of [
  { data: null, error: null },
  { data: true, error: { message: 'rpc missing' } },
]) {
  assert.deepEqual(
    await readPaymentOperationControl(rpcClient(async () => response), 'payment_webhook'),
    { ok: false, enabled: false },
  );
}

const orderNo = 'SYNTHETIC-HOLD-RUNTIME-ORDER';
const orderHash = await paymentOperationSha256(orderNo);
let holdRpcArgs;
const held = await readPaymentOperationHold(rpcClient(async (name, args) => {
  assert.equal(name, 'is_payment_operation_hash_held_v1');
  holdRpcArgs = args;
  return { data: true, error: null };
}), orderNo);
assert.equal(held.held, true);
assert.deepEqual(holdRpcArgs, { p_order_no_sha256: orderHash });
assert.equal(JSON.stringify(holdRpcArgs).includes(orderNo), false, 'hold RPC must receive only SHA-256');

let rpcCalls = 0;
const unavailable = await guardPaymentOperation({
  admin: rpcClient(async () => {
    rpcCalls += 1;
    return { data: null, error: { message: 'guard unavailable' } };
  }),
  control: 'confirm_payment',
  orderNo,
});
assert.deepEqual(unavailable, { allowed: false, reason: 'guard_unavailable' });
assert.equal(rpcCalls, 1, 'a failed hold lookup must not continue to the control RPC');

let enabledCalls = 0;
const enabled = await guardPaymentOperation({
  admin: rpcClient(async (name) => {
    enabledCalls += 1;
    if (name === 'is_payment_operation_hash_held_v1') return { data: false, error: null };
    return { data: true, error: null };
  }),
  control: 'confirm_payment',
  orderNo,
});
assert.deepEqual(enabled, { allowed: true, reason: null });
assert.equal(enabledCalls, 2);

const providerInput = {
  apiBase: 'https://provider.invalid',
  apiSecret: 'synthetic-secret',
  storeId: 'synthetic-store',
  paymentId: 'SYNTHETIC-PAYMENT-ID',
};
const operationAdmin = (mode) => rpcClient(async (name) => {
  if (name === 'is_payment_operation_hash_held_v1') {
    if (mode === 'guard_error') return { data: null, error: { message: 'guard unavailable' } };
    return { data: mode === 'held', error: null };
  }
  if (name === 'read_payment_operation_control_v1') return { data: true, error: null };
  throw new Error(`unexpected RPC: ${name}`);
});
const originalFetch = globalThis.fetch;
const setFetch = (value) => Object.defineProperty(globalThis, 'fetch', {
  configurable: true,
  writable: true,
  value,
});
try {
  for (const mode of ['held', 'guard_error']) {
    let fetchCalls = 0;
    setFetch(async () => {
      fetchCalls += 1;
      throw new Error('provider fetch must remain blocked');
    });
    const lookupResult = await lookupPortOnePayment({
      operationAdmin: operationAdmin(mode),
      operationControl: 'confirm_payment',
      operationOrderNo: 'SYNTHETIC-LOOKUP-ORDER',
      ...providerInput,
      allowTestPayments: false,
      timeoutMs: 10,
    });
    assert.equal(lookupResult.payment, null);
    assert.equal(lookupResult.errorStatus, mode === 'held' ? 409 : 503);
    assert.equal(fetchCalls, 0, `lookup ${mode} must call provider fetch exactly zero times`);

    const cancelResult = await cancelPortOnePayment({
      admin: operationAdmin(mode),
      operationControl: 'cancel_payment',
      orderNo: 'SYNTHETIC-CANCEL-ORDER',
      ...providerInput,
      refundAmount: 100,
      reason: 'synthetic-test',
    });
    assert.equal(cancelResult.state, 'failed');
    assert.equal(fetchCalls, 0, `cancellation ${mode} must call provider fetch exactly zero times`);
  }

  let holdLookups = 0;
  const dynamicHoldAdmin = rpcClient(async (name) => {
    if (name === 'is_payment_operation_hash_held_v1') {
      holdLookups += 1;
      return { data: holdLookups >= 2, error: null };
    }
    if (name === 'read_payment_operation_control_v1') return { data: true, error: null };
    throw new Error(`unexpected RPC: ${name}`);
  });
  let raceFetchCalls = 0;
  setFetch(async () => {
    raceFetchCalls += 1;
    return new Response(JSON.stringify({ error: 'ambiguous provider response' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  const raceResult = await cancelPortOnePayment({
    admin: dynamicHoldAdmin,
    operationControl: 'cancel_payment',
    orderNo: 'SYNTHETIC-DYNAMIC-HOLD-ORDER',
    ...providerInput,
    refundAmount: 100,
    reason: 'synthetic-race-test',
  });
  assert.equal(raceResult.state, 'failed');
  assert.equal(holdLookups, 2, 'fallback recovery must re-check the hold after the POST');
  assert.equal(raceFetchCalls, 1, 'dynamic hold must block the fallback GET after one POST');
} finally {
  setFetch(originalFetch);
}

for (const control of [
  'create_checkout', 'confirm_payment', 'cancel_payment', 'payment_webhook', 'reconcile_payments',
]) assert.match(holdMigration, new RegExp(`\\('${control}', false`));
assert.match(holdMigration, /order_no_sha256 text primary key[\s\S]*\^\[0-9a-f\]\{64\}\$/);
assert.match(holdMigration, /revoke all on public\.payment_operation_holds[\s\S]*service_role/);
assert.match(holdMigration, /trg_00_payment_operation_hold_order[\s\S]*before insert or update or delete on public\.orders/);
assert.match(holdMigration, /trg_00_payment_operation_hold_listing[\s\S]*before insert or update or delete on public\.listings/);
assert.match(holdMigration, /trg_00_payment_operation_hold_orders_truncate[\s\S]*before truncate on public\.orders/);
assert.match(holdMigration, /trg_00_payment_operation_hold_listings_truncate[\s\S]*before truncate on public\.listings/);

assert.match(recoveryMigration, /release_expired_checkout_reservations[\s\S]*not public\.is_payment_operation_hash_held_v1/);
assert.match(claimMigration, /recover_checkout_order_edge_v1[\s\S]*not public\.is_payment_operation_hash_held_v1/);
assert.match(finalMigration, /payment_reconciliation_orders_edge_v1[\s\S]{0,120}security_invoker = true[\s\S]*not public\.is_payment_operation_hash_held_v1/);
assert.match(reconciliationOrders, /\.from\("payment_reconciliation_orders_edge_v1"\)/);
assert.doesNotMatch(reconciliationOrders, /\.from\("orders"\)/);

const lookupGuard = lookup.indexOf('guardPaymentOperation({');
const providerLookup = lookup.indexOf('fetch(', lookupGuard);
assert(lookupGuard >= 0 && providerLookup > lookupGuard,
  'every provider lookup must re-check the hold and control first');
assert.match(cancellation, /operationControl: PaymentOperationControl/);
assert.doesNotMatch(cancellation, /operationControl\?: PaymentOperationControl/);
assert(cancellation.indexOf('guardPaymentOperation({') < cancellation.indexOf('mark_order_refund_pending'),
  'cancellation guard must run before DB intent or provider cancellation');

assert(checkout.indexOf('readPaymentOperationControl(admin, "create_checkout")') <
  checkout.indexOf('recover_checkout_order_edge_v1'));
assert.doesNotMatch(checkout, /\.from\("orders"\)/);
for (const [source, control, firstRead] of [
  [confirm, 'confirm_payment', '.from("orders")'],
  [cancel, 'cancel_payment', '.from("orders")'],
  [webhook, 'payment_webhook', '.from("orders")'],
]) {
  assert(source.indexOf(`control: "${control}"`) < source.indexOf(firstRead),
    `${control} hold must be checked before reading the order`);
}
assert(reconcile.indexOf('readPaymentOperationControl(admin, "reconcile_payments")') <
  reconcile.lastIndexOf('loadReconciliationOrders'));

assert.match(workflow, /payment_hold_sha256 must be a 64-character lowercase SHA-256/);
assert.match(workflow, /SEED_HASH_ONLY_PAYMENT_OPERATION_HOLD/);
assert.equal((workflow.match(/probe_lock (?:create-checkout|confirm-payment|cancel-payment|payment-webhook|reconcile-payments)/g) || []).length, 5);
assert.match(workflow, /probe_lock confirm-payment '\{"paymentId":"PAYMENT-LOCK-PROBE"\}'/);
assert.match(workflow, /probe_lock cancel-payment '\{"orderNo":"PAYMENT-LOCK-PROBE"\}'/);
assert.match(workflow, /Waiting 180 seconds[\s\S]*sleep 180/);
assert.match(workflow, /truncate public\.orders cascade;/);
assert.equal((workflow.match(/'public\.payment_order_no_sha256_v1\(text\)','execute'/g) || []).length >= 2, true);
assert.equal((workflow.match(/'public\.payment_reconciliation_orders_edge_v1','select'/g) || []).length >= 2, true);
assert(workflow.indexOf('Verify all deployed payment Edge locks before production apply') <
  workflow.indexOf('Drain in-flight payment operations before production apply'));
assert(workflow.indexOf('Drain in-flight payment operations before production apply') <
  workflow.indexOf('Apply authority and payment migration'));
const applyBlock = workflow.slice(
  workflow.indexOf('Apply authority and payment migration'),
  workflow.indexOf('Verify hash-only hold without reading the protected order'),
);
assert(applyBlock.indexOf('20260826155000_payment_operation_hold.sql') <
  applyBlock.indexOf('20260826160000_payment_recovery_listing_state.sql'));
assert.match(applyBlock, /values \(:'payment_hold_sha256', 'release_protection'\)/);
assert.doesNotMatch(applyBlock, /from public\.orders[\s\S]{0,200}payment_hold_sha256/,
  'production hold seed must not query the protected order');

const webhookDeploy = paymentsSetup.indexOf('supabase functions deploy payment-webhook');
const confirmDeploy = paymentsSetup.indexOf('supabase functions deploy confirm-payment');
const cancelDeploy = paymentsSetup.indexOf('supabase functions deploy cancel-payment');
const reconcileDeploy = paymentsSetup.indexOf('supabase functions deploy reconcile-payments');
const checkoutDeploy = paymentsSetup.indexOf('supabase functions deploy create-checkout');
assert(webhookDeploy >= 0 && webhookDeploy < confirmDeploy && confirmDeploy < cancelDeploy &&
  cancelDeploy < reconcileDeploy && reconcileDeploy < checkoutDeploy,
  'release documentation must deploy the asynchronous webhook lock first');

console.log('payment operation hash-hold, fail-closed Edge gates, and release ordering: ok');
