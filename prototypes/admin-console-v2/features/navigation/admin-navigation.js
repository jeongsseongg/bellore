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
    <section class="nav-group is-open" data-nav-group>
      <button class="nav-group-toggle" type="button" data-nav-group-toggle aria-expanded="true">
        <span>${group.label}</span><i aria-hidden="true"></i>
      </button>
      <div class="nav-group-items" data-nav-group-items>${group.items.map(navItemMarkup).join('')}</div>
    </section>`).join('');

  function openGroup(group) {
    if (!group) return;
    group.classList.add('is-open');
    group.querySelector('[data-nav-group-toggle]')?.setAttribute('aria-expanded', 'true');
  }

  function select(viewId, { focus = false } = {}) {
    const next = root.querySelector(`[data-view="${viewId}"]`);
    if (!next) return;
    openGroup(next.closest('[data-nav-group]'));
    root.querySelectorAll('[data-view]').forEach((button) => {
      const active = button === next;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-current', active ? 'page' : 'false');
    });
    if (focus) next.focus();
  }

  root.addEventListener('click', (event) => {
    const toggle = event.target.closest('[data-nav-group-toggle]');
    if (toggle) {
      const group = toggle.closest('[data-nav-group]');
      const open = !group.classList.contains('is-open');
      group.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      return;
    }
    const button = event.target.closest('[data-view]');
    if (!button) return;
    const viewId = button.dataset.view;
    select(viewId);
    onNavigate(viewId);
  });

  return { select };
}
