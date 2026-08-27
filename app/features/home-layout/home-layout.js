import { HOME_BLOCKS, normalizeHomeLayout } from './home-layout-config.js?v=20260827-home-block-editor-v1';

function setText(root, selector, value) {
  const node = selector ? root.querySelector(selector) : null;
  const next = String(value || '').trim();
  if (node && next && node.textContent.trim() !== next) node.textContent = next;
}

export function applyHomeLayoutConfig(doc, rawConfig) {
  const config = normalizeHomeLayout(rawConfig);
  const home = doc.querySelector('#home');
  if (!home) return config;
  const definitions = new Map(HOME_BLOCKS.map((block) => [block.id, block]));
  const nodes = new Map();
  HOME_BLOCKS.forEach((block) => {
    const node = home.querySelector(block.selector);
    if (node) {
      node.dataset.homeLayoutBlock = block.id;
      nodes.set(block.id, node);
    }
  });
  const current = [...home.children].filter((node) => node.dataset.homeLayoutBlock).map((node) => node.dataset.homeLayoutBlock);
  if (current.join('|') !== config.order.filter((id) => nodes.has(id)).join('|')) {
    config.order.forEach((id) => { const node = nodes.get(id); if (node) home.append(node); });
  }
  config.order.forEach((id) => {
    const block = definitions.get(id);
    const node = nodes.get(id);
    const values = config.blocks[id];
    if (!block || !node || !values) return;
    const wasLayoutHidden = node.dataset.homeLayoutHidden === 'true';
    node.dataset.homeLayoutHidden = values.visible === false ? 'true' : 'false';
    if (values.visible === false) node.hidden = true;
    else if (wasLayoutHidden) node.hidden = false;
    setText(node, block.titleSelector, values.title);
    setText(node, block.subtitleSelector, values.subtitle);
    setText(node, block.moreSelector, values.moreText);
  });
  return config;
}

export function initHomeLayout({ document: doc, window: win, service }) {
  const home = doc.querySelector('#home');
  if (!home || !service?.load) return { refresh: async () => null };
  let config = null;
  let applying = false;
  function apply() {
    if (!config || applying) return;
    applying = true;
    try { applyHomeLayoutConfig(doc, config); } finally { applying = false; }
  }
  async function refresh() {
    config = normalizeHomeLayout(await service.load());
    apply();
    return config;
  }
  const observer = new MutationObserver(() => win.queueMicrotask(apply));
  observer.observe(home, { childList: true, subtree: true });
  refresh().catch((error) => console.warn('홈 화면 운영 설정을 불러오지 못했습니다.', error));
  return { refresh, disconnect: () => observer.disconnect() };
}
