import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { applyHomeLayoutConfig } from '../app/features/home-layout/home-layout.js';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const [bootstrap, build, sw] = await Promise.all([
  read('app/bootstrap.js'),
  read('tools/build-pages.mjs'),
  read('sw.js'),
]);

function node(id) {
  const title = { textContent: id };
  return {
    id,
    dataset: {},
    hidden: false,
    querySelector(selector) { return selector === '.hrow-title' ? title : null; },
    title,
  };
}

const hero = node('hero');
const sale = node('sale');
const drop = node('drop');
const selectors = new Map([
  ['#heroCarousel', hero],
  ['#rowSaleBlock', sale],
  ['#rowDropBlock', drop],
]);
const home = {
  children: [hero, sale, drop],
  querySelector(selector) { return selectors.get(selector) || null; },
  append(child) {
    this.children = this.children.filter((item) => item !== child);
    this.children.push(child);
  },
};
const document = { querySelector(selector) { return selector === '#home' ? home : null; } };

applyHomeLayoutConfig(document, {
  order: ['drop', 'hero', 'sale'],
  blocks: {
    drop: { visible: false, title: '오늘 종료' },
    sale: { visible: true, title: '이번 주 혜택' },
  },
});

assert.deepEqual(home.children.map((item) => item.id), ['drop', 'hero', 'sale']);
assert.equal(drop.hidden, true);
assert.equal(drop.title.textContent, '오늘 종료');
assert.equal(sale.title.textContent, '이번 주 혜택');
assert.match(bootstrap, /initHomeLayout\(\{[\s\S]*createLegacyHomeLayoutAdapter\(\{ window \}\)/);

for (const [file, key] of [
  ['app/features/home-layout/home-layout-config.js', '20260827-home-block-editor-v1'],
  ['app/features/home-layout/home-layout.js', '20260827-home-block-editor-v1'],
  ['app/legacy/home-layout-adapter.js', '20260827-home-block-editor-v1'],
]) {
  assert(build.includes(`'${file}'`), `${file} must be copied to the Pages artifact`);
  assert(sw.includes(`./${file}?v=${key}`), `${file} must be precached with its import key`);
}

console.log('home layout runtime: apply=1 adapter=1 artifact=3 cache=3 passed');
