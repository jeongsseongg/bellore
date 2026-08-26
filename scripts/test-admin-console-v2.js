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
  'features/navigation/admin-navigation.js',
  'features/workspace/admin-workspace.js',
  'features/workspace/admin-wanted.css',
  'ui/icons.js'
];
requiredFiles.forEach((file) => assert.ok(fs.existsSync(path.join(base, file)), `missing ${file}`));

assert.match(html, /id="adminNav"/, 'shell owns navigation mount');
assert.match(html, /id="adminWorkspace"/, 'shell owns workspace mount');
assert.match(html, /id="caseDrawer"/, 'shell owns case drawer');
assert.match(html, /type="module" src="\.\/bootstrap\.js\?v=20260826-admin-release-v2"/, 'versioned native module bootstrap is used');
assert.doesNotMatch(html, /<script(?![^>]*src=)[^>]*>/, 'no executable inline scripts');
assert.doesNotMatch(html, /style="/, 'no inline style attributes in shell');

['customer', 'vendor', 'partner', 'admin'].forEach((role) => {
  assert.match(data, new RegExp(`key: '${role}'`), `role contract includes ${role}`);
});
assert.match(data, /label: '공급협력사'[\s\S]*state: '포털 준비'/, 'partner is preserved but portal stays planned');
assert.match(data, /입찰 권한은 현 코드 충돌 확인 후 확정/, 'partner bid authority is not invented');

const currentModules = [
  'orders', 'quotes', 'returns', 'listings', 'auctions', 'customers', 'vendors',
  'partners', 'mypageSettings', 'settlements', 'coupons', 'support', 'banners', 'advisor', 'analytics',
  'homeSettings', 'community', 'content', 'coverage'
];
const plannedModules = ['consignments', 'purchases', 'inspections', 'notifications', 'audit', 'permissions'];
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
assert.match(auth, /storageKey: 'bellore-admin-auth-v1'/, 'admin auth uses an isolated session');
assert.match(auth, /profile\?\.role !== 'admin'|profile\.role !== 'admin'/, 'database profile role is required');
assert.match(auth, /tokenRole !== 'admin'/, 'trusted app metadata role is required');
assert.match(html, /@supabase\/supabase-js@2/, 'production admin uses the storefront-compatible Supabase SDK loader');
assert.match(html, /method="post" action="\/admin\/"/, 'login form must not leak credentials into the URL if JavaScript fails');
assert.match(auth, /searchParams\.delete\('password'\)/, 'legacy credential query parameters are removed immediately');
assert.doesNotMatch(auth, /service[_-]?role|qpffhfm|password\s*[:=]\s*['"]/i, 'admin auth must not embed a privileged key or password');
assert.match(bootstrap, /createAdminWorkspace/, 'bootstrap composes workspace feature');
assert.match(bootstrap, /createAdminHomeEditor/, 'bootstrap composes home editor feature');
assert.match(bootstrap, /createAdminMypageEditor/, 'bootstrap composes My Page editor feature');
assert.match(bootstrap, /specialViews: \{ homeSettings: homeEditor, mypageSettings: mypageEditor \}/,
  'home and My Page editors are mounted as special workspaces');
assert.match(navigation, /onNavigate/, 'navigation communicates through callback');
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
assert.match(mypageEditor, /initAccountRolePreview\(\{ root: editorRoot, window, syncUrl: false \}\)/,
  'embedded My Page editor keeps the admin URL state');
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
assert.match(wantedCss, /width: min\(100%, 1200px\)/, 'Wanted content canvas is 1200px');
assert.match(wantedCss, /min-height: 54px/, 'Wanted primary action height is 54px');
assert.doesNotMatch(workspace + html, /OPERATIONS HOME|WORK QUEUE|CONTROL SIGNAL|PIPELINE|RECENT ACTIVITY|PORTAL ARCHITECTURE|ROLE CONTRACT|WATCH CASE FILE|FUTURE PORTAL|GLOBAL SEARCH/, 'decorative English is removed');

console.log('admin console v2: invariants passed');
