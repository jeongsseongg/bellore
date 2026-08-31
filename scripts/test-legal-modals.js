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

(async () => {
  const sourcePath = path.resolve(__dirname, '..', 'app', 'features', 'legal', 'legal-modals.js');
  const source = fs.readFileSync(sourcePath, 'utf8');
  const index = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');
  const customerUi = fs.readFileSync(path.resolve(__dirname, '..', 'cq-demo.js'), 'utf8');
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
  const { initLegalModals, legalKeyFromHash } = await import(moduleUrl);

  assert.equal(legalKeyFromHash('#privacy-policy'), 'privacy');
  assert.equal(legalKeyFromHash('#terms'), null);

  const modalIds = ['bizInfoModal', 'termsModal', 'privacyModal', 'refundModal', 'guideModal'];
  const elements = Object.fromEntries(modalIds.map((id) => [id, { hidden: true }]));
  const legacyOpen = eventTarget();
  elements.bizInfoOpen = legacyOpen;

  const documentEvents = eventTarget();
  const document = {
    ...documentEvents,
    body: { style: { overflow: '' } },
    getElementById(id) { return elements[id] || null; }
  };
  const windowEvents = eventTarget();
  const browserWindow = {
    ...windowEvents,
    location: { hash: '#privacy-policy' }
  };

  const controller = initLegalModals({ document, window: browserWindow });
  assert.equal(elements.privacyModal.hidden, false, 'privacy hash opens privacy modal');
  assert.equal(document.body.style.overflow, 'hidden');

  controller.hideAll();
  assert(modalIds.every((id) => elements[id].hidden), 'hideAll closes every legal modal');
  assert.equal(document.body.style.overflow, '');

  legacyOpen.listeners.get('click')();
  assert.equal(elements.bizInfoModal.hidden, false, 'legacy business-info opener still works');

  document.listeners.get('click')({
    target: {
      closest(selector) {
        return selector === '[data-legal-open]'
          ? { getAttribute: () => 'terms' }
          : null;
      },
      hasAttribute: () => false
    }
  });
  assert.equal(elements.termsModal.hidden, false, 'data-legal-open opens the requested modal');

  document.listeners.get('keydown')({ key: 'Escape' });
  assert(modalIds.every((id) => elements[id].hidden), 'Escape closes every legal modal');

  browserWindow.location.hash = '#privacy-policy';
  browserWindow.listeners.get('hashchange')();
  assert.equal(elements.privacyModal.hidden, false, 'hashchange keeps the privacy deep link');

  controller.destroy();
  assert.equal(document.listeners.size, 0, 'destroy removes document listeners');
  assert.equal(browserWindow.listeners.size, 0, 'destroy removes window listeners');
  assert.equal(legacyOpen.listeners.size, 0, 'destroy removes legacy listener');

  assert.doesNotMatch(index, /010-6293-6668|01062936668|정성호/,
    '공개 화면에 이전 전화번호나 개인 이름을 노출하면 안 됩니다.');
  assert.match(index, /<a href="tel:80046665" class="footer-tel-link">8004-6665<\/a>/,
    '하단 고객센터는 새 벨로르 대표번호를 사용해야 합니다.');
  assert.doesNotMatch(index, /footer-responsibility[\s\S]*?민원담당자/,
    '하단 책임 안내에 민원담당자를 노출하면 안 됩니다.');
  assert.match(index, /id="refundModal"[\s\S]*?<h4>8\. 민원 담당<\/h4>[\s\S]*?담당: 벨로르[\s\S]*?tel:80046665[\s\S]*?8004-6665/,
    '민원 담당 정보는 반품·교환·환불 정책 안에 있어야 합니다.');
  assert.match(customerUi, /BELLORE_PHONE = '8004-6665'/);
  assert.match(customerUi, /href="tel:80046665"/);

  console.log('legal modal module invariants: ok');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
