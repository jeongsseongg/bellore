'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

const advisor = read('ai-advisor.js');
const wishlist = read('wishlist.js');
const payments = read('payments.js');
const supabaseClient = read('supabase.js');
const checkout = read('supabase', 'functions', 'create-checkout', 'index.ts');
const confirmPayment = read('supabase', 'functions', 'confirm-payment', 'index.ts');
const paymentEdgeUtils = read('supabase', 'functions', '_shared', 'payment-edge-utils.ts');
const paymentRecovery = read('supabase', 'functions', '_shared', 'payment-recovery.ts');
const aiLearn = read('supabase', 'functions', 'ai-learn', 'index.ts');
const outcomeMigration = read('supabase', 'recommendation_v2_outcome_attribution.sql');

// Recommendation context is kept in the consent-controlled customer event graph.
assert.match(advisor, /function rememberRecommendationTouch/);
assert.match(advisor, /function recommendationAttribution/);
assert.match(advisor, /eventValue\.recommendation = recommendation/);
assert.match(wishlist, /recommendation_attribution/);
assert.match(outcomeMigration, /create table public\.ai_paid_recommendation_attributions/);
assert.match(outcomeMigration, /trg_ai_strip_order_recommendation/);

// The current production checkout remains server-authoritative. The unpublished
// paid-recommendation candidate must not widen the order/payment trust boundary.
assert.match(payments, /BelloreAnalytics\.conversionContext/);
assert.doesNotMatch(payments, /attribution\.recommendation\s*=/);
assert.match(payments, /checkoutToken: order\.checkoutToken/);
assert.match(payments, /serverAmount !== amount/);
assert.match(supabaseClient, /function paymentAccessToken\(options\)/);
assert.match(supabaseClient, /client = window\.BELLORE_CHECKOUT_CLIENT/);
assert.match(supabaseClient, /return client\.create\(\{/);
assert.match(supabaseClient, /getAccessToken: paymentAccessToken, request: paymentFetch/);
assert.match(supabaseClient, /network = window\.BELLORE_PAYMENT_NETWORK/);
assert.match(supabaseClient, /return network\.request\(url, options, timeoutMs\)/);
assert.match(checkout, /function sanitizeAttribution/);
assert.doesNotMatch(checkout, /recommendation:\s*recommendation/);
assert.match(paymentEdgeUtils, /export function sanitizePaymentAttribution/);
assert.match(confirmPayment, /sanitizePaymentAttribution, sha256Hex/);
assert.match(confirmPayment, /sanitizePaymentAttribution\(body\.attribution\)/);
assert.doesNotMatch(confirmPayment, /validatedRecommendation/);
assert.match(confirmPayment, /sha256Hex\(checkoutToken\)/);
assert.match(paymentEdgeUtils, /return checkoutTokenMatches \|\| Boolean\(customerId && callerId === customerId\)/);
assert.match(confirmPayment, /confirmationAuthorized\(order\.customer_id, callerId, checkoutTokenMatches\)/);
assert.match(confirmPayment, /finalizePaidOrderFromProvider\(\{/);
assert.match(paymentRecovery, /rpc\("finalize_paid_order_v2"/);
assert.match(confirmPayment, /hasConfirmedPaymentStatus/);

// The profile summarizer is not an arbitrary service-role write oracle.
assert.match(aiLearn, /authClient\.auth\.getUser\(token\)/);
assert.match(aiLearn, /AI_LEARN_ADMIN_REQUIRED/);
assert.match(aiLearn, /async function canUseProfile/);
assert.match(aiLearn, /\.eq\("consent_personalization", true\)/);
assert.match(aiLearn, /data\.user_id === actor\.userId/);
assert.doesNotMatch(aiLearn, /return json\(\{ error: "server_error", detail:/);

console.log('recommendation context and payment-authority boundary: ok');
