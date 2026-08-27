import { initAccountRolePreview } from '../account-roles/account-role-preview.js?v=20260826-mypage-icons-v1';
import { cloneRoleContent } from '../account-roles/account-role-model.js?v=20260826-editor-v5';

const root = document.getElementById('accountRolePreview');

initAccountRolePreview({
  root,
  window,
  syncUrl: false,
  initialContent: { customer: cloneRoleContent('customer') }
});
