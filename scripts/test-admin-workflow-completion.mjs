import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const [migration, data, controller, services, sellConfig, permissionConfig] = await Promise.all([
  read('../supabase/migrations/20260831160000_admin_sell_workflows_permissions.sql'),
  read('../prototypes/admin-console-v2/data/admin-console-data.js'),
  read('../prototypes/admin-console-v2/features/operations/admin-operation-controller.js'),
  read('../prototypes/admin-console-v2/services/admin/admin-operations-service.js'),
  read('../prototypes/admin-console-v2/features/operations/admin-sell-config.js'),
  read('../prototypes/admin-console-v2/features/operations/admin-permission-config.js')
]);

for (const moduleId of ['consignments', 'purchases', 'inspections', 'permissions']) {
  assert.match(data, new RegExp(`${moduleId}: \\{[\\s\\S]*?current: true`), `${moduleId} must be current`);
  assert.match(data, new RegExp(`id: '${moduleId}'[^\n]*current: true`), `${moduleId} navigation must be current`);
}
assert.match(controller, /sellConfigs\(service\.sell\)/);
assert.match(controller, /permissionConfigs\(service\.permissions/);
assert.match(services, /sell,[\s\S]*permissions,[\s\S]*loadOverview/);
assert.match(sellConfig, /final_amount[\s\S]*최종 매입금액/);
assert.match(sellConfig, /commission_rate[\s\S]*expected_settlement/);
assert.match(permissionConfig, /disabled: item\?\.is_self/);

for (const table of [
  'sell_service_operations', 'sell_service_operation_events',
  'admin_operator_permissions', 'admin_permission_events'
]) {
  assert.match(migration, new RegExp(`create table if not exists public\\.${table}`));
  assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
}
assert.match(migration, /admin_manage_sell_service[\s\S]*ACTIVE_ADMIN_REQUIRED[\s\S]*SELL_MANAGE_REQUIRED/);
assert.match(migration, /admin_manage_operator_permissions[\s\S]*PERMISSION_MANAGE_REQUIRED[\s\S]*SELF_PERMISSION_CHANGE_FORBIDDEN/);
assert.match(migration, /VERSION_CONFLICT/g);
assert.match(migration, /sell_service_operation_events[\s\S]*reason[\s\S]*version_before[\s\S]*version_after/);
assert.match(migration, /admin_permission_events[\s\S]*previous_value[\s\S]*next_value/);
assert.doesNotMatch(migration, /grant\s+(insert|update|delete|all)[^;]*\bto\s+(anon|authenticated)/i);
assert.match(migration, /grant execute on function public\.admin_manage_sell_service[^;]*to authenticated/);
assert.match(migration, /grant execute on function public\.admin_manage_operator_permissions[^;]*to authenticated/);

console.log('admin workflow completion: 4 modules, RLS, scoped RPC, audit and version gates pass');
