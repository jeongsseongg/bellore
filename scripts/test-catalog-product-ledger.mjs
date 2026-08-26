import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createAdminCatalogService } from '../prototypes/admin-console-v2/services/admin/admin-catalog-service.js';
import { catalogConfigs } from '../prototypes/admin-console-v2/features/operations/admin-catalog-config.js';

const root = new URL('../', import.meta.url);
const schema = await readFile(new URL('supabase/migrations/20260826200000_catalog_product_ledger.sql', root), 'utf8');
const operations = await readFile(new URL('supabase/migrations/20260826201000_catalog_product_operations.sql', root), 'utf8');
const legacy = await readFile(new URL('supabase.js', root), 'utf8');
const serviceSource = await readFile(new URL('prototypes/admin-console-v2/services/admin/admin-catalog-service.js', root), 'utf8');
const viewSource = await readFile(new URL('prototypes/admin-console-v2/features/operations/admin-operation-view.js', root), 'utf8');
const cssSource = await readFile(new URL('prototypes/admin-console-v2/features/operations/admin-operations.css', root), 'utf8');
const workflow = await readFile(new URL('.github/workflows/db-maintenance.yml', root), 'utf8');
const dryRun = await readFile(new URL('supabase/tests/catalog_product_ledger_dry_run.sql', root), 'utf8');
const liveVerify = await readFile(new URL('supabase/tests/catalog_product_ledger_live_verify.sql', root), 'utf8');
const controllerSource = await readFile(new URL('prototypes/admin-console-v2/features/operations/admin-operation-controller.js', root), 'utf8');

assert.match(schema, /create table if not exists public\.listing_operational_state/);
assert.match(schema, /approval_status[\s\S]*inspection_status[\s\S]*sale_status[\s\S]*inventory_status[\s\S]*display_status/);
assert.match(schema, /listing_price_versions[\s\S]*listing_inventory_movements[\s\S]*listing_display_assignments[\s\S]*listing_operation_events/);
assert.match(schema, /LISTING_NOT_OPERATIONALLY_AVAILABLE/);
assert.match(schema, /new\.reserved_order_id is distinct from old\.reserved_order_id/);
assert.match(schema, /new\.sold_order_id[\s\S]*new\.status='sold'[\s\S]*'sold'/);
assert.match(schema, /LISTING_ARCHIVE_REQUIRED[\s\S]*LISTING_HAS_LINKED_RECORDS/);
assert.match(schema, /ROLEX[\s\S]*PATEK PHILIPPE[\s\S]*AUDEMARS PIGUET/);
assert.match(schema, /\('오메가','OME'/);
assert.match(schema, /\('파텍필립','PAT'/);
assert.match(schema, /\('바쉐론콘스탄틴','VAC'/);
assert.match(schema, /\('로저드뷔','RDU'/);
assert.match(schema, /그랜드세이코[\s\S]*리브토만[\s\S]*몽블랑[\s\S]*보메 메르시에[\s\S]*부쉐러/);
assert.match(schema, /enable row level security[\s\S]*revoke all[\s\S]*_admin_select/);
assert.match(schema, /PRODUCT_NO_SERVER_MANAGED/);
assert.match(schema, /CATALOG_UPSTREAM_MIGRATION_MISSING/);
assert.match(schema, /session_user[\s\S]*request\.jwt\.claims/);
assert.match(schema, /결제 상태 자동 반영[\s\S]*listing_inventory_movements|listing_inventory_movements[\s\S]*결제 상태 자동 반영/);
assert.match(schema, /revoke insert,update,delete on public\.listings from anon,authenticated/);
assert.match(schema, /old\.sold_order_id is not null[\s\S]*new\.status='on_sale'[\s\S]*'active'/);
assert.doesNotMatch(schema, /when archived_at is null then 'available'/,
  '관리자 숨김 처리가 재고를 판매 가능으로 되돌리면 안 됩니다.');
assert.doesNotMatch(schema, /update public\.listings\s+set approval_status/i,
  '초기 원장 도입은 결제 보류가 걸린 상품행을 일괄 갱신하면 안 됩니다.');

assert.match(operations, /catalog_assert_admin\(\)[\s\S]*role='admin'[\s\S]*approved=true[\s\S]*suspended/);
assert.match(operations, /for update/);
assert.match(operations, /VERSION_CONFLICT/);
assert.match(operations, /VERSION_REQUIRED/);
assert.match(operations, /reserved_order_id is not null then raise exception 'CHECKOUT_RESERVATION_ACTIVE'/);
assert.match(operations, /LISTING_CONTENT_REQUIRED/);
assert.match(operations, /v_price<=0 then raise exception 'PRICE_REQUIRED'/);
assert.match(operations, /listing_price_versions[\s\S]*effective_until/);
assert.match(operations, /listing_inventory_movements/);
assert.match(operations, /catalog_sync_home_section[\s\S]*home_row_sale[\s\S]*home_row_drop[\s\S]*home_row_new/);
assert.match(operations, /sale_started_at \+ interval '72 hours'/);
assert.match(operations, /site_content_catalog_home_insert_guard[\s\S]*as restrictive/);
assert.match(operations, /홈 전시 해제[\s\S]*홈 전시 배치/);
assert.match(operations, /delete_draft[\s\S]*delete from public\.listings/);
assert.match(operations, /grant execute on function public\.admin_manage_listing[\s\S]*to authenticated/);

assert.doesNotMatch(serviceSource, /client\.remove\('listings'/);
assert.doesNotMatch(legacy, /function makeProductNo|function priceGrade/);
assert.match(legacy, /deleteProduct[\s\S]*admin_manage_listing[\s\S]*p_action: 'archive'/);
assert.match(viewSource, /operation-filter-bar/);
assert.match(viewSource, /operation-field-group/);
assert.match(viewSource, /상품 운영 이력/);
assert.match(cssSource, /min-height:\s*52px[\s\S]*border-radius:\s*12px/);
assert.match(cssSource, /@media \(max-width: 760px\)[\s\S]*min-width:\s*0[\s\S]*content:\s*attr\(data-label\)/);
assert.match(workflow, /validate-catalog-product[\s\S]*apply-catalog-product[\s\S]*verify-catalog-product-live/);
assert.match(workflow, /apply-catalog-product'[\s\S]*confirm_sha must exactly match GITHUB_SHA[\s\S]*BACKUP_PASSPHRASE/);
assert.match(workflow, /catalog_product_ledger_dry_run\.sql[\s\S]*catalog_product_ledger_live_verify\.sql/);
assert.match(workflow, /insert into supabase_migrations\.schema_migrations[\s\S]*20260826200000[\s\S]*20260826201000/);
assert.match(dryRun, /20260826210000_harden_admin_member_lifecycle\.sql/,
  '상품 원장 검증은 함께 적용되는 회원 운영 마이그레이션도 같은 롤백 트랜잭션에서 컴파일해야 합니다.');
assert.match(workflow, /migration_version_name_collision/,
  '운영 적용 전에 동일 버전의 다른 migration 이름 충돌을 차단해야 합니다.');
assert.match(dryRun, /begin;[\s\S]*catalog_product_ledger\.sql[\s\S]*catalog_product_operations\.sql[\s\S]*rollback;/);
assert.match(dryRun, /CATALOG_VERSION_CONFLICT_NOT_BLOCKED[\s\S]*CATALOG_LIFECYCLE_ACTIVATION_FAILED[\s\S]*CATALOG_DRAFT_DELETE_FAILED/);
assert.match(dryRun, /CATALOG_RETURN_HOLD_FAILED[\s\S]*complete_order_restock_v1[\s\S]*CATALOG_RESTOCK_SYNC_FAILED/);
assert.match(liveVerify, /CATALOG_MIGRATION_HISTORY_MISSING[\s\S]*catalog product ledger live verification passed/);
assert.match(liveVerify, /CATALOG_BASELINE_HISTORY_INCOMPLETE[\s\S]*CATALOG_TRIGGER_SET_INCOMPLETE/);
assert.match(controllerSource, /schema cache[\s\S]*운영 데이터 구조가 아직 적용되지 않았습니다/);
assert.doesNotMatch(controllerSource, /state\.error = error\?\.message/);

const calls = [];
const client = {
  list: async (table) => {
    calls.push(table);
    if (table === 'listings') return [{ id: 'watch-1', title: 'ROLEX', description: '서브마리너', price: 15000000, status: 'on_sale' }];
    if (table === 'listing_operational_state') return [{ listing_id: 'watch-1', approval_status: 'approved', inspection_status: 'passed', sale_status: 'active', inventory_status: 'available', display_status: 'visible', operation_version: 4 }];
    return [];
  },
  rpc: async (name, body) => { calls.push({ name, body }); return { ok: true }; },
  upload: async () => 'https://example.com/watch.jpg'
};
const service = createAdminCatalogService(client, 'admin-1');
const rows = await service.listListings();
assert.equal(rows[0].inspection_status, 'passed');
assert.equal(rows[0].operation_version, 4);
assert.deepEqual(calls.slice(0, 2).sort(), ['listing_operational_state', 'listings']);

await service.saveListing('watch-1', {
  title: '롤렉스', description: '서브마리너', price: 15000000, commission_percent: 10,
  inventory_status: 'available', operation_version: 4, operation_reason: '가격 및 위치 확인 완료'
});
const rpc = calls.find((call) => call?.name === 'admin_manage_listing');
assert.equal(rpc.body.p_action, 'save');
assert.equal(rpc.body.p_payload.operation_version, 4);
assert.equal(rpc.body.p_payload.commission_rate, 0.1);
assert.equal(rpc.body.p_reason, '가격 및 위치 확인 완료');

const config = catalogConfigs(service).listings;
assert.equal(config.actions.length, 12);
assert(config.actions.some((action) => action.id === 'inspection-pass'));
assert(config.actions.some((action) => action.id === 'archive'));
assert(config.actions.some((action) => action.id === 'delete-draft'));
assert(!config.actions.some((action) => ['reserved', 'sold'].includes(action.id)));
const actionStart = calls.filter((call) => call?.name === 'admin_manage_listing').length;
for (const action of config.actions) {
  await action.run({
    id: 'watch-1', operation_version: 4, inspection_status: 'pending', approval_status: 'pending',
    sale_status: 'paused', display_status: 'hidden', archived_at: null
  }, { reason: '운영 처리 근거 확인' });
}
const actionCalls = calls.filter((call) => call?.name === 'admin_manage_listing').slice(actionStart);
assert.equal(actionCalls.length, 12);
for (const call of actionCalls) {
  assert.equal(call.body.p_payload.operation_version, 4);
  assert.equal(call.body.p_reason, '운영 처리 근거 확인');
}

const failingService = createAdminCatalogService({
  rpc: async () => { throw new Error('VERSION_CONFLICT'); }
}, 'admin-1');
await assert.rejects(
  failingService.manageListing('watch-1', 'archive', { operation_version: 4 }, '보관 사유 확인'),
  /다른 관리자가 먼저 변경했습니다/
);

console.log('catalog product ledger: schema=2 rpc=1 operational-lanes=5 guards=8 pass');
