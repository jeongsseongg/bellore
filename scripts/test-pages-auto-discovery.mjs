import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { discoverPageHtmlFiles, injectPageAssets, PAGE_ASSET_TOKEN } from '../tools/pages-html.mjs';

const fixture = await mkdtemp(join(tmpdir(), 'bellore-pages-auto-'));
try {
  await mkdir(join(fixture, 'pages'));
  await writeFile(join(fixture, 'pages', 'orders.html'), '<!doctype html>');
  await writeFile(join(fixture, 'pages', 'my-page.HTML'), '<!doctype html>');
  await writeFile(join(fixture, 'pages', 'ignore.txt'), 'not a page');
  assert.deepEqual(await discoverPageHtmlFiles(fixture), ['pages/my-page.HTML', 'pages/orders.html']);

  const source = `const PAGE_ASSETS = ${PAGE_ASSET_TOKEN};\nconst SHELL_ASSETS = [...PAGE_ASSETS];`;
  const rendered = injectPageAssets(source, ['pages/my-page.html', 'pages/orders.html']);
  assert.match(rendered, /"\.\/pages\/my-page\.html"/);
  assert.match(rendered, /"\.\/pages\/orders\.html"/);
  assert.doesNotMatch(rendered, /__BELLORE_PAGE_ASSETS__/);

  const root = new URL('..', import.meta.url);
  const build = await readFile(new URL('tools/build-pages.mjs', root), 'utf8');
  const sw = await readFile(new URL('sw.js', root), 'utf8');
  assert.match(build, /discoverPageHtmlFiles\(ROOT\)/);
  assert.match(build, /for \(const file of pageFiles\) await copyFileFromRoot\(file, output\)/);
  assert.match(build, /injectPageAssets\(await readFile\(serviceWorkerPath, 'utf8'\), pageFiles\)/);
  assert.match(sw, /const PAGE_ASSETS = \/\*__BELLORE_PAGE_ASSETS__\*\/\[\];/);
  assert.match(sw, /\.\.\.PAGE_ASSETS/);
} finally {
  await rm(fixture, { recursive: true, force: true });
}

console.log('pages auto discovery: artifact=2 service-worker=2 passed');
