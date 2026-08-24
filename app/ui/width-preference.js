export function initWidthPreference({ document, getStorage = () => null }) {
  const root = document.documentElement;
  const toggle = document.getElementById('toggleWide');
  if (!toggle) return;

  const sync = () => {
    toggle.setAttribute('aria-checked', root.getAttribute('data-width') === 'full' ? 'true' : 'false');
  };
  toggle.addEventListener('click', () => {
    const full = root.getAttribute('data-width') === 'full';
    if (full) root.removeAttribute('data-width');
    else root.setAttribute('data-width', 'full');
    try {
      getStorage()?.setItem('bellore_width', full ? 'app' : 'full');
    } catch {
      // The storage getter itself may throw in privacy/sandboxed contexts.
    }
    sync();
  });
  sync();
}
