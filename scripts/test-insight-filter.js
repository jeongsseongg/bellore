const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function classList(active = false) {
  const values = new Set(active ? ['active'] : []);
  return {
    add(value) { values.add(value); },
    remove(value) { values.delete(value); },
    contains(value) { return values.has(value); }
  };
}

function makeTab(category, active = false) {
  const listeners = new Map();
  return {
    dataset: { cat: category },
    classList: classList(active),
    listeners,
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeEventListener(type, listener) {
      if (listeners.get(type) === listener) listeners.delete(type);
    },
    click() { listeners.get('click')?.(); }
  };
}

function makeRow(category) {
  return { dataset: { cat: category }, style: { display: 'initial' } };
}

(async () => {
  const root = path.resolve(__dirname, '..');
  const source = fs.readFileSync(path.join(root, 'app', 'features', 'insights', 'insight-filter.js'), 'utf8');
  const bootstrap = fs.readFileSync(path.join(root, 'app', 'bootstrap.js'), 'utf8');
  const legacy = fs.readFileSync(path.join(root, 'script.js'), 'utf8');
  const dynamicSource = fs.readFileSync(path.join(root, 'bellore-features.js'), 'utf8');
  const serviceWorker = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  const pagesBuilder = fs.readFileSync(path.join(root, 'tools', 'build-pages.mjs'), 'utf8');
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
  const { initInsightFilter } = await import(moduleUrl);

  const tabs = [makeTab('all', true), makeTab('price'), makeTab('guide'), makeTab('partner')];
  const rows = [makeRow('price'), makeRow('guide')];
  const partnerGrid = { style: { display: 'none' } };
  const document = {
    querySelectorAll(selector) {
      if (selector === '.insight-tab') return tabs;
      if (selector === '.insight-row[data-cat]') return rows;
      return [];
    },
    getElementById(id) { return id === 'partnerGrid' ? partnerGrid : null; }
  };

  const controller = initInsightFilter({ document });
  tabs[2].click();
  assert.deepEqual(tabs.map((tab) => tab.classList.contains('active')), [false, false, true, false], 'one clicked tab stays active');
  assert.deepEqual(rows.map((row) => row.style.display), ['none', ''], 'category click filters the current rows');
  assert.equal(partnerGrid.style.display, 'none');

  const dynamicRow = makeRow('price');
  rows.push(dynamicRow);
  tabs[1].click();
  assert.deepEqual(rows.map((row) => row.style.display), ['', 'none', ''], 'each click re-queries dynamically added rows');

  tabs[3].click();
  assert.deepEqual(rows.map((row) => row.style.display), ['none', 'none', 'none'], 'partner tab hides article rows');
  assert.equal(partnerGrid.style.display, 'block', 'partner tab shows the partner grid');

  tabs[0].click();
  assert.deepEqual(rows.map((row) => row.style.display), ['', '', ''], 'all tab restores every article row');
  assert.equal(partnerGrid.style.display, 'none', 'article tabs hide the partner grid');

  controller.destroy();
  assert(tabs.every((tab) => !tab.listeners.has('click')), 'destroy removes every tab listener');

  const noTabsDocument = { querySelectorAll: () => [], getElementById: () => null };
  const noTabsController = initInsightFilter({ document: noTabsDocument });
  assert.doesNotThrow(() => noTabsController.destroy(), 'missing tabs return a safe controller');
  assert.throws(() => initInsightFilter({ document: null }), /requires document/, 'document is an explicit dependency');

  const noPartnerTabs = [makeTab('partner')];
  const noPartnerRows = [makeRow('guide')];
  const noPartnerController = initInsightFilter({
    document: {
      querySelectorAll(selector) { return selector === '.insight-tab' ? noPartnerTabs : noPartnerRows; },
      getElementById() { return null; }
    }
  });
  assert.doesNotThrow(() => noPartnerTabs[0].click(), 'missing partner grid does not break filtering');
  noPartnerController.destroy();

  assert.match(bootstrap, /import \{ initInsightFilter \} from '\.\/features\/insights\/insight-filter\.js';/, 'bootstrap imports the filter module');
  assert.match(bootstrap, /initInsightFilter\(\{ document \}\);/, 'bootstrap initializes the filter module');
  assert.doesNotMatch(legacy, /function initInsightFilter|initInsightFilter\(\);/, 'legacy filter implementation is removed');
  assert.match(dynamicSource, /var active = \$\('\.insight-tab\.active'\);/, 'dynamic insight rendering keeps the active-tab contract');
  assert.match(dynamicSource, /\$\$\('\.insight-row\[data-cat\]'\)/, 'dynamic insight rendering keeps the row filtering contract');
  assert.match(serviceWorker, /\.\/app\/features\/insights\/insight-filter\.js/, 'service worker precaches the filter module');
  assert.match(pagesBuilder, /app\/features\/insights\/insight-filter\.js/, 'Pages and Firebase artifacts include the filter module');

  console.log('insight filter module invariants: ok');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
