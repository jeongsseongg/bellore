const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function eventTarget() {
  const listeners = new Map();
  return {
    listeners,
    addEventListener(type, handler) { listeners.set(type, handler); },
    removeEventListener(type, handler) {
      if (listeners.get(type) === handler) listeners.delete(type);
    }
  };
}

function makeRow({ body, cat = 'price', title = '테스트 제목', summary = '요약', image = 'https://bellore.test/watch.jpg', metaParts = ['2026.08.24'] } = {}) {
  const elements = {
    img: { src: image },
    h3: { textContent: title },
    '.tag-mini': { textContent: '시세 분석' },
    '.insight-meta': {
      textContent: metaParts.join(''),
      querySelectorAll(selector) {
        return selector === 'span' ? metaParts.map((textContent) => ({ textContent })) : [];
      }
    },
    p: { textContent: summary }
  };
  const dataset = { cat };
  if (body !== undefined) dataset.body = body;
  return {
    dataset,
    querySelector(selector) { return elements[selector] || null; }
  };
}

function clickTarget({ row = null, action = false, close = false } = {}) {
  return {
    closest(selector) {
      if (selector === '[data-edit], [data-del]') return action ? {} : null;
      if (selector === '.insight-row') return row;
      if (selector === '[data-close]') return close ? {} : null;
      return null;
    }
  };
}

(async () => {
  const root = path.resolve(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const serviceWorker = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  const source = fs.readFileSync(path.join(root, 'app', 'features', 'insights', 'insight-reader.js'), 'utf8');
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
  const { initInsightReader } = await import(moduleUrl);

  const scriptUrl = html.match(/<script src="(script\.js\?v=[^"]+)"/)?.[1];
  const bootstrapUrl = html.match(/<script type="module" src="(app\/bootstrap\.js\?v=[^"]+)"/)?.[1];
  assert(scriptUrl, 'legacy script URL has a release cache key');
  assert(bootstrapUrl, 'bootstrap URL has a release cache key');
  assert(serviceWorker.includes(`'./${scriptUrl}'`), 'service worker precaches the exact script URL');
  assert(serviceWorker.includes(`'./${bootstrapUrl}'`), 'service worker precaches the exact bootstrap URL');
  assert.match(serviceWorker, /\.\/app\/features\/insights\/insight-reader\.js/, 'service worker precaches the insight module');

  const modal = { hidden: true, dataset: {} };
  const imageTarget = { src: '' };
  const titleTarget = { textContent: '' };
  const tagTarget = { textContent: '' };
  const metaTarget = { innerHTML: '' };
  const textTarget = { innerHTML: '' };
  const elements = {
    postModal: modal,
    postModalImg: imageTarget,
    postModalTitle: titleTarget,
    postModalTag: tagTarget,
    postModalMeta: metaTarget,
    postModalText: textTarget
  };
  const documentEvents = eventTarget();
  const document = {
    ...documentEvents,
    body: { style: { overflow: '' } },
    getElementById(id) { return elements[id] || null; }
  };

  const controller = initInsightReader({ document });
  assert.equal(modal.dataset.insightReaderReady, 'true', 'bootstrap marker confirms the reader is initialized');
  let prevented = false;
  const customRow = makeRow({
    body: '첫 문단 <img>\n줄 바꿈\n\n둘째 & 끝',
    title: '동적 게시글',
    summary: '소개 <strong>'
  });
  document.listeners.get('click')({
    target: clickTarget({ row: customRow }),
    preventDefault() { prevented = true; }
  });

  assert.equal(prevented, true, 'row click prevents its default action');
  assert.equal(modal.hidden, false, 'a dynamically supplied row opens the reader');
  assert.equal(document.body.style.overflow, 'hidden', 'open reader locks body scrolling');
  assert.equal(imageTarget.src, 'https://bellore.test/watch.jpg');
  assert.equal(titleTarget.textContent, '동적 게시글');
  assert.equal(tagTarget.textContent, '시세 분석');
  assert.equal(metaTarget.innerHTML, '<span>2026.08.24</span>');
  assert.equal(
    textTarget.innerHTML,
    '<p><strong>소개 &lt;strong&gt;</strong></p><p>첫 문단 &lt;img&gt;<br>줄 바꿈</p><p>둘째 &amp; 끝</p>',
    'data-body is preferred and untrusted body text stays escaped'
  );

  const guideRow = makeRow({ body: undefined, cat: 'guide', title: '나중에 추가된 글' });
  document.listeners.get('click')({
    target: clickTarget({ row: guideRow }),
    preventDefault() {}
  });
  assert.equal(titleTarget.textContent, '나중에 추가된 글', 'delegation handles rows added after initialization');
  assert.match(textTarget.innerHTML, /매입가에 영향을 미치는 핵심 요소/, 'category fallback supplies prepared copy');

  const unsafeMetaRow = makeRow({ metaParts: ['<img src=x onerror=alert(1)>'] });
  document.listeners.get('click')({
    target: clickTarget({ row: unsafeMetaRow }),
    preventDefault() {}
  });
  assert.equal(
    metaTarget.innerHTML,
    '<span>&lt;img src=x onerror=alert(1)&gt;</span>',
    'metadata keeps its span layout without accepting executable markup'
  );

  document.listeners.get('click')({ target: clickTarget({ close: true }), preventDefault() {} });
  assert.equal(modal.hidden, true, 'data-close closes the reader');
  assert.equal(document.body.style.overflow, '');

  modal.hidden = false;
  document.body.style.overflow = 'hidden';
  document.listeners.get('keydown')({ key: 'Escape' });
  assert.equal(modal.hidden, true, 'Escape closes the reader');

  const titleBeforeAdminAction = titleTarget.textContent;
  let adminPrevented = false;
  document.listeners.get('click')({
    target: clickTarget({ row: makeRow({ title: '열리면 안 됨' }), action: true }),
    preventDefault() { adminPrevented = true; }
  });
  assert.equal(adminPrevented, false, 'admin edit/delete actions keep their own handler');
  assert.equal(titleTarget.textContent, titleBeforeAdminAction, 'admin action does not open the reader');

  document.listeners.get('click')({
    target: clickTarget({ row: customRow }),
    preventDefault() {}
  });
  controller.destroy();
  assert.equal(document.listeners.size, 0, 'destroy removes delegated listeners');
  assert.equal(modal.dataset.insightReaderReady, undefined, 'destroy removes the bootstrap marker');
  assert.equal(modal.hidden, true, 'destroy closes an open reader');
  assert.equal(document.body.style.overflow, '', 'destroy releases the scroll lock');

  const noModalEvents = eventTarget();
  const noModalController = initInsightReader({
    document: { ...noModalEvents, getElementById: () => null }
  });
  assert.equal(noModalEvents.listeners.size, 0, 'missing modal installs no listeners');
  assert.doesNotThrow(() => noModalController.destroy(), 'missing modal returns a safe controller');

  console.log('insight reader module invariants: ok');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
