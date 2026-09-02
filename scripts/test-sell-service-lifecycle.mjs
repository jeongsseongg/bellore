import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

const migration = await read('supabase/migrations/20260902150000_sell_service_lifecycle.sql');
const edge = await read('supabase/functions/sell-request-access/index.ts');
const adapter = await read('app/services/sell/sell-request-access.js');
const action = await read('app/features/sell-method/sell-handoff-action.js');
const pages = await read('app/features/sell-method/sell-service-pages.js');

assert.match(migration, /add column if not exists input_key text/);
assert.match(migration, /offer_amount bigint/);
assert.match(migration, /trade_method text/);
assert.match(migration, /requested_visit_at timestamptz/);
assert.match(migration, /customer_contacted boolean/);
assert.match(migration, /received_at timestamptz/);
assert.match(migration, /inspected_at timestamptz/);
assert.match(migration, /settled_at timestamptz/);
assert.match(migration, /private\.sell_service_new_key\(\)/);
assert.match(migration, /'sell_handoff_requested'/);
assert.match(migration, /telegram_ops_offer_sell_service/);
assert.match(migration, /telegram_ops_advance_sell_service/);
assert.match(migration, /telegram_ops_complete_quote_followup/);
assert.match(migration, /telegram_ops_enqueue_cycle_followups/);

assert.match(edge, /action === "request-handoff"/);
assert.match(edge, /found\.data\.owner_user_id !== user\.id/);
assert.match(edge, /guestSessionRequestId/);
assert.match(edge, /hour < 11 \|\| hour >= 19/);
assert.match(edge, /\[0, 30\]\.includes\(minute\)/);
assert.match(edge, /status: "handoff_requested"/);

assert.match(adapter, /backend\.requestSellHandoff/);
assert.match(adapter, /sessionToken/);
assert.match(action, /벨로르 종로점/);
assert.match(action, /벨로르 청담점/);
assert.match(action, /영업시간 11:00–19:00/);
assert.match(action, /requestSellHandoff/);
assert.match(action, /담당자가 연락드리겠습니다/);
assert.match(pages, /createSellHandoffAction/);
assert.doesNotMatch(pages, /record\.status = 'handoff'/);

console.log('sell service lifecycle: persistence=1 offer=1 handoff=1 visit=1 followup=1 passed');
