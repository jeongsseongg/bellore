'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

const migration = read('supabase/migrations/20260824090000_authority_payment_hardening.sql');
const checkout = read('supabase/functions/create-checkout/index.ts');
const checkoutAuth = read('supabase/functions/_shared/checkout-auth.mjs');
const paymentAuth = read('app/services/payments/payment-auth.js');
const checkoutRecovery = read('app/services/payments/checkout-request-recovery.js');
const checkoutClient = read('app/services/payments/checkout-client.js');
const confirm = read('supabase/functions/confirm-payment/index.ts');
const cancel = read('supabase/functions/cancel-payment/index.ts');
const webhook = read('supabase/functions/payment-webhook/index.ts');
const recoveryPolicy = read('supabase/functions/_shared/payment-recovery-policy.mjs');
const recoveryAdapter = read('supabase/functions/_shared/payment-recovery.ts');
const paymentEdgeUtils = read('supabase/functions/_shared/payment-edge-utils.ts');
const paymentStates = read('supabase/functions/_shared/order-payment-states.ts');
const cancellation = read('supabase/functions/_shared/portone-cancellation.ts');
const paidOnlyMigration = read('supabase/migrations/20260826203000_checkout_cancellation_release.sql');
const reconciliation = read('supabase/functions/reconcile-payments/index.ts');
const reconciliationOrders = read('supabase/functions/_shared/reconciliation-orders.ts');
const claimMigration = read('supabase/migrations/20260826170000_checkout_claim_integrity.sql');
const finalizationContractMigration = read('supabase/migrations/20260826190000_payment_finalization_closed_order_contract.sql');
const backend = read('supabase.js');
const payments = read('payments.js');
const paymentFlow = read('app/features/checkout/payment-flow.js');
const paymentConfig = read('supabase-config.js');
const workflow = read('.github/workflows/db-maintenance.yml');
const config = read('supabase/config.toml');
const edgeCheck = read('scripts/check-edge.mjs');
const qualityWorkflow = read('.github/workflows/quality-gate.yml');
const pagesWorkflow = read('.github/workflows/pages-deploy.yml');
const firebaseWorkflow = read('.github/workflows/firebase-deploy.yml');
const reconciliationWorkflow = read('.github/workflows/payment-reconcile.yml');
const fulfillmentMigration = read('supabase/migrations/20260828030000_checkout_fulfillment_method.sql');

// Table authority and immutable payment fields.
assert.match(migration, /revoke all on public\.orders from anon/i);
assert.match(migration, /revoke all on public\.orders from authenticated/i);
assert.match(migration, /drop policy if exists orders_insert_guest/i);
assert.match(migration, /drop policy if exists orders_insert_own/i);
assert.match(migration, /create_checkout_order[\s\S]*security definer/i);
assert.match(migration, /guard_order_money_fields/);
assert.match(migration, /payment_fields_are_server_owned/);
assert.match(migration, /'shipping'.*'shipped'/s);
assert.match(migration, /'cancel_req'.*'return_req'.*'exchange_req'/s);

// Reservation, server snapshot and one-transaction finalization/refund.
assert.match(migration, /reserved_order_id/);
assert.match(migration, /for update/gi);
assert.match(migration, /finalize_paid_order_v2/);
assert.match(migration, /if v_order\.status not in \('pending','failed','payment_review'\) then/);
assert.doesNotMatch(migration, /order_closed_before_paid_finalization/,
  'an applied historical migration must remain immutable');
assert.match(finalizationContractMigration, /if v_order\.status in \('failed','canceled'\) then[\s\S]{0,180}errcode = 'P0001',[\s\S]{0,100}message = 'order_closed_before_paid_finalization'/);
assert.match(finalizationContractMigration, /if v_order\.status not in \('pending','payment_review'\) then/);
assert.match(finalizationContractMigration, /revoke all on function public\.finalize_paid_order_v2\([\s\S]{0,180}from public, anon, authenticated/);
assert.match(finalizationContractMigration, /grant execute on function public\.finalize_paid_order_v2\([\s\S]{0,180}to service_role/);
assert.match(migration, /status = 'sold', sold_order_id = v_order\.id/);
assert.match(migration, /user_coupons[\s\S]*status = 'used'/);
assert.match(migration, /point_ledger_order_earn_unique/);
assert.match(migration, /finalize_order_refund_v2/);
assert.match(migration, /alreadyRefunded/);
assert.match(migration, /refund_recovery_required/);
assert.match(migration, /mark_order_refund_pending/);
assert.match(migration, /-v_reversed/);

// Storage and SECURITY DEFINER boundary.
assert.match(migration, /owner_id=auth\.uid\(\)::text/);
assert.match(migration, /storage\.foldername\(name\)/);
assert.match(migration, /revoke all on function %s from public, anon, authenticated/);
assert.match(migration, /_claim_coupon\(public\.coupons,uuid\)[\s\S]*from public, anon, authenticated/i);
assert.match(migration, /auth\.role\(\)[\s\S]*service_role/);
assert.match(migration, /create table if not exists public\.checkout_rate_limits/);
assert.match(migration, /create or replace function public\.consume_checkout_rate_limit\(p_rate_key text\)[\s\S]*interval '15 minutes'[\s\S]*attempt_count < 5[\s\S]*checkout_rate_limited/);
assert.match(migration, /create_checkout_order_edge_v1[\s\S]*perform public\.consume_checkout_rate_limit\(p_rate_key\)/);
assert.match(migration, /revoke all on function public\.create_checkout_order\([\s\S]*from public, anon, authenticated/i);
assert.match(migration, /grant execute on function public\.create_checkout_order_edge_v1\([\s\S]*to service_role/i);
assert.match(migration, /grant execute on function public\.consume_checkout_rate_limit\(text\) to service_role/i);
assert.doesNotMatch(
  migration,
  /grant execute on function public\.create_checkout_order\([\s\S]{0,300}\) to anon, authenticated/i,
  'browser roles must not bypass the Edge checkout rate gate'
);
assert.match(migration, /grant execute on function public\.claim_shop_ai_chat\(text,text\) to anon, authenticated/);
assert.match(migration, /grant execute on function public\.bump_quote_view\(uuid\) to anon, authenticated/);
assert.match(migration, /text,text,uuid,jsonb,text,text\[\],text\[\],boolean,integer/);

// Provider truth is checked before the DB transition and responses are reduced.
for (const source of [confirm, webhook]) {
  assert.match(source, /PORTONE_STORE_ID/);
  assert.match(source, /providerStatusKind\(payment\.status\)/);
  assert.match(source, /lookupPortOnePayment/);
  assert.match(source, /finalizePaidOrderFromProvider/);
  assert.doesNotMatch(source, /return json\([^\n]*payment\s*[,}]/);
}
assert.match(confirm, /providerPaidAmount\(payment\)/);
assert.match(webhook, /providerPaidAmount\(payment\)/);
assert.match(webhook, /providerCancelledAmount\(payment\)/);
assert.match(recoveryAdapter, /input\.payment\.currency !== "KRW"/);
assert.match(recoveryAdapter, /channelType !== "LIVE"/);
assert.match(recoveryAdapter, /finalize_paid_order_v2/);
assert.match(recoveryAdapter, /paidFinalizationDatabaseFailureKind/);
assert.match(recoveryPolicy, /failureKind === 'locally_closed'[\s\S]{0,80}'cancel_conflict'/);
assert.match(paymentEdgeUtils, /sha256Hex/);
assert.match(paymentEdgeUtils, /safeEqual/);
assert.match(paymentEdgeUtils, /confirmationAuthorized/);
assert.match(confirm, /checkoutTokenMatches/);
assert.match(confirm, /confirmationAuthorized\(order\.customer_id, callerId, checkoutTokenMatches\)/);
assert.match(backend, /confirmationCapability: params\.checkoutToken/);
assert.match(paymentAuth, /options\.confirmationCapability \? capabilityFallback\(\)/);
assert.match(confirm, /payment_refund_pending/);
assert.match(confirm, /payment_refunded/);
assert.match(confirm, /hasConfirmedPaymentStatus/);
assert.match(confirm, /retryDelaysMs: CONFIRMATION_RETRY_DELAYS_MS/);
assert.match(confirm, /retryPendingStatus: true/);
assert.match(confirm, /notFoundResult: "not_found"/);
assert.match(confirm, /if \(!checkoutAbandoned\)[\s\S]*payment_confirmation_pending/);
assert.match(confirm, /provider_payment_not_found_after_checkout_abandonment/);
assert.match(recoveryAdapter, /response\.status === 404/);
assert.match(recoveryAdapter, /errorStatus: 202/);
assert.match(confirm, /payment_confirmation_pending/);
assert.match(confirm, /retryAfterMs: 2000/);
assert.match(confirm, /provider_paid_finalize_retry/);
assert.doesNotMatch(confirm, /order_finalize_failed_auto_cancel/);
assert.match(cancel, /profile\?\.role !== "admin"/);
assert.match(cancel, /lookupPortOnePayment/);
assert.match(cancel, /providerPaidAmount/);
assert.match(cancel, /providerCancelledAmount/);
assert.match(cancel, /adminCancellationAction/);
assert.match(cancel, /cancelAndReconcile/);
assert.match(cancel, /refundAmount: providerAmount/);
assert.doesNotMatch(cancel, /refundAmount: Number\(order\.amount\)/);
assert.ok(
  cancel.indexOf('const lookup = await lookupPortOnePayment') <
    cancel.indexOf('const cancellation = await cancelAndReconcile'),
  'administrator refunds must verify provider truth before cancellation'
);
assert.match(cancel, /providerRefunded: true/);
assert.match(cancellation, /status === "SUCCEEDED"/);
assert.match(cancellation, /status === "REQUESTED"/);
assert.match(cancellation, /finalize_order_refund_v2/);
assert.match(cancellation, /mark_order_refund_pending/);
assert.match(cancellation, /mark_order_payment_review/);
assert.match(cancellation, /"Idempotency-Key": idempotencyKey/);
assert.match(cancellation, /idempotencyKeyRaw[^\n]+slice\(0, 254\)/);
assert.match(cancellation, /AbortSignal\.timeout\(60000\)/);
assert.match(webhook, /statusKind === "cancelled"/);
assert.match(webhook, /statusKind === "partial_cancelled"/);
assert.match(webhook, /Transaction\.CancelPending/);
assert.match(webhook, /order\.status === "refund_pending"/);
assert.match(webhook, /cancel_pending_without_local_request/);
assert.match(webhook, /finalizeKnownProviderCancellation/);
assert.match(webhook, /cancellationQueued: true/);
assert.match(webhook, /provider_paid_finalize_retry/);
assert.match(webhook, /order_finalize_pending/);
assert.doesNotMatch(webhook, /webhook_finalize_failed_auto_cancel/);
assert.match(webhook, /recoveryAction === "cancel_amount_mismatch"/);
assert.match(webhook, /queueCancellationIntent/);
assert.match(webhook, /"amount_mismatch_auto_cancel"/);
assert.strictEqual((webhook.match(/cancelAndReconcile\(\{/g) || []).length, 0);
assert.strictEqual((webhook.match(/queueCancellationIntent\(/g) || []).length, 2);
const mismatchGuard = webhook.indexOf('if (notifiedStoreId !== PORTONE_STORE_ID)');
const mismatchIgnore = webhook.indexOf('reason: "store_mismatch"', mismatchGuard);
const providerLookup = webhook.indexOf('const lookup = await lookupPortOnePayment');
assert.ok(mismatchGuard >= 0 && mismatchIgnore > mismatchGuard, 'wrong-store webhooks must be ignored');
assert.ok(providerLookup > mismatchIgnore, 'wrong-store webhooks must stop before provider and database work');
assert.doesNotMatch(webhook, /webhook_identity_invalid/);
for (const status of ['shipping', 'delivered', 'confirmed', 'return_req', 'exchange_req', 'returning']) {
  assert.match(paymentStates, new RegExp(`"${status}"`), `paid lifecycle status ${status} must be reconciled`);
  assert.match(migration, new RegExp(`'${status}'`), `refund SQL must accept ${status}`);
}
assert.match(
  workflow,
  /update public\.orders set status='delivered'[\s\S]{0,180}update public\.orders set status='cancel_req'[\s\S]{0,1500}mark_order_refund_pending/,
  'rollback validation must cover delivered -> cancel request -> refund intent',
);

// Browser persists a request identity and capability before checkout. Edge
// validates both and sends only SHA-256 hashes to the service-role RPC.
assert.match(paymentConfig, /checkoutUrl:\s*"https:\/\/iumsnacuxgssnnbckurq\.supabase\.co\/functions\/v1\/create-checkout"/);
assert.match(payments, /PAY\.checkoutUrl/);
assert.match(checkoutClient, /request\(checkoutUrl/);
assert.match(backend, /checkoutToken/);
assert.match(checkoutClient, /recovery\.prepare\(body\)/);
assert.match(checkoutRecovery, /cryptoApi\.getRandomValues\(new Uint8Array\(32\)\)/);
assert.match(checkoutRecovery, /checkout_request_changed/);
assert.match(checkoutClient, /error\.code = code/);
assert.match(backend, /function paymentAccessToken\(options\)/);
assert.match(paymentAuth, /auth\.getUser\(token\)/);
assert.match(paymentAuth, /auth\.refreshSession\(\)/);
assert.match(paymentAuth, /PAYMENT_SESSION_EXPIRED/);
assert.match(paymentFlow, /로그인 정보가 만료되었습니다/);
assert.doesNotMatch(backend, /sb\.rpc\(['"]create_checkout_order/);
assert.doesNotMatch(backend, /from\('orders'\)\.insert\(row\)/);
assert.match(checkout, /if \(!allowedOrigin\(req\)\)/);
assert.match(checkout, /req\.headers\.get\("x-forwarded-for"\)/);
assert.doesNotMatch(checkout, /body\.(?:ip|clientIp|client_ip)/);
assert.match(checkout, /CHECKOUT_RATE_KEY_SECRET/);
assert.match(checkout, /RATE_KEY_SECRET\.length < 32/);
assert.match(checkout, /PAYMENT_CHECKOUT_ENABLED/);
assert.match(checkout, /checkout_temporarily_unavailable/);
assert.ok(
  checkout.indexOf('if (!CHECKOUT_ENABLED)') < checkout.indexOf('admin.rpc("create_checkout_order_edge_v2"'),
  'the rollout gate must stop checkout before any order or reservation is created'
);
assert.match(checkout, /sha256Hex\(`checkout-ip-v1\\0\$\{RATE_KEY_SECRET\}\\0\$\{clientIp\}`\)/);
assert.doesNotMatch(checkout, /crypto\.getRandomValues\(new Uint8Array\(32\)\)/);
assert.match(checkout, /sha256Hex\(checkoutRequestKey\)/);
assert.match(checkout, /sha256Hex\(checkoutToken\)/);
assert.match(checkout, /createClient\(SUPABASE_URL, SERVICE_ROLE/);
assert.match(checkout, /admin\.auth\.getUser\(bearer\)/);
assert.match(checkout, /classifyCheckoutJwtClaims\(decodeGatewayVerifiedJwtClaims\(bearer\)\)/);
assert.doesNotMatch(checkout, /bearer\s*&&\s*bearer\s*!==\s*ANON_KEY/);
assert.match(checkoutAuth, /role === 'anon' && !rawSubject/);
assert.match(checkoutAuth, /role === 'authenticated' && UUID_RE\.test\(rawSubject\)/);
assert.match(checkoutAuth, /role === 'service_role'/);
assert.match(checkout, /admin\.rpc\("create_checkout_order_edge_v2"/);
assert.match(checkoutClient, /expectedAmount: data\.amount/);
assert.match(checkoutClient, /fulfillmentMethod: pickup \? 'pickup' : 'delivery'/);
assert.match(checkout, /checkout_fulfillment_invalid/);
assert.match(checkout, /p_fulfillment_method: fulfillmentMethod/);
assert.match(checkout, /const expectedAmount = Number\(body\.expectedAmount\)/);
assert.match(checkout, /Number\.isSafeInteger\(expectedAmount\)[\s\S]{0,80}expectedAmount <= 0/);
assert.match(checkout, /p_rate_key: rateKey/);
assert.match(checkout, /p_customer_id: caller\.callerId/);
assert.match(checkout, /p_checkout_request_key_hash: checkoutRequestKeyHash/);
assert.match(checkout, /p_checkout_token_hash: checkoutTokenHash/);
assert.match(checkout, /p_expected_amount: expectedAmount/);
assert.match(checkout, /\["checkout_amount_changed", 409\]/);
assert.match(claimMigration, /drop function if exists public\.create_checkout_order_edge_v1\([\s\S]{0,160}text,uuid,uuid,text,uuid/);
assert.match(claimMigration, /p_checkout_request_key_hash text,\s*p_checkout_token_hash text,\s*p_expected_amount bigint/);
assert.match(claimMigration, /pg_advisory_xact_lock[\s\S]*checkoutReplayed[\s\S]*checkout_request_conflict[\s\S]*consume_checkout_rate_limit/);
assert.match(claimMigration, /p_expected_amount bigint[\s\S]*v_result := public\.create_checkout_order[\s\S]*checkout_amount_changed[\s\S]*return \(v_result/);
assert.match(checkout, /paymentContractVersion !== 2/);
assert.match(payments, /checkoutToken: order\.checkoutToken/);
assert.match(payments, /serverAmount !== amount/);
assert.match(fulfillmentMigration, /add column if not exists fulfillment_method text not null default 'delivery'/);
assert.match(fulfillmentMigration, /create or replace function public\.create_checkout_order_edge_v2/);
assert.match(fulfillmentMigration, /security definer[\s\S]{0,80}set search_path = ''/);
assert.match(fulfillmentMigration, /revoke all on function public\.create_checkout_order_edge_v2[\s\S]*grant execute[\s\S]*to service_role/);
for (const edge of [confirm, webhook, reconciliation]) {
  assert.match(edge, /Deno\.env\.get\("POINT_EARN_BPS"\) \?\? "0"/,
    'point rewards must remain opt-in through an explicit operating secret');
}

// Reproducible configuration and deploy-time dry-run/apply paths.
assert.match(config, /\[functions\.create-checkout\]\s*verify_jwt = true/);
assert.strictEqual((config.match(/\[functions\.create-checkout\]/g) || []).length, 1);
assert.match(config, /\[functions\.payment-webhook\][\s\S]*verify_jwt = false/);
assert.match(config, /\[functions\.reconcile-payments\][\s\S]*verify_jwt = false/);
assert.match(workflow, /validate-authority-payment/);
assert.match(workflow, /apply-authority-payment/);
assert.match(workflow, /verify-authority-payment-live/);
assert.match(workflow, /always rollback/i);
assert.match(workflow, /ON_ERROR_STOP=1/);
assert.match(workflow, /has_table_privilege\('anon','public\.orders','insert'\)/);
assert.match(edgeCheck, /--frozen/);
assert.match(edgeCheck, /2\.112\.2/);
for (const deployWorkflow of [qualityWorkflow, pagesWorkflow, firebaseWorkflow]) {
  assert.match(deployWorkflow, /deno-version: '2\.9\.5'/);
  assert.match(deployWorkflow, /node scripts\/check-edge\.mjs/);
}
assert.match(reconciliation, /PAYMENT_RECONCILE_TOKEN/);
assert.match(reconciliation, /payment_review/);
assert.match(reconciliation, /refund_pending/);
assert.match(reconciliation, /cancelAndReconcile/);
assert.match(reconciliationOrders, /\.eq\("status", "pending"\)/);
assert.match(reconciliationOrders, /\.eq\("payment_contract_version", 2\)/);
assert.match(reconciliation, /shouldEscalatePendingOrder/);
assert.match(reconciliation, /reconciliationSummaryOk\(summary\)/);
assert.match(reconciliation, /provider_payment_not_found_after_grace/);
assert.match(reconciliation, /finalizePaidOrderFromProvider/);
assert.match(reconciliation, /scheduled_refund_pending_recovery/);
assert.match(reconciliation, /action === "cancel_amount_mismatch"/);
assert.match(reconciliation, /scheduled_amount_mismatch_auto_cancel/);
assert.doesNotMatch(reconciliation, /scheduled_payment_reconciliation/);
assert.strictEqual((reconciliation.match(/cancelAndReconcile\(\{/g) || []).length, 3);
assert.match(recoveryPolicy, /status === 'pending' \|\| status === 'payment_review'/);
assert.match(recoveryPolicy, /status === 'refund_pending'[\s\S]{0,120}continue_cancellation/);
assert.match(recoveryPolicy, /PENDING_REVIEW_AGE_MS = 24 \* 60 \* 60 \* 1000/);
assert.match(claimMigration, /orders_one_unresolved_listing_v2_idx/);
assert.match(claimMigration, /orders_one_unresolved_coupon_idx/);
assert.match(paidOnlyMigration, /drop index if exists public\.orders_one_unresolved_listing_v2_idx/);
assert.match(paidOnlyMigration, /'reservationMode','paid_only'/);
assert.match(claimMigration, /payment_contract_version is null or payment_contract_version = 2/);
assert.match(reconciliationWorkflow, /secrets\.PAYMENT_RECONCILE_TOKEN/);
assert.match(reconciliationWorkflow, /github\.ref == 'refs\/heads\/main'/);
assert.match(reconciliationWorkflow, /group: production-database-maintenance/);
assert.match(workflow, /Verify checkout rate limit across concurrent DB sessions/);
assert.match(workflow, /allowed=5 limited=5 stored=5/);
assert.match(workflow, /set request\.jwt\.claims = '\{\\"role\\":\\"service_role\\"\}'/);
for (const role of ['anon', 'authenticated']) {
  assert.match(workflow, new RegExp(`has_function_privilege\\('${role}',[\\s\\S]*public\\.create_checkout_order\\(`));
  assert.match(workflow, new RegExp(`has_function_privilege\\('${role}',[\\s\\S]*public\\.create_checkout_order_edge_v1\\(`));
  assert.match(workflow, new RegExp(`has_function_privilege\\('${role}',[\\s\\S]*public\\.consume_checkout_rate_limit\\(text\\)`));
}
assert.match(workflow, /BACKUP_PASSPHRASE/);
assert.match(workflow, /gpg --batch --yes --quiet/);
assert.match(workflow, /gzip -t/);

console.log('authority-payment hardening invariants: ok');
