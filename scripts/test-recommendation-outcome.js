const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

const advisor = read('ai-advisor.js');
const wishlist = read('wishlist.js');
const payments = read('payments.js');
const supabaseClient = read('supabase.js');
const confirmPayment = read('supabase', 'functions', 'confirm-payment', 'index.ts');
const aiLearn = read('supabase', 'functions', 'ai-learn', 'index.ts');
const analyticsCanonical = read('analytics_v3_canonical.sql');
const outcomeMigration = read('supabase', 'recommendation_v2_outcome_attribution.sql');

// Recommendation request metadata survives the immediate click ->
// wish/cart -> checkout path without being stored on a pending order.
assert.match(advisor, /function rememberRecommendationTouch/);
assert.match(advisor, /function recommendationAttribution/);
assert.match(advisor, /eventValue\.recommendation = recommendation/);
assert.match(wishlist, /recommendation_attribution/);
assert.match(payments, /attribution\.recommendation = product\.recommendation_attribution/);
assert.match(payments, /delete orderAttribution\.recommendation/);
assert.match(payments, /checkoutToken: order\.checkoutToken/);
assert.match(payments, /outcome_source: 'client_after_server_confirmation'/);
assert.match(supabaseClient, /function createCheckoutCredential/);
assert.match(supabaseClient, /window\.crypto\.getRandomValues/);
assert.match(supabaseClient, /row\.checkout_token_hash = credential\.hash/);
assert.match(supabaseClient, /sessionResult\.data\.session\.access_token/);
assert.match(supabaseClient, /checkoutToken: params\.checkoutToken/);

// The paid label comes from PortOne/server verification. An exact request ID is
// used as a hint when it survives checkout; the DB otherwise records the latest
// same-user/same-product click within seven days. That is descriptive last-click
// instrumentation, not causal lift or proof against a malicious client.
assert.match(confirmPayment, /async function validatedRecommendation/);
assert.match(confirmPayment, /\.eq\("user_id", order\.customer_id\)/);
assert.match(confirmPayment, /\.eq\("product_id", order\.listing_id\)/);
assert.match(confirmPayment, /\.eq\("event_type", "recommendation_click"\)/);
assert.match(confirmPayment, /\.contains\("value", \{ request_id: requested\.request_id \}\)/);
assert.match(confirmPayment, /outcome_source: "server_verified_paid_order"/);
assert.match(confirmPayment, /analytics_finalize_paid_order_with_benefits/);
assert.match(confirmPayment, /async function canConfirmOrder/);
assert.match(confirmPayment, /admin\.auth\.getUser\(bearer\)/);
assert.match(confirmPayment, /checkout_token_hash/);
assert.match(confirmPayment, /function publicOrder/);
assert.match(confirmPayment, /POINT_EARN_RATE_RAW/);
assert.match(confirmPayment, /point_rate_misconfigured/);
assert.match(confirmPayment, /POINT_EARN_BPS === 0/);
assert.match(confirmPayment, /PORTONE_LIVE_CHANNEL_KEYS/);
assert.match(confirmPayment, /payment\?\.currency/);
assert.match(confirmPayment, /channelType !== "LIVE"/);
assert.match(confirmPayment, /PORTONE_LIVE_CHANNEL_KEYS\.includes\(channelKey\)/);
assert.match(confirmPayment, /"store_mismatch", \{\}, false/);
assert.match(confirmPayment, /"currency_mismatch", \{\}, false/);
assert.match(confirmPayment, /"channel_mismatch", \{/);
assert.match(confirmPayment, /paid provenance conflict requires operator review/);
assert.match(confirmPayment, /if \(order\.paid_at\)/);
assert.match(confirmPayment, /payment_reversed/);
assert.match(confirmPayment, /reconcile_existing_paid_order_benefits/);
assert.match(confirmPayment, /uc\.status === "reserved"/);
assert.match(confirmPayment, /uc\.order_id === order\.id/);
assert.match(confirmPayment, /\["FAILED", "CANCELLED"\]/);
assert.match(confirmPayment, /status: "payment_review"/);
assert.match(confirmPayment, /cancelStatus === "SUCCEEDED"/);
assert.match(confirmPayment, /async function resolvePaidOrderConflict/);
assert.match(confirmPayment, /async function respondToPaidOrderConflict/);
assert.match(confirmPayment, /`\$\{reason\}_auto_cancel`/);
assert.match(confirmPayment, /if \(!listingAvailable\)/);
assert.match(confirmPayment, /isInventoryFinalizeConflict\(finalizeError\)/);
assert.match(confirmPayment, /if \(latest\.paid_at\) return \{ state: "settled"/);
assert.match(confirmPayment, /paid_review_reclaim_failed/);
assert.doesNotMatch(confirmPayment,
  /\["failed", "canceled"\][\s\S]{0,160}return \{ state: "canceled"/);
assert.match(confirmPayment, /"price_unverifiable_no_listing"/);
assert.match(confirmPayment, /"coupon_reservation_invalid"/);
assert.match(confirmPayment, /"amount_mismatch",[\s\S]*\{ expected, got: paidAmount \}/);
assert.match(confirmPayment, /"order_finalize_failed"/);
assert.doesNotMatch(confirmPayment,
  /if \(finalizeError \|\| !finalized\?\.order\)[\s\S]{0,220}return json\([^\n]+500\)/);
assert.doesNotMatch(confirmPayment,
  /if \(String\(listing\.status[^\n]+!== "on_sale"\)\s*\{\s*return json\(\{ error: "listing_not_available"/);
assert.doesNotMatch(confirmPayment, /\.from\("profiles"\)[\s\S]{0,120}\.update\(/);
assert.doesNotMatch(confirmPayment, /\.from\("point_ledger"\)[\s\S]{0,120}\.insert\(/);
assert.doesNotMatch(confirmPayment, /\.from\("user_coupons"\)[\s\S]{0,120}\.update\(/);
assert.doesNotMatch(confirmPayment, /alreadyPaid: true, order \}/);
assert.doesNotMatch(confirmPayment, /return json\(\{ error: "server_error", detail:/);

assert.match(outcomeMigration, /RECOMMENDATION_V2_EXISTING_ORDER_RECOMMENDATION_REVIEW_REQUIRED/);
assert.match(outcomeMigration, /create table public\.ai_paid_recommendation_attributions/);
assert.match(outcomeMigration, /recommendation_event_id uuid not null[\s\S]*on delete cascade/);
assert.match(outcomeMigration, /references auth\.users\(id\) on delete cascade/);
assert.match(outcomeMigration, /references public\.customer_ai_profiles\(id\) on delete cascade/);
assert.match(outcomeMigration, /trg_ai_strip_order_recommendation/);
assert.match(outcomeMigration, /checkout_token_hash/);
assert.match(outcomeMigration, /last_recommendation_click_7d/);
assert.match(outcomeMigration, /event\.profile_id = v_profile_id/);
assert.match(outcomeMigration, /event\.user_id = v_user_id/);
assert.match(outcomeMigration, /event\.product_id = v_order\.listing_id/);
assert.match(outcomeMigration, /interval '7 days'/);
assert.match(outcomeMigration, /v_requested_request_id is null/);
assert.match(outcomeMigration, /for key share/);
assert.match(outcomeMigration, /for update/);
assert.match(outcomeMigration, /'newly_paid', v_newly_paid/);
assert.match(outcomeMigration, /create or replace function public\.ai_guard_paid_order_state/);
assert.match(outcomeMigration, /PAID_ORDER_FINALIZE_RPC_REQUIRED/);
assert.match(outcomeMigration, /ORDER_NUMBER_IMMUTABLE/);
assert.match(outcomeMigration, /UNPAID_ORDER_STATE_INVALID/);
assert.match(outcomeMigration, /ORDER_LISTING_IMMUTABLE/);
assert.match(outcomeMigration, /ORDER_CUSTOMER_IMMUTABLE/);
assert.match(outcomeMigration, /ORDER_COUPON_IMMUTABLE/);
assert.match(outcomeMigration, /PAID_ORDER_FINANCIAL_SNAPSHOT_IMMUTABLE/);
assert.match(outcomeMigration, /create or replace function public\.ai_guard_paid_order_delete/);
assert.match(outcomeMigration, /PAID_ORDER_DELETE_FORBIDDEN/);
assert.match(outcomeMigration, /bellore\.payment_finalize_rpc/);
assert.match(outcomeMigration, /create or replace function public\.ai_guard_paid_listing_status/);
assert.match(outcomeMigration, /PAID_LISTING_RELIST_RPC_REQUIRED/);
assert.match(outcomeMigration, /set status = 'sold'/);
assert.match(outcomeMigration, /create unique index if not exists uq_orders_paid_listing/);
assert.match(outcomeMigration, /foreign key \(listing_id\) references public\.listings\(id\)[\s\S]*on delete restrict/);
assert.match(outcomeMigration, /create or replace function public\.ai_guard_profile_points/);
assert.match(outcomeMigration, /PROFILE_POINTS_RPC_REQUIRED/);
assert.match(outcomeMigration, /PAID_ORDER_TIMESTAMP_IMMUTABLE/);
assert.match(outcomeMigration, /ORDER_BENEFIT_SNAPSHOT_IMMUTABLE/);
assert.match(outcomeMigration, /create or replace function public\.ai_reserve_order_coupon/);
assert.match(outcomeMigration, /create or replace function public\.ai_release_pending_order_coupon/);
assert.match(outcomeMigration, /analytics_finalize_paid_order_with_benefits/);
assert.match(outcomeMigration, /reconcile_existing_paid_order_benefits/);
assert.match(outcomeMigration, /benefit_retry_acl/);
assert.match(outcomeMigration, /POINT_REWARD_REFUND_RPC_REQUIRED/);
assert.match(outcomeMigration, /point_ledger_order_id_fkey/);
assert.match(outcomeMigration, /on delete restrict/);

for (const sql of [analyticsCanonical, outcomeMigration]) {
  assert.match(sql, /- 'recommendation'/);
  assert.match(sql, /if v_order\.paid_at is null then/);
  assert.match(sql, /p_attribution := v_order\.analytics_attribution/);
  assert.match(sql, /'newly_paid', v_newly_paid/);
}
assert.doesNotMatch(analyticsCanonical, /from public\.customer_events event/);
assert.match(analyticsCanonical, /ANALYTICS_V3_REAPPLY_AFTER_RECOMMENDATION_V2_FORBIDDEN/);
assert.doesNotMatch(outcomeMigration, /analytics_attribution[\s\S]{0,100}jsonb_build_object\('recommendation'/);

// The profile summarizer is no longer an arbitrary service-role write oracle.
assert.match(aiLearn, /authClient\.auth\.getUser\(token\)/);
assert.match(aiLearn, /AI_LEARN_ADMIN_REQUIRED/);
assert.match(aiLearn, /async function canUseProfile/);
assert.match(aiLearn, /\.eq\("consent_personalization", true\)/);
assert.match(aiLearn, /data\.user_id === actor\.userId/);
assert.doesNotMatch(aiLearn, /return json\(\{ error: "server_error", detail:/);

console.log('recommendation paid-outcome and AI access invariants: ok');
