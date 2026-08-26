const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const prototypeRoot = path.join(root, 'prototypes/account-roles');
const adminRoot = path.join(root, 'prototypes/admin-console-v2');
const model = fs.readFileSync(path.join(prototypeRoot, 'account-role-model.js'), 'utf8');
const view = fs.readFileSync(path.join(prototypeRoot, 'account-role-preview.js'), 'utf8');
const css = fs.readFileSync(path.join(prototypeRoot, 'account-role-preview.css'), 'utf8');
const html = fs.readFileSync(path.join(prototypeRoot, 'index.html'), 'utf8');
const bootstrap = fs.readFileSync(path.join(prototypeRoot, 'bootstrap.js'), 'utf8');
const adminHtml = fs.readFileSync(path.join(adminRoot, 'index.html'), 'utf8');

let checks = 0;
function assert(condition, message) {
  checks += 1;
  if (!condition) throw new Error(message);
}

assert(model.includes("Object.freeze(['customer', 'vendor', 'admin'])"),
  '마이페이지 편집 역할은 고객·업체·관리자여야 합니다.');
assert(model.includes('customer: {') && model.includes('vendor: {') && model.includes('admin: {'),
  '고객·업체·관리자 기본 시안이 없습니다.');
assert(!model.includes('partner: {'),
  '공급 파트너를 고객·업체·관리자 마이페이지 편집 역할에 섞으면 안 됩니다.');
assert(model.includes("return EDITABLE_ROLE_ORDER.includes(role) ? role : 'customer'"),
  '알 수 없는 역할이 고객 시안으로 안전하게 정규화되지 않습니다.');
assert(model.includes("headerMessage: '새 비교견적과 입찰 현황을 확인하세요.'"),
  '업체 헤더 문구가 현재 운영 화면과 다릅니다.');
assert(model.includes("'비교견적 · 입찰 내역'"), '업체 전용 입찰 메뉴가 없습니다.');
assert((model.match(/value: '18,500P'/g) || []).length === 1,
  '고객·업체가 공유하는 실제 회원 지표 기본값이 중복 정의됐습니다.');
assert(model.includes('menuGroups:') && model.includes('trade:') && model.includes('activity:'),
  '메뉴명 변경 후에도 거래·내 활동 경계를 유지할 구조가 없습니다.');
assert(model.includes('visible: false'), '현재 운영값처럼 마이페이지 배너는 기본 숨김이어야 합니다.');
assert(!model.includes("'내 시계 판매'"), '내 시계 판매를 현재 마이페이지 메뉴로 잘못 추가했습니다.');

assert(view.includes('class="preview-toolbar"'), '고객·업체 편집 도구막대가 없습니다.');
assert(view.includes('고객·업체·관리자 마이페이지'), '관리자 마이페이지 역할 전환이 없습니다.');
assert(view.includes('class="preview-workspace"'), '편집기와 미리보기의 분리 구조가 없습니다.');
assert(view.includes('data-edit-field'), '실시간 편집 입력이 없습니다.');
assert(view.includes('data-menu-group="trade"') && view.includes('data-menu-group="activity"'),
  '두 메뉴 영역을 독립적으로 편집할 수 없습니다.');
assert(view.includes('data-save-config') && view.includes('data-reset-config'),
  '브라우저 저장·운영 기준 복원 기능이 없습니다.');
assert(view.includes('data-preview-size="660"') && view.includes('data-preview-size="390"'),
  '660px·390px 화면 비교 기능이 없습니다.');
assert(view.includes('previewWindow.localStorage.setItem') && view.includes('previewWindow.localStorage.removeItem'),
  '역할별 시안 저장·복원 구현이 없습니다.');
assert(view.includes('const drafts = {}') && view.includes('dirtyRoles'),
  '역할 전환 전 수정 초안을 보존하지 않습니다.');
assert(view.includes('updatePreview(root, activeRole, content)'),
  '입력값이 오른쪽 미리보기에 즉시 반영되지 않습니다.');
assert(view.includes('세 역할은 구조를 공유합니다.'),
  '고객·업체·관리자가 같은 구조를 사용한다는 안내가 없습니다.');
assert(view.includes('href="../admin-console-v2/"'), '기존 관리자 페이지 연결이 없습니다.');
assert(!view.includes('renderPartner'), '공급 파트너 마이페이지 렌더러가 남았습니다.');
assert(view.includes('class="mypage-app"') && view.includes('class="mp-head"'),
  '현재 앱형 마이페이지 셸과 상단 계정 영역이 없습니다.');
assert(view.includes('class="mp-profile-avatar"') && view.includes('class="mp-stat-copy"'),
  '개방형 프로필과 텍스트 지표 영역이 없습니다.');
assert(view.includes('class="mp-order-preview"') && view.includes('class="mp-order-surface"'),
  '최근 주문을 하나의 의미 있는 거래 카드로 구분하지 못했습니다.');
assert(view.includes('class="mp-menu"') && view.includes('class="mp-menu-label"'),
  '평면 텍스트 메뉴 구조가 없습니다.');
assert(!view.includes('<svg') && !view.includes('ICONS') && !view.includes('icon('),
  '마이페이지 코드에 장식용 이모티콘·SVG 아이콘이 남았습니다.');
assert(view.includes('src="../../assets/logo-bellore.png"') && !view.includes('<strong>BELLORE</strong>'),
  '푸터는 임시 글자가 아닌 벨로르 로고 원본을 사용해야 합니다.');
assert(view.includes("['홈', '검색', '보관함', '시계판매', '마이']"), '공통 텍스트 하단 탭이 없습니다.');

assert(css.includes('--mp-width: 660px'), '현재 마이페이지 최대폭 660px 기준이 없습니다.');
assert(css.includes('grid-template-columns: 400px minmax(0, 660px)'),
  '편집 패널과 실제 화면 미리보기의 데스크톱 배치가 없습니다.');
assert(css.includes('.preview-frame') && css.includes('overflow-y: auto'),
  '미리보기 전용 스크롤 프레임이 없습니다.');
assert(css.includes('[data-preview-width="390"] .mypage-app'),
  '모바일 390px 미리보기 스타일이 없습니다.');
assert(css.includes('.mp-tabbar { position: sticky;'),
  '하단 탭이 미리보기 프레임 안에 고정되지 않습니다.');
assert(/\.mp-head\s*\{[^}]*color:\s*var\(--mp-text\)[^}]*background:\s*#fff/.test(css),
  '마이페이지 상단은 무거운 검정 면이 아닌 흰 캔버스여야 합니다.');
assert(/\.mp-menu-row\s*\{[^}]*background:\s*transparent/.test(css),
  '마이페이지 메뉴가 다시 흰 박스 덩어리로 돌아갔습니다.');
assert(css.includes('--mp-green: #1a2925') && !css.includes('font-family: "Times New Roman"'),
  '벨로르 딥그린과 Wanted 계열 글꼴 계약이 지켜지지 않습니다.');
assert(!css.includes('.mp-admin-'), '관리자만의 별도 마이페이지 레이아웃이 남았습니다.');
assert(!css.includes('.mp-work-preview') && !css.includes('.mp-sale-shortcut'),
  '현재 운영 마이페이지에 없는 업무 카드가 남았습니다.');
assert(css.includes('@media (max-width: 420px)'), '390px급 모바일 반응형 기준이 없습니다.');

assert(html.includes('고객·업체 마이페이지 편집'), '문서 제목이 편집 목적을 설명하지 않습니다.');
assert(html.includes('noindex, nofollow'), '시안 페이지 검색 차단 메타가 없습니다.');
assert(html.includes('editor-v8') && bootstrap.includes('editor-v8'), '편집 시안 캐시 버전이 일치하지 않습니다.');
assert(!html.match(/<script(?![^>]*src=)[^>]*>/), '인라인 실행 스크립트를 추가하면 안 됩니다.');
assert(bootstrap.includes('try {') && bootstrap.includes('console.error'),
  '초기화 실패가 조용히 삼켜집니다.');

assert(adminHtml.includes('class="admin-app"') && adminHtml.includes('id="adminSidebar"'),
  '기존 관리자 Wanted 구조가 보존되지 않았습니다.');
assert(adminHtml.includes('고객·업체 마이페이지 관리') && adminHtml.includes('?view=mypageSettings'),
  '관리자 콘솔 안에서 역할별 마이페이지 관리 화면으로 이동할 수 없습니다.');
assert(adminHtml.includes('id="adminLoginForm"') && adminHtml.includes('admin-release-v2'),
  '운영 관리자 로그인 게이트가 없습니다.');
assert(fs.existsSync(path.join(root, 'assets/products/watch-batch-20260821-3/158-pdj96zas81tz/front.webp')),
  '최근 주문 예시 이미지 자산이 없습니다.');
assert(fs.existsSync(path.join(root, 'assets/logo-bellore.png')),
  '마이페이지 푸터에 사용할 벨로르 로고 원본이 없습니다.');

console.log('account role editor: ' + checks + ' checks passed');
