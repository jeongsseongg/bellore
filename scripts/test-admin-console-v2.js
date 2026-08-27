const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const base = path.join(root, 'prototypes', 'admin-console-v2');

function read(relative) {
  return fs.readFileSync(path.join(base, relative), 'utf8');
}

const html = read('index.html');
const auth = read('admin-auth.js');
const authCss = read('admin-auth.css');
const css = read('admin-console.css');
const data = read('data/admin-console-data.js');
const bootstrap = read('bootstrap.js');
const navigation = read('features/navigation/admin-navigation.js');
const workspace = read('features/workspace/admin-workspace.js');
const homeData = read('data/admin-home-editor-data.js');
const homeEditor = read('features/home-editor/admin-home-editor.js');
const mypageEditor = read('features/mypage-editor/admin-mypage-editor.js');
const wantedCss = read('features/workspace/admin-wanted.css');
const homeCss = read('features/home-editor/admin-home-editor.css');
const mypageCss = read('features/mypage-editor/admin-mypage-editor.css');
const mypageShadowCss = read('features/mypage-editor/admin-mypage-editor-shadow.css');
const themePreview = read('features/theme-preview/admin-theme-preview.js');
const themePreviewCss = read('features/theme-preview/admin-theme-preview.css');
const operationController = read('features/operations/admin-operation-controller.js');
const operationOverview = read('features/operations/admin-live-overview.js');
const operationView = read('features/operations/admin-operation-view.js');
const displayText = read('features/operations/admin-display-text.js');
const operationsService = read('services/admin/admin-operations-service.js');
const catalogService = read('services/admin/admin-catalog-service.js');
const accountService = read('services/admin/admin-account-service.js');
const accountConfig = read('features/operations/admin-account-config.js');
const restClient = read('services/platform/admin-rest-client.js');
const publicConfig = fs.readFileSync(path.join(root, 'supabase-config.js'), 'utf8');
const memberOpsEdge = fs.readFileSync(path.join(root, 'supabase', 'functions', 'admin-member-ops', 'index.ts'), 'utf8');
const auditEdge = fs.readFileSync(path.join(root, 'supabase', 'functions', 'admin-audit-events', 'index.ts'), 'utf8');
const memberOpsMigration = fs.readFileSync(path.join(root, 'supabase', 'migrations', '20260826173419_admin_member_operations.sql'), 'utf8');

const requiredFiles = [
  'index.html',
  'admin-auth.css',
  'admin-auth.js',
  'admin-console.css',
  'bootstrap.js',
  'data/admin-console-data.js',
  'data/admin-home-editor-data.js',
  'features/home-editor/admin-home-editor.js',
  'features/home-editor/admin-home-editor.css',
  'features/mypage-editor/admin-mypage-editor.js',
  'features/mypage-editor/admin-mypage-editor.css',
  'features/mypage-editor/admin-mypage-editor-shadow.css',
  'features/theme-preview/admin-theme-preview.js',
  'features/theme-preview/admin-theme-preview.css',
  'features/operations/admin-operation-controller.js',
  'features/operations/admin-operation-model.js',
  'features/operations/admin-display-text.js',
  'features/operations/admin-operation-view.js',
  'features/operations/admin-live-overview.js',
  'features/operations/admin-trade-config.js',
  'features/operations/admin-catalog-config.js',
  'features/operations/admin-account-config.js',
  'features/operations/admin-operations.css',
  'services/platform/admin-rest-client.js',
  'services/admin/admin-operations-service.js',
  'services/admin/admin-trade-service.js',
  'services/admin/admin-catalog-service.js',
  'services/admin/admin-account-service.js',
  'features/navigation/admin-navigation.js',
  'features/workspace/admin-workspace.js',
  'features/workspace/admin-wanted.css',
  'ui/icons.js'
];
requiredFiles.forEach((file) => assert.ok(fs.existsSync(path.join(base, file)), `missing ${file}`));

assert.match(html, /id="adminNav"/, 'shell owns navigation mount');
assert.match(html, /id="adminWorkspace"/, 'shell owns workspace mount');
assert.match(html, /id="caseDrawer"/, 'shell owns case drawer');
assert.match(html, /type="module" src="\.\/bootstrap\.js\?v=20260827-theme-palette-v1"/, 'versioned native module bootstrap is used');
assert.doesNotMatch(html, /<script(?![^>]*src=)[^>]*>/, 'no executable inline scripts');
assert.doesNotMatch(html, /style="/, 'no inline style attributes in shell');
assert.doesNotMatch(html, /surface-menu|partner-slot/, 'duplicate top and footer navigation are removed');
assert.match(html, /admin-surface-title">운영 관리자/, 'header keeps one plain workspace label');

['customer', 'vendor', 'partner', 'admin'].forEach((role) => {
  assert.match(data, new RegExp(`key: '${role}'`), `role contract includes ${role}`);
});
assert.match(data, /label: '공급협력사'[\s\S]*state: '포털 준비'/, 'partner is preserved but portal stays planned');
assert.match(data, /입찰 권한은 현 코드 충돌 확인 후 확정/, 'partner bid authority is not invented');

const currentModules = [
  'orders', 'quotes', 'returns', 'listings', 'auctions', 'customers', 'vendors',
  'partners', 'mypageSettings', 'themePalette', 'settlements', 'coupons', 'support', 'banners', 'advisor', 'analytics',
  'homeSettings', 'community', 'content', 'coverage', 'notifications', 'audit'
];
const plannedModules = ['consignments', 'purchases', 'inspections', 'permissions'];
currentModules.forEach((id) => {
  assert.match(data, new RegExp(`${id}: \\{[\\s\\S]*?current: true`), `current module ${id} is mapped`);
  assert.match(data, new RegExp(`id: '${id}'`), `navigation exposes ${id}`);
});
plannedModules.forEach((id) => {
  assert.match(data, new RegExp(`${id}: \\{[\\s\\S]*?planned: true`), `planned module ${id} is explicit`);
  assert.match(data, new RegExp(`id: '${id}'`), `navigation reserves ${id}`);
});

assert.match(html, /관리자 권한 확인됨[\s\S]*운영 계정 전용 화면/, 'production admin shell reports the authorization boundary');
assert.match(workspace, /화면 시안|시안 데이터|운영 데이터 미연결|운영에 연결하지/, 'workspace does not present mock data as live');
assert.match(workspace, /역할 전환 버튼은 관리자 시안 검증용/, 'role switch is not proposed for customer UI');
assert.match(workspace, /서버 권한과 감사기록 연결 후 활성화/, 'privileged actions remain server-authorized');
assert.match(data, /운영 데이터에 판매방식이 구분 저장되지 않아/, 'direct purchase stays planned until its data contract exists');

assert.match(bootstrap, /createAdminNavigation/, 'bootstrap composes navigation feature');
assert.match(bootstrap, /await requireAdminSession\(\)/, 'admin workspace waits for the authorization gate');
assert.match(auth, /STORAGE_KEY = 'bellore-admin-auth-v1'/, 'admin auth uses an isolated session');
assert.match(html, /id="adminRememberLogin"[^>]*type="checkbox"[^>]*checked/, 'automatic login is explicitly enabled by default');
assert.match(auth, /window\.localStorage[\s\S]*window\.sessionStorage/, 'automatic and tab-only sessions use separate browser stores');
assert.match(auth, /persistSession = rememberInput\.checked/, 'login persistence follows the automatic-login control');
assert.match(auth, /window\.localStorage\.removeItem\(STORAGE_KEY\)[\s\S]*window\.sessionStorage\.removeItem\(STORAGE_KEY\)/,
  'session writes and logout clear both persistence scopes');
assert.match(authCss, /\.admin-auth\[hidden\][\s\S]*\.admin-app\[hidden\][\s\S]*display:\s*none;/,
  'successful login cannot leave the login surface visible');
assert.match(auth, /profile\?\.role !== 'admin'|profile\.role !== 'admin'/, 'database profile role is required');
assert.match(auth, /tokenRole !== 'admin'/, 'trusted app metadata role is required');
assert.match(auth, /\/auth\/v1\/token\?grant_type=password/, 'production admin signs in through the Supabase Auth endpoint');
assert.match(auth, /\/rest\/v1\/rpc\/email_for_username/, 'production admin resolves the public username through the existing RPC');
assert.doesNotMatch(html, /cdn\.jsdelivr\.net|@supabase\/supabase-js/, 'production admin must not depend on an external SDK script');
const adminAnonKey = auth.match(/SUPABASE_ANON_KEY = '([^']+)'/)?.[1];
assert.ok(adminAnonKey && publicConfig.includes(adminAnonKey), 'admin auth anon key must exactly match the storefront public config');
assert.match(html, /method="post" action="\/admin\/"/, 'login form must not leak credentials into the URL if JavaScript fails');
assert.match(auth, /searchParams\.delete\('password'\)/, 'legacy credential query parameters are removed immediately');
assert.doesNotMatch(auth, /service[_-]?role|qpffhfm|password\s*[:=]\s*['"]/i, 'admin auth must not embed a privileged key or password');
assert.match(bootstrap, /createAdminWorkspace/, 'bootstrap composes workspace feature');
assert.doesNotMatch(bootstrap, /createAdminHomeEditor|homeEditorData/, 'prototype home editor must not compete with the operational site-content workspace');
assert.match(bootstrap, /createAdminMypageEditor/, 'bootstrap composes My Page editor feature');
assert.match(bootstrap, /createAdminOperationsService/, 'bootstrap composes the existing operations service boundary');
assert.match(bootstrap, /settingsService: operationsService\.catalog/, 'My Page editor uses the shared catalog service');
assert.match(bootstrap, /specialViews: \{ mypageSettings: mypageEditor, themePalette: themePreview \}/,
  'My Page editor and theme comparison are mounted as special workspaces');
assert.match(navigation, /onNavigate/, 'navigation communicates through callback');
assert.match(navigation, /data-nav-group-toggle[\s\S]*aria-expanded/, 'navigation groups expose an accessible collapse control');
assert.match(navigation, /openGroup\(next\.closest\('\[data-nav-group\]'\)\)/,
  'search and direct navigation open the group that owns the selected view');
assert.match(navigation, /class="nav-group is-open"[\s\S]*aria-expanded="true"/,
  'all navigation groups start open');
assert.doesNotMatch(navigation, /candidate === group/,
  'opening or closing one navigation group does not close the others');
assert.doesNotMatch(bootstrap, /function navigate[\s\S]*?closeMobileMenu\(\);[\s\S]*?globalSearch\.value/,
  'navigation keeps the sidebar open until the operator closes it');
['운영 홈', '거래 업무', '상품 업무', '고객 · 업체', '화면 관리', '운영 지원', '확장 · 설정'].forEach((label) => {
  assert.match(data, new RegExp(`label: '${label}'`), `simplified navigation includes ${label}`);
});
assert.equal((data.match(/label: '(운영 홈|거래 업무|상품 업무|고객 · 업체|화면 관리|운영 지원|확장 · 설정)',\r?\n\s+items:/g) || []).length, 7,
  'navigation is reduced to seven task groups');
assert.doesNotMatch(navigation, /supabase|fetch\(|localStorage/, 'navigation has no service access');
assert.doesNotMatch(workspace, /supabase|service_role|anon[_-]?key/i, 'workspace contains no provider secrets or SDK access');

assert.match(css, /@media \(max-width: 1060px\)/, 'tablet breakpoint exists');
assert.match(css, /@media \(max-width: 760px\)/, 'mobile breakpoint exists');
assert.match(css, /--green-850: #1a2925/i, 'Bellore deep green token is used');
assert.match(css, /font-variant-numeric: tabular-nums/, 'operational numbers align');
assert.match(css, /\.case-drawer/, 'desktop detail drawer exists');

['headerChips', 'dbBanners', 'heroFallback', 'special', 'priceDrop', 'themes', 'recent', 'buyin', 'recommend', 'featured', 'brandCategories'].forEach((id) => {
  assert.match(homeData, new RegExp(`id: '${id}'`), `home inventory includes ${id}`);
});
assert.match(homeData, /할인율 내림차순/, 'special-price split rule is explicit');
assert.match(homeData, /판매 가능한 벨로르 상품 최신 12개/, 'recommendation auto rule is explicit');
assert.match(homeData, /모바일 이미지[\s\S]*1220\s*×\s*1480/, 'database banner mobile image contract is explicit');
assert.match(homeData, /새 저장 계약 필요/, 'code-only home settings are not misrepresented as connected');
assert.match(homeEditor + homeData, /상품 편집으로 간접 제어|판매시계 관리에서 상품 편집/, 'derived home rows route operators to product editing');
assert.match(homeEditor, /운영에 연결하지 않음|운영 데이터를 저장하지|운영 저장 0건/, 'home editor does not pretend to save');
assert.match(homeCss, /height:\s*52px/, 'home editor inputs use 52px height');
assert.match(homeCss, /min-height:\s*54px/, 'home editor CTA uses 54px height');
assert.match(mypageEditor, /attachShadow/, 'My Page editor styles are isolated from the admin console');
assert.match(mypageEditor, /initAccountRolePreview\(\{[\s\S]*root: editorRoot,[\s\S]*syncUrl: false,[\s\S]*persistence:/,
  'embedded My Page editor keeps the admin URL state');
assert.match(mypageEditor, /loadMypageConfigs\(\)/, 'embedded My Page editor loads saved operating settings');
assert.match(catalogService, /mypage_customer_config[\s\S]*mypage_vendor_config[\s\S]*mypage_admin_config/,
  'customer, vendor, and admin My Page settings have stable operating keys');
assert.match(catalogService, /saveMypageConfig[\s\S]*saveSiteContent/, 'My Page settings reuse the existing site content storage contract');
assert.match(restClient, /Authorization: `Bearer \$\{token\}`/, 'operations requests use the signed-in admin access token');
assert.match(restClient, /\/rest\/v1\/[\s\S]*\/functions\/v1\//, 'existing REST and Edge Function boundaries are both available');
assert.match(operationController, /viewId === 'overview'[\s\S]*service\.loadOverview\(\)/,
  'overview reads real operating aggregates instead of the example dashboard');
assert.match(operationController, /action\.promptText[\s\S]*action\.reasonPrompt[\s\S]*reason\.length < 5/,
  'destructive and manual verification actions require explicit confirmation input');
assert.match(operationOverview, /운영 데이터에서 집계한 처리 대기 업무/, 'live overview identifies its operating data source');
assert.match(displayText, /on_sale:\s*'판매중'/, 'listing status is normalized to Korean');
assert.match(displayText, /pending:\s*'대기'/, 'pending status is normalized to Korean');
assert.match(displayText, /vendor:\s*'견적업체'/, 'account role is normalized to Korean');
assert.match(displayText, /bank_transfer:\s*'계좌이체'/, 'payment method is normalized to Korean');
assert.match(operationView, /displayText\(cell\)[\s\S]*displayText\(row\.statusLabel\)/,
  'operation rows never expose raw status values');
assert.match(operationView, /displayFieldLabel\(key\)[\s\S]*displayDetailValue\(key, value\)/,
  'detail fields use Korean labels and values');
assert.doesNotMatch(operationView + operationOverview + data, /Supabase 운영 데이터|원본 필드|AI 고객비서|TIME SALE|VIP 견적업체/,
  'operator-facing technical and English labels are removed');
assert.match(operationsService, /trade\.overview\(\)[\s\S]*accounts\.listProfiles\(\)[\s\S]*catalog\.listListings\(\)/,
  'overview combines existing trade, account, and catalog services');
assert.match(accountService, /admin-member-ops[\s\S]*admin-manage-verification/,
  'member lifecycle and verification use server-authorized Edge Functions');
assert.match(accountConfig, /email_verified[\s\S]*phone_verified[\s\S]*biz_verified[\s\S]*account_verified/,
  'all four verification results are visible in member administration');
assert.match(accountConfig, /disabled: true[\s\S]*setMemberVerification/,
  'verification flags are read-only and manual decisions use the audited server contract');
assert.doesNotMatch(accountService, /next\.biz_verified|next\.account_verified/,
  'profile editing cannot forge verification timestamps or notifications');
assert.match(memberOpsEdge, /SERVICE_ROLE[\s\S]*requireUser[\s\S]*role,approved,suspended/,
  'member operations revalidate an active approved administrator on the server');
assert.match(memberOpsEdge, /SELF_OPERATION_FORBIDDEN[\s\S]*PROTECTED_ROLE[\s\S]*auth\.admin\.deleteUser/,
  'member operations protect the current administrator and all administrator accounts');
assert.match(memberOpsMigration, /member_admin_events[\s\S]*enable row level security[\s\S]*revoke all/,
  'member changes have a server-only audit trail');
assert.match(auditEdge, /role,approved,suspended[\s\S]*member_verification_events[\s\S]*member_admin_events/,
  'the admin audit view combines verification and member events behind an active-admin gate');
assert.doesNotMatch(mypageEditor, /<iframe|createElement\(['"]iframe/i,
  'My Page editor is integrated directly rather than loaded as a separate page frame');
assert.match(mypageEditor, /account-role-preview\.css[\s\S]*admin-mypage-editor-shadow\.css/,
  'embedded editor loads both the shared preview and admin isolation styles');
assert.match(mypageCss, /width:\s*min\(100%, 1200px\)/, 'integrated My Page page uses the Wanted canvas');
assert.match(mypageCss, /\.admin-mypage-editor-shell\s*\{[\s\S]*?border:\s*0;[\s\S]*?background:\s*transparent;/,
  'integrated My Page editor does not add another enclosing card');
assert.match(mypageShadowCss, /grid-template-columns:\s*minmax\(330px, 400px\) minmax\(0, 679px\)/,
  'embedded editor reserves the scrollbar space needed for a 660px app preview');
assert.match(mypageShadowCss, /@media \(max-width: 1430px\)[\s\S]*grid-template-columns:\s*minmax\(0, 679px\)/,
  'narrow admin workspaces stack the editor so the 660px app preview is not compressed');
assert.match(mypageShadowCss, /--mp-width:\s*660px[\s\S]*--mp-black:\s*#141517/,
  'shadow host re-declares My Page design tokens');
assert.match(mypageShadowCss, /\.admin-embedded-role-preview \.preview-stage\s*\{[\s\S]*?border:\s*0;[\s\S]*?background:\s*#fff;/,
  'embedded My Page preview is a flat white canvas rather than a nested device card');
assert.match(mypageShadowCss, /\.admin-embedded-role-preview \.preview-frame\s*\{[\s\S]*?height:\s*auto;[\s\S]*?overflow-y:\s*visible;/,
  'embedded My Page preview uses page scrolling instead of an inner scroll box');
assert.match(mypageShadowCss, /\[data-copy-config\][\s\S]*\[data-reset-config\][\s\S]*display:\s*none;/,
  'embedded editor hides duplicate copy and reset actions');
assert.match(mypageEditor, /역할 선택[\s\S]*내용 수정[\s\S]*미리보기 확인 후 저장/,
  'embedded editor presents one concise three-step workflow');
assert.equal((themePreview.match(/^\s+\['/gm) || []).length, 30, 'theme comparison exposes exactly thirty palettes');
assert.match(themePreview, /'naver'[\s\S]*'#03c75a'/i, 'theme comparison includes the official Naver green reference');
assert.match(themePreview, /data-theme-id[\s\S]*data-theme-reset[\s\S]*style\.setProperty/,
  'theme comparison renders all choices and applies the selected tokens to the actual admin shell');
assert.match(themePreviewCss, /grid-template-columns:\s*repeat\(4,[\s\S]*@media \(max-width: 560px\)[\s\S]*grid-template-columns:\s*1fr/,
  'theme comparison is responsive from four columns to one');
assert.match(wantedCss, /width: min\(100%, 1200px\)/, 'Wanted content canvas is 1200px');
assert.match(wantedCss, /min-height: 54px/, 'Wanted primary action height is 54px');
assert.doesNotMatch(workspace + html, /OPERATIONS HOME|WORK QUEUE|CONTROL SIGNAL|PIPELINE|RECENT ACTIVITY|PORTAL ARCHITECTURE|ROLE CONTRACT|WATCH CASE FILE|FUTURE PORTAL|GLOBAL SEARCH/, 'decorative English is removed');

console.log('admin console v2: invariants passed');
