import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const [index, page, legacy] = await Promise.all([
  read('index.html'),
  read('pages/inquiry.html'),
  read('script.js')
]);

assert.doesNotMatch(index, /id=["']inquiryModal["']/i,
  'the main catalog shell must not retain the inquiry modal markup');
assert.match(page, /<body[^>]*data-bellore-standalone-page=["']inquiry["']/i);
assert.match(page, /id=["']inquiryModal["'][^>]*hidden/i);
for (const id of ['inquiryEyebrow', 'inquiryTitle', 'inquiryForm']) {
  assert.match(page, new RegExp(`id=["']${id}["']`), `${id} moved with the existing design contract`);
}
assert.match(page, /type=["']module["'][^>]*app\/pages\/standalone-page\.js/i);
assert.match(legacy, /window\.location\.assign\('\/pages\/inquiry\?type=' \+ encodeURIComponent/,
  'existing inquiry buttons must deep-link to the standalone page');
assert.match(page, /rel=["']canonical["'][^>]*href=["']https:\/\/bellore\.co\.kr\/pages\/inquiry["']/i,
  'the extensionless inquiry URL must be canonical');
assert.match(legacy, /belloreStandalonePage === 'inquiry'[\s\S]*history\.back\(\)/,
  'standalone close must preserve browser back navigation');
assert.match(legacy, /openInquiry\(new URLSearchParams\(location\.search\)/,
  'deep links must restore the inquiry type');

console.log('inquiry standalone: markup=1 route=1 type=1 history=1 passed');
