import { requireAdminSession, signOutAdmin } from './admin-auth.js?v=20260826-admin-release-v3';
import { roleContracts, navGroups, overview, moduleViews, caseDetail } from './data/admin-console-data.js?v=20260826-admin-integrated-v1';
import { homeEditorData } from './data/admin-home-editor-data.js';
import { createAdminNavigation } from './features/navigation/admin-navigation.js';
import { createAdminHomeEditor } from './features/home-editor/admin-home-editor.js';
import { createAdminMypageEditor } from './features/mypage-editor/admin-mypage-editor.js?v=20260826-editor-v8';
import { createAdminWorkspace } from './features/workspace/admin-workspace.js';

await requireAdminSession();

const root = document.getElementById('adminWorkspace');
const navRoot = document.getElementById('adminNav');
const sidebar = document.getElementById('adminSidebar');
const mobileMenu = document.getElementById('mobileMenu');
const mobileScrim = document.getElementById('mobileScrim');
const drawer = document.getElementById('caseDrawer');
const drawerContent = document.getElementById('caseDrawerContent');
const drawerScrim = document.getElementById('drawerScrim');
const toastRegion = document.getElementById('toastRegion');
const globalSearch = document.getElementById('globalSearch');
const globalSearchLabel = globalSearch.closest('.global-search');
const surfaceButton = document.querySelector('.surface-current');
const surfaceMenu = document.querySelector('.surface-menu');
const logoutButton = document.getElementById('adminLogout');
const validViews = new Set(['overview', ...Object.keys(moduleViews)]);

function toast(message) {
  const element = document.createElement('div');
  element.className = 'toast';
  element.textContent = message;
  toastRegion.append(element);
  window.setTimeout(() => element.remove(), 3200);
}

function closeMobileMenu() {
  sidebar.classList.remove('is-open');
  mobileMenu.setAttribute('aria-expanded', 'false');
  mobileScrim.hidden = true;
}

const homeEditor = createAdminHomeEditor({
  data: homeEditorData,
  onToast: toast,
  onNavigate: navigate
});

const mypageEditor = createAdminMypageEditor({ onToast: toast });

const workspace = createAdminWorkspace({
  root,
  drawer,
  drawerContent,
  drawerScrim,
  overview,
  roles: roleContracts,
  views: { ...moduleViews, caseDetail },
  specialViews: { homeSettings: homeEditor, mypageSettings: mypageEditor },
  onNavigate: navigate,
  onToast: toast
});

const navigation = createAdminNavigation({
  root: navRoot,
  groups: navGroups,
  onNavigate: navigate
});

function navigate(viewId, { updateUrl = true } = {}) {
  const next = validViews.has(viewId) ? viewId : 'overview';
  navigation.select(next);
  workspace.render(next);
  closeMobileMenu();
  globalSearch.value = '';
  if (updateUrl) {
    const url = new URL(window.location.href);
    if (next === 'overview') url.searchParams.delete('view');
    else url.searchParams.set('view', next);
    window.history.replaceState({ view: next }, '', url);
  }
}

mobileMenu.addEventListener('click', () => {
  const open = !sidebar.classList.contains('is-open');
  sidebar.classList.toggle('is-open', open);
  mobileMenu.setAttribute('aria-expanded', String(open));
  mobileScrim.hidden = !open;
});

mobileScrim.addEventListener('click', closeMobileMenu);

document.querySelectorAll('[data-action="partner-preview"]').forEach((button) => {
  button.addEventListener('click', () => workspace.openPartnerPreview());
});

surfaceButton.addEventListener('click', () => {
  surfaceMenu.hidden = !surfaceMenu.hidden;
});

logoutButton.addEventListener('click', () => signOutAdmin());

document.addEventListener('click', (event) => {
  if (!event.target.closest('.surface-switch')) surfaceMenu.hidden = true;
});

let searchTimer = 0;
globalSearch.addEventListener('input', () => {
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => workspace.search(globalSearch.value), 130);
});

globalSearchLabel.addEventListener('click', () => {
  if (window.matchMedia('(max-width: 760px)').matches) {
    globalSearchLabel.classList.add('is-open');
    window.setTimeout(() => globalSearch.focus(), 0);
  }
});

document.addEventListener('keydown', (event) => {
  const searchShortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k';
  if (searchShortcut) {
    event.preventDefault();
    globalSearchLabel.classList.add('is-open');
    globalSearch.focus();
  }
  if (event.key === 'Escape' && document.activeElement === globalSearch) {
    globalSearch.value = '';
    globalSearchLabel.classList.remove('is-open');
    globalSearch.blur();
    workspace.search('');
  }
});

window.addEventListener('popstate', () => {
  const view = new URL(window.location.href).searchParams.get('view') || 'overview';
  navigate(view, { updateUrl: false });
});

const initialView = new URL(window.location.href).searchParams.get('view') || 'overview';
navigate(initialView, { updateUrl: false });
