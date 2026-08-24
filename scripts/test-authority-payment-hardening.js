'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

const migration = read('supabase/migrations/20260824090000_authority_payment_hardening.sql');
const confirm = read('supabase/functions/confirm-payment/index.ts');
const cancel = read('supabase/functions/cancel-payment/index.ts');
const webhook = read('supabase/functions/payment-webhook/index.ts');
const backend = read('supabase.js');
const payments = read('payments.js');
const workflow = read('.github/workflows/db-maintenance.yml');
const config = read('supabase/config.toml');
const edgeCheck = read('scripts/check-edge.mjs');
const qualityWorkflow = read('.github/workflows/quality-gate.yml');
const pagesWorkflow = read('.github/workflows/pages-deploy.yml');
const firebaseWorkflow = read('.github/workflows/firebase-deploy.yml');

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
assert.ok(
  migration.lastIndexOf('grant execute on function public.create_checkout_order') >
    migration.lastIndexOf("revoke all on function %s from public, anon, authenticated"),
  'checkout grant must be restored after the global SECURITY DEFINER revoke'
);
assert.match(migration, /grant execute on function public\.claim_shop_ai_chat\(text,text\) to anon, authenticated/);
assert.match(migration, /grant execute on function public\.bump_quote_view\(uuid\) to anon, authenticated/);
assert.match(migration, /text,text,uuid,jsonb,text,text\[\],text\[\],boolean,integer/);

// Provider truth is checked before the DB transition and responses are reduced.
for (const source of [confirm, webhook]) {
  assert.match(source, /PORTONE_STORE_ID/);
  assert.match(source, /payment\.currency !== "KRW"/);
  assert.match(source, /channelType !== "LIVE"/);
  assert.match(source, /payment\.status !== "PAID"/);
  assert.match(source, /finalize_paid_order_v2/);
  assert.doesNotMatch(source, /return json\([^\n]*payment\s*[,}]/);
}
assert.match(confirm, /sha256Hex\(checkoutToken\)/);
assert.match(confirm, /callerId !== order\.customer_id/);
assert.match(confirm, /order_finalize_failed_auto_cancel/);
assert.match(cancel, /profile\?\.role !== "admin"/);
assert.match(cancel, /finalize_order_refund_v2/);
assert.match(cancel, /providerRefunded: true/);
assert.match(cancel, /lookupProviderPayment/);
assert.match(cancel, /mark_order_refund_pending/);
assert.match(webhook, /payment\.status === "CANCELLED"/);
assert.match(webhook, /payment\.status === "PARTIAL_CANCELLED"/);
assert.match(webhook, /finalize_order_refund_v2/);

// Browser keeps only the raw capability; DB receives its SHA-256 hash.
assert.match(backend, /secureCheckoutToken/);
assert.match(backend, /p_checkout_token_hash: checkoutTokenHash/);
assert.match(backend, /create_checkout_order/);
assert.doesNotMatch(backend, /from\('orders'\)\.insert\(row\)/);
assert.match(payments, /checkoutToken: order\.checkoutToken/);
assert.match(payments, /serverAmount !== amount/);

// Reproducible configuration and deploy-time dry-run/apply paths.
assert.match(config, /\[functions\.payment-webhook\][\s\S]*verify_jwt = false/);
assert.match(workflow, /validate-authority-payment/);
assert.match(workflow, /apply-authority-payment/);
assert.match(workflow, /always rollback/i);
assert.match(workflow, /ON_ERROR_STOP=1/);
assert.match(workflow, /has_table_privilege\('anon','public\.orders','insert'\)/);
assert.match(edgeCheck, /--frozen/);
assert.match(edgeCheck, /2\.112\.2/);
for (const deployWorkflow of [qualityWorkflow, pagesWorkflow, firebaseWorkflow]) {
  assert.match(deployWorkflow, /deno-version: '2\.9\.5'/);
  assert.match(deployWorkflow, /node scripts\/check-edge\.mjs/);
}

console.log('authority-payment hardening invariants: ok');
