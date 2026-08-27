const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const base = path.join(root, 'prototypes', 'mypage-kelly');
const html = fs.readFileSync(path.join(base, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(base, 'mypage-kelly.css'), 'utf8');
const js = fs.readFileSync(path.join(base, 'mypage-kelly.js'), 'utf8');

assert.match(html, /theme-color" content="#24623e"/, 'Kelly main color is declared for the browser surface');
assert.match(html, /account-role-preview\.css/, 'the preview reuses the real My Page component styles');
assert.match(js, /initAccountRolePreview[\s\S]*cloneRoleContent\('customer'\)/,
  'the Kelly page reuses the customer My Page renderer and stable defaults');
assert.match(css, /--kelly-main:\s*#24623e[\s\S]*--kelly-accent:\s*#3a915b/,
  'the chosen Kelly palette remains exact');
assert.match(css, /\.editor-panel[\s\S]*display:\s*none/,
  'the customer-facing preview hides the administrator editor');
assert.match(css, /width:\s*min\(100%, 660px\)/, 'the approved 660px My Page width is preserved');
assert.match(css, /@media \(max-width: 700px\)[\s\S]*padding:\s*0/,
  'the customer-facing preview becomes edge-to-edge on mobile');

console.log('Kelly My Page: 7 checks passed');
