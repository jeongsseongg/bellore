import { initAccountRolePreview } from '../../../account-roles/account-role-preview.js?v=20260826-mypage-icons-v1';

function pageMarkup() {
  return `
    <div class="workspace-page admin-mypage-editor-page" data-page="mypageSettings">
      <div class="page-heading">
        <div>
          <div class="heading-meta"><span class="eyebrow">화면 관리</span><span class="coverage-chip is-current">운영 화면 연결</span></div>
          <h1>마이페이지 관리</h1>
          <p>고객·업체·관리자 역할을 선택하고 실제 화면을 보면서 표시 문구와 메뉴 순서를 수정합니다.</p>
        </div>
        <div class="page-actions">
          <span class="mypage-admin-state">운영 데이터와 연결됨</span>
        </div>
      </div>

      <div class="mypage-editor-guide" aria-label="마이페이지 수정 순서">
        <span><b>1</b>역할 선택</span>
        <span><b>2</b>내용 수정</span>
        <span><b>3</b>미리보기 확인 후 저장</span>
        <small>회원 이름·수치·주문 정보는 각 계정의 실제 데이터를 그대로 사용합니다.</small>
      </div>

      <section class="admin-mypage-editor-shell" aria-label="고객·업체·관리자 마이페이지 편집기">
        <div id="adminMypageEditorHost"></div>
      </section>
    </div>`;
}

export function createAdminMypageEditor({ settingsService, onToast } = {}) {
  async function mount(root) {
    const host = root.querySelector('#adminMypageEditorHost');
    if (!host || host.shadowRoot) return;

    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <link rel="stylesheet" href="../account-roles/account-role-preview.css?v=20260826-mypage-icons-v1">
      <link rel="stylesheet" href="./features/mypage-editor/admin-mypage-editor-shadow.css?v=20260826-admin-simple-v1">
      <main id="accountRolePreview" class="role-preview admin-embedded-role-preview" aria-live="polite"></main>`;

    const editorRoot = shadow.querySelector('#accountRolePreview');
    try {
      const initialContent = await settingsService.loadMypageConfigs();
      initAccountRolePreview({
        root: editorRoot,
        window,
        syncUrl: false,
        initialContent,
        persistence: {
          save: (role, content) => settingsService.saveMypageConfig(role, content),
          reset: (role, content) => settingsService.saveMypageConfig(role, content)
        }
      });
    } catch (error) {
      console.error('관리자 마이페이지 편집기를 불러오지 못했습니다.', error);
      editorRoot.innerHTML = '<p class="embedded-editor-error" role="alert">마이페이지 편집기를 불러오지 못했습니다. 새로고침해 주세요.</p>';
      onToast?.('마이페이지 편집기를 불러오지 못했습니다.');
    }
  }

  return { render: pageMarkup, mount };
}
