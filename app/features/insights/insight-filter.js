const NOOP_CONTROLLER = Object.freeze({ destroy() {} });

export function initInsightFilter({ document: doc }) {
  if (!doc) throw new Error('insight filter requires document');

  const tabs = Array.from(doc.querySelectorAll('.insight-tab'));
  const partnerGrid = doc.getElementById('partnerGrid');
  if (!tabs.length) return NOOP_CONTROLLER;

  const listeners = new Map();

  tabs.forEach((tab) => {
    const onClick = () => {
      const category = tab.dataset.cat;
      const rows = Array.from(doc.querySelectorAll('.insight-row[data-cat]'));

      tabs.forEach((item) => item.classList.remove('active'));
      tab.classList.add('active');

      if (category === 'partner') {
        rows.forEach((row) => { row.style.display = 'none'; });
        if (partnerGrid) partnerGrid.style.display = 'block';
        return;
      }

      if (partnerGrid) partnerGrid.style.display = 'none';
      rows.forEach((row) => {
        row.style.display = category === 'all' || row.dataset.cat === category ? '' : 'none';
      });
    };

    listeners.set(tab, onClick);
    tab.addEventListener('click', onClick);
  });

  return Object.freeze({
    destroy() {
      listeners.forEach((listener, tab) => tab.removeEventListener('click', listener));
      listeners.clear();
    }
  });
}
