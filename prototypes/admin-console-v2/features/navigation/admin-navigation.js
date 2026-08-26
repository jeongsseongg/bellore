import { icon } from '../../ui/icons.js';

function navItemMarkup(item) {
  const badge = item.count
    ? `<span class="nav-count">${item.count}</span>`
    : item.badge
      ? `<span class="nav-badge${item.planned ? ' is-planned' : ''}">${item.badge}</span>`
      : '';

  return `
    <button class="nav-item${item.id === 'overview' ? ' is-active' : ''}" type="button" data-view="${item.id}" aria-current="${item.id === 'overview' ? 'page' : 'false'}">
      ${icon(item.icon)}
      <span class="nav-label">${item.label}</span>
      ${badge}
    </button>`;
}

export function createAdminNavigation({ root, groups, onNavigate }) {
  root.innerHTML = groups.map((group) => `
    <section class="nav-group">
      <p class="nav-group-label">${group.label}</p>
      <div class="nav-group-items">${group.items.map(navItemMarkup).join('')}</div>
    </section>`).join('');

  function select(viewId, { focus = false } = {}) {
    const next = root.querySelector(`[data-view="${viewId}"]`);
    if (!next) return;
    root.querySelectorAll('[data-view]').forEach((button) => {
      const active = button === next;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-current', active ? 'page' : 'false');
    });
    if (focus) next.focus();
  }

  root.addEventListener('click', (event) => {
    const button = event.target.closest('[data-view]');
    if (!button) return;
    const viewId = button.dataset.view;
    select(viewId);
    onNavigate(viewId);
  });

  return { select };
}
