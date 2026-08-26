import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8').replace(/\r\n?/g, '\n');
const migration = read('supabase/migrations/20260826170000_checkout_claim_integrity.sql');
const checkout = read('supabase/functions/create-checkout/index.ts');
const workflow = read('.github/workflows/db-maintenance.yml');

const rateCall = migration.indexOf('perform public.consume_checkout_rate_limit(p_rate_key);');
const protectedBlock = migration.indexOf('begin\n    perform set_config', rateCall);
const caughtError = migration.indexOf('exception when others then', protectedBlock);
assert.ok(rateCall >= 0 && protectedBlock > rateCall && caughtError > protectedBlock,
  'rate increment must be outside the rollback-only checkout subtransaction');
assert.match(migration, /v_error_state = '23505'[\s\S]{0,180}orders_one_unresolved_coupon_idx[\s\S]{0,160}coupon_reserved/);
assert.match(migration, /v_error_state = '23505'[\s\S]{0,180}orders_one_unresolved_listing_v2_idx[\s\S]{0,160}listing_reserved/);
assert.match(migration, /return jsonb_build_object\('error',v_error\)/);
assert.match(checkout, /const domainError = safeText\(order\?\.error, 80\)/);
assert.ok(
  checkout.indexOf('const domainError = safeText(order?.error, 80)') < checkout.indexOf('const orderNo = safeText(order?.orderNo, 160)'),
  'structured checkout rejection must be handled before public-order validation',
);
assert.match(checkout, /publicCheckoutError\(\{ message: domainError \}\)/);
assert.match(workflow, /v_result->>'error' <> 'checkout_amount_changed'/);
assert.match(workflow, /attempt_count from public\.checkout_rate_limits where key_hash=repeat\('f',64\)[\s\S]{0,100}<> 1/);

console.log('failed checkout rate-limit durability contract: ok');
