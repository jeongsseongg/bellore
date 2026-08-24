'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'verify.html'), 'utf8');
const runtime = fs.readFileSync(path.join(root, 'tools', 'verify-browser.js'), 'utf8');
const pagesBuilder = fs.readFileSync(path.join(root, 'tools', 'build-pages.mjs'), 'utf8');
const artifactPolicy = fs.readFileSync(path.join(root, 'scripts', 'test-pages-artifact.mjs'), 'utf8');

assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/i, 'verify page must not contain executable inline script');
assert.doesNotMatch(html, /\sstyle\s*=/i, 'verify page must not contain inline style attributes');
assert.match(html, /<meta name="robots" content="noindex,nofollow">/, 'local diagnostic page must opt out of indexing');
assert.match(html, /운영 배포에 포함되지 않는 로컬 전용 진단 도구/, 'local-only scope must be visible on the page');
assert.match(html, /<script defer src="tools\/verify-browser\.js"><\/script>/, 'file-compatible classic script must remain deferred');
assert.doesNotMatch(html, /<script[^>]*type="module"[^>]*verify-browser/, 'file:// diagnostics must not depend on module loading');
assert.doesNotMatch(runtime, /^\s*(?:import|export)\b/m, 'local diagnostic runtime must stay classic-script compatible');
assert.doesNotThrow(() => new Function(runtime), 'local diagnostic runtime must parse as a classic script');
assert.doesNotMatch(runtime, /window\.sb\s*=/, 'diagnostic client must not create a browser global');
assert.match(runtime, /signInWithPassword/);
assert.match(runtime, /from\('listings'\)/);
for (const localOnlyFile of ['verify.html', 'tools/verify-browser.css', 'tools/verify-browser.js']) {
  assert(!pagesBuilder.includes(`'${localOnlyFile}'`), `${localOnlyFile} must stay outside the production allowlist`);
}
assert.match(artifactPolicy, /FORBIDDEN_TOP_LEVEL[\s\S]*['"]tools['"]/, 'production artifact must continue to reject the tools directory');

console.log('verify local-only browser invariants: ok');
