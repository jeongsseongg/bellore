import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeSellParts } from '../supabase/functions/sell-request-access/sell-parts-core.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const allCodes = ['warranty', 'box', 'manual', 'extra-link', 'tag', 'receipt'];

assert.deepEqual(normalizeSellParts(allCodes), ['풀세트']);
assert.deepEqual(normalizeSellParts(allCodes.join(', ')), ['풀세트']);
assert.deepEqual(normalizeSellParts(['box', 'warranty']), ['보증서', '정품 박스']);
assert.deepEqual(normalizeSellParts('보증서, 정품 박스'), ['보증서', '정품 박스']);
assert.deepEqual(normalizeSellParts(['warranty', '기타 구성품']), ['보증서', '기타 구성품']);

const script = fs.readFileSync(path.join(root, 'script.js'), 'utf8');
const edge = fs.readFileSync(path.join(root, 'supabase/functions/sell-request-access/index.ts'), 'utf8');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const worker = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const customerNameMigration = fs.readFileSync(path.join(root, 'supabase/migrations/20260831182000_prefer_sell_request_customer_name.sql'), 'utf8');
const existingPartsMigration = fs.readFileSync(path.join(root, 'supabase/migrations/20260831183000_normalize_existing_sell_parts.sql'), 'utf8');
const assetKey = 'script.js?v=20260831-sell-parts-korean-v1';

assert.match(script, /function localizeSellParts\(values\)/);
assert.match(script, /if \(selected\.indexOf\('풀세트'\) !== -1 \|\| allSelected\) return \['풀세트'\]/);
assert.match(script, /parts: localizeSellParts\(fd\.getAll \? fd\.getAll\('parts'\) : \[\]\)/);
assert.match(edge, /const itemParts = normalizeSellParts\(body\.parts\)\.join\(", "\)/);
assert.match(edge, /parts: normalizeSellParts\(row\.item_parts\)\.join\(", "\)/);
assert.ok(index.includes(assetKey));
assert.ok(worker.includes(`'./${assetKey}'`));
assert.match(worker, /const VERSION = "bellore-v\d+-[^"]+";/);
assert.match(customerNameMigration, /where s\.quote_request_id = \(new\.payload ->> 'quoteId'\)::uuid/);
assert.match(customerNameMigration, /jsonb_set\(new\.payload, '\{customerName\}'/);
assert.match(existingPartsMigration, /then '풀세트'/);
assert.match(existingPartsMigration, /update public\.quote_requests/);
assert.match(existingPartsMigration, /update public\.sell_service_requests/);

console.log('sell-parts localization and applicant name: 17/17 passed');
