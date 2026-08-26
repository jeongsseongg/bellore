import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { publicCheckoutRecovery } from '../supabase/functions/_shared/checkout-recovery.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(join(root, file), 'utf8').replace(/\r\n?/g, '\n');
const edge = read('supabase/functions/create-checkout/index.ts');
const adapter = read('supabase/functions/_shared/checkout-recovery.ts');
const userId = '11111111-1111-4111-8111-111111111111';
const listingId = '22222222-2222-4222-8222-222222222222';
const row = {
  order_no: `BLR${'A'.repeat(24)}`,
  amount: '1300',
  status: 'pending',
  listing_id: listingId,
  payment_contract_version: 2,
  customer_id: userId,
};

assert.deepEqual(publicCheckoutRecovery(row, userId), {
  exists: true, orderNo: row.order_no, amount: 1300, status: 'pending', listingId,
});
assert.equal(publicCheckoutRecovery(row, '33333333-3333-4333-8333-333333333333'), null);
assert.equal(publicCheckoutRecovery({ ...row, customer_id: null }, userId), null);
assert.deepEqual(publicCheckoutRecovery({ ...row, customer_id: null }, null)?.orderNo, row.order_no);
for (const invalid of [
  { ...row, payment_contract_version: null },
  { ...row, status: 'provider_secret_state' },
  { ...row, amount: '1300.5' },
  { ...row, listing_id: 'not-a-uuid' },
  { ...row, order_no: 'BLR-LEGACY' },
]) assert.equal(publicCheckoutRecovery(invalid, userId), null);

assert.match(edge, /\.eq\("payment_contract_version", 2\)/);
assert.match(edge, /baseRecoveryQuery\.eq\("customer_id", caller\.callerId\)/);
assert.match(edge, /baseRecoveryQuery\.is\("customer_id", null\)/);
assert.match(edge, /publicCheckoutRecovery\(existing, caller\.callerId\)/);
assert.doesNotMatch(edge, /select\([^\n]*(?:payment_key|receipt_url|admin_memo)/);
assert(edge.split('\n').length <= 400, 'create-checkout Edge source exceeds the 400-line ceiling');
assert(adapter.split('\n').length <= 120, 'checkout recovery adapter should remain a small typed boundary');

console.log('checkout Edge recovery ownership, public type, and source ceiling: ok');
