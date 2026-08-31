const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const prototypeRoot = path.join(root, 'prototypes/account-roles');
const adminRoot = path.join(root, 'prototypes/admin-console-v2');
const model = fs.readFileSync(path.join(prototypeRoot, 'account-role-model.js'), 'utf8');
const view = fs.readFileSync(path.join(prototypeRoot, 'account-role-preview.js'), 'utf8');
const blockEditor = fs.readFileSync(path.join(prototypeRoot, 'account-role-block-editor.js'), 'utf8');
const directEdit = fs.readFileSync(path.join(prototypeRoot, 'account-role-direct-edit.js'), 'utf8');
const css = fs.readFileSync(path.join(prototypeRoot, 'account-role-preview.css'), 'utf8');
const html = fs.readFileSync(path.join(prototypeRoot, 'index.html'), 'utf8');
const bootstrap = fs.readFileSync(path.join(prototypeRoot, 'bootstrap.js'), 'utf8');
const adminHtml = fs.readFileSync(path.join(adminRoot, 'index.html'), 'utf8');
const adminData = fs.readFileSync(path.join(adminRoot, 'data/admin-console-data.js'), 'utf8');
const runtimeSettings = fs.readFileSync(path.join(root, 'app/features/mypage-settings/mypage-settings.js'), 'utf8');

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
assert(model.includes("'내 비교견적'"), '고객 마이페이지의 비교견적 메뉴가 편집 모델에서 빠졌습니다.');
assert(model.includes("'시계판매 (견적·업체·고객)'"), '관리자 편집 모델이 실제 관리 메뉴를 반영하지 않습니다.');
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
assert(blockEditor.includes("menuField('trade'") && blockEditor.includes("menuField('activity'"),
  '두 메뉴 영역을 독립적으로 편집할 수 없습니다.');
assert(view.includes('EDITOR_BLOCKS') && blockEditor.includes('data-block-select') && view.includes('data-preview-block'),
  '블록 목록·실제 화면 선택·블록 편집 연결이 없습니다.');
assert(model.includes("blockOrder: ['header', 'order', 'banner', 'trade', 'activity', 'footer']"),
  '역할별 마이페이지 블록 순서 기본값이 없습니다.');
assert(blockEditor.includes("movable ? ' draggable=\"true\"'") && directEdit.includes("addEventListener('dragstart'") && directEdit.includes("addEventListener('drop'"),
  '마이페이지 블록 끌어서 순서 변경이 없습니다.');
assert(directEdit.includes("addEventListener('dblclick'") && directEdit.includes("contentEditable = 'true'") && directEdit.includes("addEventListener('focusout'"),
  '실제 마이페이지 문구 두 번 눌러 수정 기능이 없습니다.');
assert(runtimeSettings.includes('content.blockOrder') && runtimeSettings.includes('insertBefore'),
  '저장된 블록 순서가 실제 마이페이지에 적용되지 않습니다.');
assert(blockEditor.includes('실제 회원 데이터') && blockEditor.includes('실제 주문 데이터'),
  '운영 데이터와 편집 문구의 경계가 표시되지 않습니다.');
assert(runtimeSettings.includes("content.profile?.pageTitle") && runtimeSettings.includes("content.footer?.description"),
  '블록 편집기의 화면 제목과 푸터 소개가 실제 마이페이지에 적용되지 않습니다.');
assert(runtimeSettings.includes("content.labels?.tradeHeading") && runtimeSettings.includes("content.labels?.activityHeading"),
  '블록 편집기의 메뉴 영역 제목이 실제 마이페이지에 적용되지 않습니다.');
assert(runtimeSettings.includes("content.order?.primaryAction") && runtimeSettings.includes("content.order?.secondaryAction"),
  '블록 편집기의 주문 버튼 문구가 실제 마이페이지에 적용되지 않습니다.');
assert(runtimeSettings.includes("data-sell-service-open') === 'compare'") && runtimeSettings.includes("setAttribute('data-sell-service-open', 'compare')"),
  '고객 비교견적 메뉴의 실제 동작 계약이 보존되지 않습니다.');
assert(runtimeSettings.includes("if (role !== 'admin') renderMenu") && runtimeSettings.includes("if (role === 'admin')"),
  '관리자 전용 메뉴를 일반 회원 메뉴 렌더러가 덮지 못하게 막아야 합니다.');
assert(view.includes('data-save-config') && view.includes('data-reset-config'),
  '브라우저 저장·운영 기준 복원 기능이 없습니다.');
assert(view.includes('data-preview-size="660"') && view.includes('data-preview-size="390"'),
  '660px·390px 화면 비교 기능이 없습니다.');
assert(view.includes('previewWindow.localStorage.setItem') && view.includes('previewWindow.confirm'),
  '독립 시안 페이지의 역할별 로컬 저장과 확인 후 미리보기 복원이 없습니다.');
assert(view.includes("typeof persistence.save === 'function'") && view.includes('await session.persistence.save(session.activeRole, session.content)'),
  '관리자 화면에서 운영 저장소로 교체할 수 있는 저장 경계가 없습니다.');
assert(view.includes('resetConfig(session)') && !view.includes('persistence.reset(') && !view.includes('localStorage.removeItem'),
  '운영 기준 복원은 즉시 저장하지 않고 미리보기의 미저장 변경으로 남아야 합니다.');
assert(view.includes('drafts: {}') && view.includes('dirtyRoles'),
  '역할 전환 전 수정 초안을 보존하지 않습니다.');
assert(view.includes('updatePreview(session.root, session.activeRole, session.content, session.activeBlock)'),
  '입력값이 오른쪽 미리보기에 즉시 반영되지 않습니다.');
assert(view.includes('운영 화면과 같은 구성입니다.'),
  '실제 운영 화면 구조를 사용한다는 안내가 없습니다.');
assert(view.includes('href="../admin-console-v2/"'), '기존 관리자 페이지 연결이 없습니다.');
assert(!view.includes('renderPartner'), '공급 파트너 마이페이지 렌더러가 남았습니다.');
assert(view.includes('class="mypage-app"') && view.includes('class="mp-head preview-editable-block"'),
  '현재 앱형 마이페이지 셸과 상단 계정 영역이 없습니다.');
assert(!view.includes('class="mp-profile-avatar"') && view.includes('class="mp-stat-copy"'),
  '실제 운영 화면에 없는 프로필 아바타가 남았거나 텍스트 지표 영역이 없습니다.');
assert(view.includes('class="mp-order-preview preview-editable-block"') && view.includes('class="mp-order-surface"'),
  '최근 주문을 하나의 의미 있는 거래 카드로 구분하지 못했습니다.');
assert(view.includes('class="mp-menu"') && view.includes('class="mp-menu-label"'),
  '평면 텍스트 메뉴 구조가 없습니다.');
assert((view.match(/<svg/g) || []).length === 2 && view.includes("headerIcon('notification')") && view.includes("headerIcon('settings')"),
  '상단 알림·설정 외의 장식용 SVG 아이콘이 추가됐습니다.');
assert(!view.includes('ICONS') && !view.includes('icon('),
  '마이페이지에 공용 장식 아이콘 묶음이 다시 추가됐습니다.');
assert(view.includes('src="../../assets/logo-bellore.png"') && !view.includes('<strong>BELLORE</strong>'),
  '푸터는 임시 글자가 아닌 벨로르 로고 원본을 사용해야 합니다.');
assert(view.includes("['홈', '검색', '보관함', '시계판매', '마이']"), '공통 텍스트 하단 탭이 없습니다.');

assert(css.includes('--mp-width: 660px'), '현재 마이페이지 최대폭 660px 기준이 없습니다.');
assert(css.includes('grid-template-columns: 190px minmax(420px, 660px) 340px'),
  '블록 목록·실제 화면·편집 패널의 데스크톱 3단 배치가 없습니다.');
assert(css.includes('.preview-editable-block[data-block-active="true"]'),
  '실제 화면에서 선택한 블록을 구분할 수 없습니다.');
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
assert(html.includes('mypage-admin-contract-v1') && bootstrap.includes('mypage-admin-contract-v1'),
  '마이페이지 관리자 계약 캐시 버전이 일치하지 않습니다.');
assert(view.includes('class="mp-head-icon"') && view.includes('aria-label="알림"') && view.includes('aria-label="설정"'),
  '마이페이지 상단 알림과 설정이 접근 가능한 선 아이콘으로 표시되지 않습니다.');
assert(!view.includes('class="mp-head-text"'), '마이페이지 상단에 알림·설정 글자 버튼이 남았습니다.');
assert(!html.match(/<script(?![^>]*src=)[^>]*>/), '인라인 실행 스크립트를 추가하면 안 됩니다.');
assert(bootstrap.includes('try {') && bootstrap.includes('console.error'),
  '초기화 실패가 조용히 삼켜집니다.');

assert(adminHtml.includes('class="admin-app"') && adminHtml.includes('id="adminSidebar"'),
  '기존 관리자 Wanted 구조가 보존되지 않았습니다.');
assert(adminData.includes("id: 'mypageSettings'") && adminData.includes("label: '마이페이지 관리'"),
  '관리자 콘솔 안에서 역할별 마이페이지 관리 화면으로 이동할 수 없습니다.');
assert(adminHtml.includes('id="adminLoginForm"') && adminHtml.includes('block-editor-v1'),
  '운영 관리자 로그인 게이트가 없습니다.');
assert(fs.existsSync(path.join(root, 'assets/products/watch-batch-20260821-3/158-pdj96zas81tz/front.webp')),
  '최근 주문 예시 이미지 자산이 없습니다.');
assert(fs.existsSync(path.join(root, 'assets/logo-bellore.png')),
  '마이페이지 푸터에 사용할 벨로르 로고 원본이 없습니다.');

console.log('account role editor: ' + checks + ' checks passed');
