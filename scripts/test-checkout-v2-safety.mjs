import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const migration = read('supabase/migrations/20260828030000_checkout_fulfillment_method.sql');
const edge = read('supabase/functions/create-checkout/index.ts');
const backend = read('supabase.js');
const client = read('app/services/payments/checkout-client.js');
const payments = read('payments.js');
const workflow = read('.github/workflows/db-maintenance.yml');
const guide = read('docs/PAYMENTS_SETUP.md');
const config = read('supabase-config.js');

assert.match(migration, /checkout_fulfillment_column_contract_mismatch/);
assert.match(migration, /v_nullable <> 'NO'/);
assert.match(migration, /v_default[\s\S]{0,80}'''delivery''::text'/);
assert.equal((migration.match(/p_fulfillment_method is null or p_fulfillment_method not in/g) || []).length, 2);
assert.equal((migration.match(/coalesce\(auth\.role\(\),''\) <> 'service_role'/g) || []).length, 2);
assert.match(migration, /new\.fulfillment_method is null or new\.fulfillment_method not in/);
assert.equal((migration.match(/case when p_fulfillment_method='pickup' then null else left\(p_ship_/g) || []).length, 12,
  'pickup insert and replay comparison must normalize all six shipping fields');

for (const field of ['shipRecipient', 'shipPhone', 'shipPostcode', 'shipAddr1', 'shipAddr2', 'shipRequest']) {
  assert.match(edge, new RegExp(`const ${field} = fulfillmentMethod === "pickup" \\? null`));
}
assert.match(client, /const pickup = data\.fulfillmentMethod === 'pickup'/);
assert.match(client, /fulfillmentMethod: pickup \? 'pickup' : 'delivery'/);
assert.match(client, /result\.payload\.fulfillmentMethod === body\.fulfillmentMethod/);
assert.match(backend, /fulfillmentMethod: o\.fulfillment_method === 'pickup' \? 'pickup' : 'delivery'/);

assert.match(payments, /PAY\.virtualAccountRefundReady !== true/);
assert.match(payments, /requestSnapshot = requestSnapshot \|\| Object\.freeze/);
assert.match(payments, /channelKey: requestChannel\.channelKey/);
assert.match(payments, /payMethod: requestChannel\.payMethod \|\| 'CARD'/);
assert.match(payments, /requestPay\(true, requestGeneration, requestProduct, requestSnapshot\)/);
assert.doesNotMatch(
  payments.match(/var req = \{[\s\S]*?requestPayment\(req\)/)?.[0] || '',
  /selectedChannel/,
  'provider request must use the click-time channel snapshot',
);

for (const task of ['validate-checkout-v2', 'apply-checkout-v2', 'verify-checkout-v2-live']) {
  assert.match(workflow, new RegExp(`- ${task}`));
}
assert.match(workflow, /Validate checkout v2 migration and fulfillment contract \(always rollback\)/);
assert.match(workflow, /github\.ref == 'refs\/heads\/main' \|\| inputs\.task == 'validate-authority-payment' \|\| inputs\.task == 'validate-checkout-v2'/);
assert.match(workflow, /pickup fulfillment and null shipping normalization verified/);
assert.match(workflow, /delivery fulfillment and premium shipping amount verified/);
assert.match(workflow, /checkout_v2_partial_schema_detected/);
assert.match(workflow, /checkout_v2_migration_already_recorded_use_verify/);
assert.match(workflow, /'20260828030000','checkout_fulfillment_method',array\[\]::text\[\]/);
assert.match(workflow, /Verify live checkout v2 fulfillment contract/);
assert.match(workflow, /fulfillment_method='pickup'[\s\S]{0,220}ship_recipient is not null/);
assert.match(workflow, /APPLY_CHECKOUT_V2_TO_PRODUCTION/);

assert.match(guide, /스키마 rollback은 표준 복구 경로가 아닙니다/);
assert.match(guide, /virtualAccountRefundReady === true/);
assert.match(guide, /POINT_EARN_BPS[\s\S]{0,80}0을 유지/);
assert.match(config, /pointEarnBps:\s*0/);

console.log('checkout v2 deployment, fulfillment, snapshot, and refund gate contracts: ok');
