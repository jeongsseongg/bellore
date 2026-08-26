import { initAccountRolePreview } from '../../../account-roles/account-role-preview.js?v=20260826-editor-v8';

function pageMarkup() {
  return `
    <div class="workspace-page admin-mypage-editor-page" data-page="mypageSettings">
      <div class="page-heading">
        <div>
          <div class="heading-meta"><span class="eyebrow">고객 화면 관리</span><span class="coverage-chip is-current">관리자 콘솔 통합</span></div>
          <h1>고객·업체·관리자 마이페이지 관리</h1>
          <p>같은 마이페이지 구조에서 역할별 문구·주문 카드·배너·메뉴 구성을 한 화면에서 비교합니다.</p>
        </div>
        <div class="page-actions">
          <span class="mypage-admin-state">운영 데이터 저장 0건</span>
        </div>
      </div>

      <div class="mypage-editor-warning">
        <strong>관리자 콘솔 안에서 시안을 편집합니다.</strong>
        <span>아래 저장은 이 브라우저의 시안값만 보존합니다. 운영 회원·주문·배너·권한 데이터에는 연결되지 않습니다.</span>
      </div>

      <div class="mypage-editor-summary" aria-label="마이페이지 편집 범위">
        <span><b>3개</b><small>고객·업체·관리자</small></span>
        <span><b>660 · 390</b><small>기본·모바일 화면</small></span>
        <span><b>0건</b><small>운영 데이터 변경</small></span>
      </div>

      <section class="admin-mypage-editor-shell" aria-label="고객·업체·관리자 마이페이지 편집기">
        <div id="adminMypageEditorHost"></div>
      </section>
    </div>`;
}

export function createAdminMypageEditor({ onToast } = {}) {
  function mount(root) {
    const host = root.querySelector('#adminMypageEditorHost');
    if (!host || host.shadowRoot) return;

    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <link rel="stylesheet" href="../account-roles/account-role-preview.css?v=20260826-editor-v8">
      <link rel="stylesheet" href="./features/mypage-editor/admin-mypage-editor-shadow.css?v=20260826-editor-v7">
      <main id="accountRolePreview" class="role-preview admin-embedded-role-preview" aria-live="polite"></main>`;

    const editorRoot = shadow.querySelector('#accountRolePreview');
    try {
      initAccountRolePreview({ root: editorRoot, window, syncUrl: false });
    } catch (error) {
      console.error('관리자 마이페이지 편집기를 불러오지 못했습니다.', error);
      editorRoot.innerHTML = '<p class="embedded-editor-error" role="alert">마이페이지 편집기를 불러오지 못했습니다. 새로고침해 주세요.</p>';
      onToast?.('마이페이지 편집기를 불러오지 못했습니다.');
    }
  }

  return { render: pageMarkup, mount };
}
