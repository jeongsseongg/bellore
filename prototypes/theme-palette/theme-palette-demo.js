import { createAdminThemePreview } from '../admin-console-v2/features/theme-preview/admin-theme-preview.js?v=20260827-theme-palette-v1';

const root = document.getElementById('themeDemoRoot');
const preview = createAdminThemePreview();

root.innerHTML = preview.render();
preview.mount(root);
