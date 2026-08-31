import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createAdminRestClient } from '../prototypes/admin-console-v2/services/platform/admin-rest-client.js';
import { createAdminCatalogService } from '../prototypes/admin-console-v2/services/admin/admin-catalog-service.js';
import { createAdminTradeService } from '../prototypes/admin-console-v2/services/admin/admin-trade-service.js';
import { createAdminAccountService } from '../prototypes/admin-console-v2/services/admin/admin-account-service.js';
import { createAdminOperationsService } from '../prototypes/admin-console-v2/services/admin/admin-operations-service.js';
import { displayText } from '../prototypes/admin-console-v2/features/operations/admin-display-text.js';
import { renderOperationDrawer, renderOperationPage } from '../prototypes/admin-console-v2/features/operations/admin-operation-view.js';
import { createLegacyMypageSettingsAdapter } from '../app/legacy/mypage-settings-adapter.js';

const requests = [];
const config = {
  label: '고객',
  headerMessage: '운영 안내',
  stats: [{ label: '보유 포인트' }],
  menuGroups: { trade: ['주문 내역'], activity: ['고객센터'] },
  footer: { phone: '010-0000-0000', hours: '운영시간' }
};

assert.equal(displayText('on_sale'), '판매중');
assert.equal(displayText('vendor'), '견적업체');
const normalizedPage = renderOperationPage({ title: '판매시계 관리', description: '목록', columns: ['상품'] }, {
  viewId: 'listings', query: '', loading: false, error: '', rows: [{}],
  filteredRows: [{ id: '상품-1', title: '롤렉스', sub: '서브마리너', cells: ['on_sale'], status: 'success', statusLabel: 'on_sale' }]
});
assert.match(normalizedPage, /판매중/);
assert.doesNotMatch(normalizedPage, />on_sale</);
const verificationDrawer = renderOperationDrawer({ fields: () => [], actions: [] }, {
  id: 'customer-1', title: '고객', sub: '회원', status: 'success', statusLabel: '운영중',
  raw: { verificationEventsLoaded: true, verificationEvents: [{
    method: 'phone', status: 'manual_verified', metadata: { reason: '본인 확인 완료' }, created_at: '2026-08-26T08:00:00Z'
  }] }
});
assert.match(verificationDrawer, /인증 처리 이력/);
assert.match(verificationDrawer, /휴대폰 인증/);
assert.match(verificationDrawer, /관리자 인증/);
assert.doesNotMatch(verificationDrawer, /manual_verified/);

function payloadFor(url, options) {
  if (url.includes('/rest/v1/site_content') && (!options.method || options.method === 'GET')) {
    return [{ key: 'mypage_customer_config', body: JSON.stringify(config) }];
  }
  if (url.includes('/rest/v1/site_content') && options.method === 'POST') {
    return [JSON.parse(options.body)];
  }
  if (url.includes('/rest/v1/quote_requests') && options.method === 'PATCH') {
    return [{ id: 'quote-1', status: 'open' }];
  }
  if (url.includes('/rest/v1/profiles') && options.method === 'PATCH') {
    return [{ id: 'vendor-1' }];
  }
  if (url.includes('/rest/v1/settlements') && options.method === 'PATCH') {
    return [{ id: 'settlement-1', status: 'paid' }];
  }
  if (url.includes('/rest/v1/notifications') && options.method === 'POST') {
    return [JSON.parse(options.body)];
  }
  if (url.includes('/functions/v1/notify-vip-kakao')) return { ok: true };
  if (url.includes('/functions/v1/admin-member-ops')) return { ok: true };
  if (url.includes('/functions/v1/admin-audit-events')) return { ok: true, events: [] };
  if (url.includes('/functions/v1/admin-manage-verification')) {
    const body = JSON.parse(options.body);
    if (body.action === 'list_events') return { ok: true, events: [] };
    return { ok: true, verifications: {}, auditEventId: 'audit-1' };
  }
  return [];
}

async function fakeFetch(url, options = {}) {
  requests.push({ url, options });
  const payload = payloadFor(url, options);
  return {
    ok: true,
    status: 200,
    headers: { get: () => 'application/json' },
    json: async () => payload,
    text: async () => JSON.stringify(payload)
  };
}

const client = createAdminRestClient({ getAccessToken: async () => 'verified-admin-token', fetchImpl: fakeFetch });
const catalog = createAdminCatalogService(client, 'admin-user');
const loaded = await catalog.loadMypageConfigs();
assert.equal(loaded.customer.headerMessage, '운영 안내');
assert.equal(loaded.vendor, null);
await catalog.saveMypageConfig('vendor', { ...config, label: '업체' });
await catalog.saveMypageConfig('admin', {
  ...config,
  label: '관리자',
  menuGroups: { trade: ['주문 관리'], activity: ['회원관리'] },
  blockOrder: ['order', 'trade'],
  order: { visible: true }
});

const siteRead = requests.find((item) => item.url.includes('/rest/v1/site_content') && (!item.options.method || item.options.method === 'GET'));
assert(siteRead.url.includes('key=in.%28mypage_customer_config%2Cmypage_vendor_config%2Cmypage_admin_config%29'));
const siteWrite = requests.find((item) => item.url.includes('/rest/v1/site_content') && item.options.method === 'POST');
assert.equal(siteWrite.options.headers.Authorization, 'Bearer verified-admin-token');
assert.equal(JSON.parse(siteWrite.options.body).key, 'mypage_vendor_config');
assert.equal(JSON.parse(JSON.parse(siteWrite.options.body).body).label, '업체');
const siteWrites = requests.filter((item) => item.url.includes('/rest/v1/site_content') && item.options.method === 'POST');
const adminConfig = JSON.parse(JSON.parse(siteWrites.at(-1).options.body).body);
assert.equal(adminConfig.label, '관리자');
assert.equal(adminConfig.menuGroups, undefined, '관리자 전용 메뉴를 일반 메뉴 설정으로 저장하면 안 됩니다.');
assert.equal(adminConfig.blockOrder, undefined, '관리자 전용 화면 순서를 일반 블록 순서로 저장하면 안 됩니다.');
assert.equal(adminConfig.order, undefined, '관리자 대시보드를 최근 주문 설정으로 저장하면 안 됩니다.');

const siteContentPolicy = await readFile(new URL('../supabase/migrations/20260831073000_harden_site_content_admin_write.sql', import.meta.url), 'utf8');
assert.match(siteContentPolicy, /app_metadata[^;]*role[^;]*admin/s,
  'site_content 쓰기는 관리자 app_metadata를 확인해야 합니다.');
assert.match(siteContentPolicy, /p\.approved is true/,
  'site_content 쓰기는 승인된 관리자만 허용해야 합니다.');
assert.match(siteContentPolicy, /coalesce\(p\.suspended, false\) is false/,
  'site_content 쓰기는 정지된 관리자를 거부해야 합니다.');

const trade = createAdminTradeService(client);
await trade.approveQuote('quote-1');
await new Promise((resolve) => setTimeout(resolve, 0));
assert(requests.some((item) => item.url.includes('/functions/v1/notify-vip-kakao')),
  '견적 승인 뒤 기존 우수 견적업체 알림 서버 기능을 요청해야 합니다.');

const accounts = createAdminAccountService(client, 'admin-user');
await accounts.saveProfile({ id: 'vendor-1', approved: false }, 'vendor', { approved: true });
const profileNotices = requests.filter((item) => item.url.includes('/rest/v1/notifications') && item.options.method === 'POST')
  .map((item) => JSON.parse(item.options.body).type);
assert.deepEqual(profileNotices, ['approved']);

await accounts.setMemberVerification('vendor-1', 'business', true, '서류 원본 확인 완료');
await accounts.listMemberVerificationEvents('vendor-1', 30);
await accounts.setMemberSuspended({ id: 'vendor-1', admin_operation_version: 3 }, true);
await accounts.deleteMember({ id: 'customer-1', admin_operation_version: 7 }, '탈퇴 요청 본인 확인');
assert.deepEqual(await accounts.listAuditEvents(150), { ok: true, events: [] });
const verificationRequest = requests.find((item) => item.url.includes('/functions/v1/admin-manage-verification')
  && JSON.parse(item.options.body).action === 'set_status');
assert.deepEqual(JSON.parse(verificationRequest.options.body), {
  action: 'set_status', targetUserId: 'vendor-1', method: 'business', verified: true, reason: '서류 원본 확인 완료'
});
const memberActions = requests.filter((item) => item.url.includes('/functions/v1/admin-member-ops'))
  .map((item) => JSON.parse(item.options.body));
assert.deepEqual(memberActions.map((item) => item.action), ['update_profile', 'suspend', 'delete']);
assert.equal(memberActions[0].reason, '관리자 프로필 정보 수정');
assert.deepEqual(memberActions[0].patch, { approved: true });
assert.equal(memberActions[1].expectedVersion, 3);
assert.equal(memberActions[2].reason, '탈퇴 요청 본인 확인');
assert.equal(memberActions[2].expectedVersion, 7);

const legacyBackend = await readFile(new URL('../supabase.js', import.meta.url), 'utf8');
for (const field of ['approved', 'vip', 'suspended', 'company_name', 'commission_rate']) {
  assert.doesNotMatch(legacyBackend, new RegExp(`from\\('profiles'\\)\\.update\\(\\{ ${field}:`),
    `기존 관리자 화면도 ${field}를 직접 변경하면 안 됩니다.`);
}
assert.match(legacyBackend, /functions\.invoke\('admin-member-ops'/);

await accounts.updateSettlement({ id: 'settlement-1', seller_id: 'partner-1', net_amount: 2300000, status: 'pending' }, 'paid', '지급 확인');
await new Promise((resolve) => setTimeout(resolve, 0));
const settlementNotice = requests.filter((item) => item.url.includes('/rest/v1/notifications') && item.options.method === 'POST')
  .map((item) => JSON.parse(item.options.body)).find((item) => item.type === 'settlement');
assert.match(settlementNotice.body, /2,300,000원/);

const operations = createAdminOperationsService({
  getAccessToken: async () => 'verified-admin-token', operatorId: 'admin-user', fetchImpl: fakeFetch
});
operations.client.list = async (table) => table === 'site_content' ? [] : [];
const overview = await operations.loadOverview();
assert.equal(overview.sources, 5);
assert.deepEqual(overview.trade.metrics, {
  todayOrders: 0,
  ordersPending: 0,
  quotesPending: 0,
  quotesOpen: 0,
  returnsPending: 0,
  settlementsPending: 0
});

const adapter = createLegacyMypageSettingsAdapter({
  window: {
    NWBackend: {
      ready: Promise.resolve(),
      getSiteContent: async (key) => key === 'mypage_admin_config'
        ? { key, body: JSON.stringify({ ...config, label: '관리자' }) }
        : null
    }
  }
});
const storefrontConfigs = await adapter.loadAll();
assert.equal(storefrontConfigs.admin.label, '관리자');
assert.equal(storefrontConfigs.customer, null);

const mypageRuntime = await readFile(new URL('../app/features/mypage-settings/mypage-settings.js', import.meta.url), 'utf8');
assert.match(mypageRuntime, /#mpNextGrade/);
assert.match(mypageRuntime, /#mpMenuList/);
assert.match(mypageRuntime, /#mpOrderPreview/);
assert.doesNotMatch(mypageRuntime, /#myPageName|#mpStatPoint|#mpOrderName/,
  '운영 화면 설정은 회원·포인트·주문의 실제 값을 덮어쓰면 안 됩니다.');

console.log(`admin live operations: requests=${requests.length} overviewSources=${overview.sources} pass`);
