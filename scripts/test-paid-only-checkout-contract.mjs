import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (file) => readFileSync(resolve(root, file), 'utf8').replace(/\r\n?/g, '\n');
const paidOnly = read('supabase/migrations/20260826203000_checkout_cancellation_release.sql');
const listingLifecycle = read('supabase/migrations/20260826160000_payment_recovery_listing_state.sql');
const policy = read('supabase/functions/_shared/payment-recovery-policy.mjs');
const checkoutEdge = read('supabase/functions/create-checkout/index.ts');
const workflow = read('.github/workflows/db-maintenance.yml');
const guide = read('docs/PAYMENTS_SETUP.md');

assert.match(paidOnly, /drop index if exists public\.orders_one_unresolved_listing_v2_idx/);

const claimGuard = paidOnly.match(
  /create or replace function public\.guard_new_checkout_claims_v1\(\)[\s\S]*?end;\n\$\$/i,
)?.[0] || '';
assert.doesNotMatch(claimGuard, /existing\.listing_id|listing_reserved/);
assert.match(claimGuard, /existing\.coupon_user_id[\s\S]{0,260}coupon_reserved/);

const core = paidOnly.match(
  /create or replace function public\.create_checkout_order_paid_only_v1[\s\S]*?end;\n\$\$/i,
)?.[0] || '';
assert.match(core, /v_listing\.status <> 'on_sale' or v_listing\.sold_order_id is not null/);
assert.doesNotMatch(core, /reserved_order_id|reserved_until/);

const listingGuard = paidOnly.match(
  /create or replace function public\.guard_listing_reservation_owner_v1\(\)[\s\S]*?end;\n\$\$/i,
)?.[0] || '';
assert.match(listingGuard, /v_contract = 2[\s\S]{0,100}v_status in \('pending','payment_review'\)/);
assert.match(listingGuard, /not public\.is_payment_operation_hash_held_v1/);
assert.match(listingGuard, /new\.reserved_order_id := null;[\s\S]{0,100}new\.reserved_until := null/);

const wrapper = paidOnly.match(
  /create or replace function public\.create_checkout_order_edge_v1[\s\S]*?end;\n\$\$/i,
)?.[0] || '';
assert.match(wrapper, /v_result := public\.create_checkout_order_paid_only_v1/);
assert.match(wrapper, /'reservationMode','paid_only'/);
assert.doesNotMatch(wrapper, /orders_one_unresolved_listing_v2_idx|listing_reserved/);
assert.match(wrapper, /orders_one_unresolved_coupon_idx[\s\S]{0,160}coupon_reserved/);
assert.match(checkoutEdge, /reservationMode !== "paid_only"/);

const finalizer = paidOnly.match(
  /create or replace function public\.finalize_paid_order_v2[\s\S]*?end \$\$;/i,
)?.[0] || '';
const listingLock = finalizer.indexOf('from public.listings');
const forUpdate = finalizer.indexOf('for update;', listingLock);
const soldGuard = finalizer.indexOf("v_listing.status <> 'on_sale'", forUpdate);
const reserveWrite = finalizer.indexOf("set status = 'reserved'", soldGuard);
assert(listingLock >= 0 && forUpdate > listingLock && soldGuard > forUpdate && reserveWrite > soldGuard,
  'provider-verified finalization must serialize on the listing row before reserving it');
assert.match(finalizer, /reserved_order_id = v_order\.id[\s\S]{0,100}reserved_until = 'infinity'/);
assert.match(
  listingLifecycle,
  /new\.status in \([\s\S]{0,100}'confirmed'[\s\S]{0,180}set status = 'sold'/,
  'purchase confirmation must remain the separate sold-out transition',
);
assert.match(policy, /failureKind === 'listing_conflict'[\s\S]{0,100}'cancel_conflict'/);

assert.match(workflow, /reservationMode'='paid_only'/);
assert.match(workflow, /paid-only checkout must not keep an unresolved listing unique index/);
assert.match(guide, /먼저 원자적으로 확정한 한 주문만 성공[\s\S]{0,80}자동 전액 취소·환불/);

console.log('paid-only checkout contract: ok');
