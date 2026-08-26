import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8').replace(/\r\n?/g, '\n');
const checkoutClient = read('app/services/payments/checkout-client.js');
const checkoutUi = read('payments.js');
const edge = read('supabase/functions/create-checkout/index.ts');
const migration = read('supabase/migrations/20260826170000_checkout_claim_integrity.sql');
const paidOnlyMigration = read('supabase/migrations/20260826203000_checkout_cancellation_release.sql');
const financialGuard = read('supabase/migrations/20260826180000_order_financial_state_guard.sql');
const workflow = read('.github/workflows/db-maintenance.yml');

// Browser persistence happens before fetch. Success cannot clear the request
// identity until the redirect recovery order has been written and read back.
const prepare = checkoutClient.indexOf('recovery.prepare(body)');
const requestFetch = checkoutClient.indexOf('request(paymentConfig.checkoutUrl', prepare);
assert(prepare >= 0 && requestFetch > prepare);
assert.match(checkoutClient, /checkoutRequestKey: currentAttempt\.requestKey/);
assert.match(checkoutClient, /checkoutToken: currentAttempt\.checkoutToken/);
assert.match(checkoutClient, /result\.payload\.checkoutRequestKey === result\.attempt\.requestKey/);
assert.match(checkoutClient, /result\.payload\.checkoutToken === result\.attempt\.checkoutToken/);
assert.match(checkoutClient, /recovery\.discardIfSafe\(result\.attempt\.requestKey, code, result\.response\.status\)/,
  'only an explicit classified HTTP status may release a rejected request');
assert.match(checkoutClient, /token = await getAccessToken\(\);[\s\S]*?recovery\.discardIfSafe\(currentAttempt\.requestKey, error\?\.code \|\| error\?\.message\)/,
  'a definite pre-fetch authentication failure must release the browser attempt');
assert.doesNotMatch(checkoutClient.slice(prepare, checkoutClient.indexOf('function accepted', prepare)), /recovery\.complete/,
  'HTTP success alone must not erase response-loss recovery');
const normalOrderBranch = checkoutUi.indexOf("if (!Number.isSafeInteger(serverAmount) || serverAmount !== amount)");
const pendingWrite = checkoutUi.indexOf("sessionStorage.setItem('bellore_pending_order_v2'", normalOrderBranch);
const pendingRead = checkoutUi.indexOf("sessionStorage.getItem('bellore_pending_order_v2'", pendingWrite);
const cleanup = checkoutUi.indexOf('BELLORE_CHECKOUT_REQUEST_RECOVERY.complete', pendingRead);
const providerOpen = checkoutUi.indexOf('window.PortOne.requestPayment(req)', cleanup);
assert(pendingWrite >= 0 && pendingRead > pendingWrite && cleanup > pendingRead && providerOpen > cleanup);
const recoveryOnlyStart = checkoutUi.indexOf('order && order.recoveryOnly === true');
const recoveryOnlyEnd = normalOrderBranch;
assert(recoveryOnlyStart >= 0 && recoveryOnlyEnd > recoveryOnlyStart);
assert.doesNotMatch(checkoutUi.slice(recoveryOnlyStart, recoveryOnlyEnd), /PortOne\.requestPayment/,
  'an already-created recovered order must never reopen the payment provider');
assert.match(checkoutUi.slice(recoveryOnlyStart, recoveryOnlyEnd), /verifyPayment\(order\.orderNo, null, order\.listingId, order\.checkoutToken, true, true\)/,
  'an already-created recovered order must only be verified on the server');
assert.match(checkoutUi, /catch \(e\) \{[\s\S]{0,240}verifyPayment\(order\.orderNo,[\s\S]{0,160}order\.checkoutToken \|\| null, true\); return;/,
  'pending storage failure must close the same order before the provider can open');

// Edge accepts only browser-generated v4/64-hex credentials and sends hashes
// to PostgreSQL. The raw capability is only echoed back to the same browser.
assert.match(edge, /checkoutRequestKey\[14\] !== "4"/);
assert.match(edge, /\^\[0-9a-f\]\{64\}\$\/\.test\(checkoutToken\)/);
assert.match(edge, /checkoutRequestKeyHash = await sha256Hex\(checkoutRequestKey\)/);
assert.match(edge, /checkoutTokenHash = await sha256Hex\(checkoutToken\)/);
assert.match(edge, /p_checkout_request_key_hash: checkoutRequestKeyHash/);
assert.match(edge, /p_checkout_token_hash: checkoutTokenHash/);
assert.doesNotMatch(edge, /p_checkout_(?:request_key|token):\s*(?:checkoutRequestKey|checkoutToken)/);
assert.doesNotMatch(edge, /randomCapability/);

// The request hash is unique and server-owned. An advisory transaction lock
// serializes first-write races before lookup/rate consumption. Only a fully
// matching pending v2 claim may replay; every mismatch fails closed.
assert.match(migration, /add column if not exists checkout_request_key_hash text/);
assert.match(migration, /orders_checkout_request_key_hash_format[\s\S]*\^\[0-9a-f\]\{64\}\$/);
assert.match(migration, /create unique index if not exists orders_checkout_request_key_hash_uidx[\s\S]{0,160}checkout_request_key_hash/);
assert.match(migration, /set_config\('app\.checkout_request_key_hash', p_checkout_request_key_hash, true\)/);
const lock = paidOnlyMigration.indexOf('pg_advisory_xact_lock');
const existing = paidOnlyMigration.indexOf('where checkout_request_key_hash = p_checkout_request_key_hash', lock);
const replay = paidOnlyMigration.indexOf("'checkoutReplayed',true", existing);
const conflict = paidOnlyMigration.indexOf("jsonb_build_object('error','checkout_request_conflict')", replay);
const rate = paidOnlyMigration.indexOf('perform public.consume_checkout_rate_limit(p_rate_key);', conflict);
assert(lock >= 0 && existing > lock && replay > existing && conflict > replay && rate > conflict,
  'same-key serialization and replay/conflict checks must finish before rate consumption');
for (const marker of [
  "v_existing.payment_contract_version = 2", "v_existing.status = 'pending'",
  'v_existing.customer_id is not distinct from p_customer_id',
  'v_existing.listing_id = p_listing_id',
  'v_existing.checkout_token_hash = p_checkout_token_hash',
  'v_existing.amount = p_expected_amount',
  "available.status = 'on_sale'", 'available.sold_order_id is null',
]) assert(paidOnlyMigration.includes(marker), `safe retry match is missing: ${marker}`);
assert.doesNotMatch(
  paidOnlyMigration.slice(existing, replay),
  /reserved_order_id\s*=\s*v_existing\.id/,
  'same-key replay must not require a pending inventory reservation',
);
assert.match(financialGuard, /new\.checkout_request_key_hash is distinct from old\.checkout_request_key_hash/);

// Executable rollback validation calls the wrapper twice with the same key,
// then changes one protected field and checks one row plus one rate attempt.
for (const marker of [
  'checkout response-loss retry reused one order and one rate attempt',
  "checkout_request_key_hash=repeat('1',64)",
  "checkout_request_conflict'",
  'checkout request-key mismatch failed closed without another rate attempt',
  'pg_advisory_xact_lock',
]) assert(workflow.includes(marker), `DB rollback/live gate is missing: ${marker}`);

console.log('checkout DB-commit/HTTP-response-loss idempotency contract: ok');
