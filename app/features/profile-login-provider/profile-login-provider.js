function ensureRow(document) {
  const home = document.querySelector('#profilePage .prof-step[data-pstep="home"]');
  if (!home) return null;
  let row = home.querySelector('[data-profile-login-provider]');
  if (row) return row;
  row = document.createElement('div');
  row.className = 'prof-row';
  row.dataset.profileLoginProvider = '';
  row.setAttribute('aria-label', '로그인 방법');
  const label = document.createElement('span');
  label.className = 'prof-row-l';
  label.textContent = '로그인 방법';
  const value = document.createElement('span');
  value.className = 'prof-row-v';
  value.textContent = '-';
  row.append(label, value);
  home.querySelector('.prof-lead')?.after(row);
  return row;
}

export function initProfileLoginProvider({ document, socialAuth }) {
  const row = ensureRow(document);
  if (!row) return { refresh: async () => {} };
  const value = row.querySelector('.prof-row-v');

  async function refresh() {
    const user = await socialAuth.getUser();
    if (!user) { value.textContent = '-'; return []; }
    const labels = socialAuth.socialProviderLabels(user);
    const providers = labels.length ? labels.map((label) => `${label} 로그인`) : ['이메일 로그인'];
    value.textContent = providers.join(' · ');
    return providers;
  }

  const listener = () => refresh().catch(() => { value.textContent = '-'; });
  document.addEventListener('bellore:auth', listener);
  refresh().catch(() => { value.textContent = '-'; });
  return { refresh, disconnect: () => document.removeEventListener('bellore:auth', listener) };
}
