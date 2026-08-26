import { initAccountRolePreview } from './account-role-preview.js?v=20260826-editor-v8';

const root = document.querySelector('#accountRolePreview');

if (root) {
  try {
    initAccountRolePreview({ root, window });
  } catch (error) {
    console.error('고객·업체 마이페이지 편집 시안을 불러오지 못했습니다.', error);
    root.innerHTML = '<p role="alert">화면 시안을 불러오지 못했습니다. 새로고침해 주세요.</p>';
  }
}
