const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'app/features/sell-method/sell-method.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const script = fs.readFileSync(path.join(root, 'script.js'), 'utf8');
const moduleJs = fs.readFileSync(path.join(root, 'app/features/sell-method/sell-method.js'), 'utf8');

const sheetRule = css.match(/\.sell-method__sheet\s*\{([\s\S]*?)\}/)?.[1] || '';

assert.match(sheetRule, /width:\s*100%\s*;/, 'sell sheet fills only the current Bellore frame');
assert.match(
  sheetRule,
  /max-width:\s*var\(--app-panel-w,\s*660px\)\s*;/,
  'sell sheet inherits the fixed 660px Bellore panel token'
);
assert.doesNotMatch(sheetRule, /720px/, 'sell sheet must never use the out-of-spec 720px width');
assert.match(
  html,
  /sell-method\.css\?v=20260826-condition-guide-v1/,
  'the page requests the panel-width-corrected stylesheet'
);
assert.doesNotMatch(html, /class="compare-entry"/, 'the superseded sell landing page is removed');
assert.match(css, /\.sell-method__card\s*\{[\s\S]*?min-height:\s*350px/, 'method cards use the restored original height');
assert.match(css, /\.sell-method__visual\s*\{[\s\S]*?width:\s*180px;[\s\S]*?height:\s*150px/, 'method images use the enlarged desktop size');
assert.match(css, /\.sell-method__instant\s*\{[\s\S]*?min-height:\s*106px/, 'instant purchase action is 20% taller');
assert.doesNotMatch(html, /sell-method__instant-copy[^>]*>[\s\S]*?<small>/, 'instant purchase has no descriptive copy');
assert.match(html, /id="sellMethodFormMount"/, 'all sell forms mount inside the fixed-width sheet');
assert.match(html, /id="sellMethodResume"/, 'the sheet exposes a saved-draft resume action');
assert.match(html, /작성 중인 양식을 나갈까요\?/, 'the sheet contains the same-design leave confirmation');
assert.match(
  moduleJs,
  /indexedDB\.open\(DB_NAME, 1\)/,
  'sell drafts persist across page navigation with IndexedDB'
);
assert.doesNotMatch(script, /var VALID = \[[^\]]*'compare'/, 'the retired compare page is no longer routable');
assert.match(
  moduleJs,
  /if \(oldPage\) oldPage\.remove\(\)/,
  'the retired compare page is removed after its form is mounted in the sheet'
);
assert.match(moduleJs, /visibilitychange/, 'switching tabs or windows immediately flushes the current draft');
assert.match(moduleJs, /pagehide/, 'leaving the document flushes the current draft when possible');
assert.match(html, /id="sellGuidedFlow"/, 'the form starts with guided brand and model selection');
assert.match(html, /id="sellDirectEntry">직접입력/, 'the guided form exposes the requested direct-entry action');
assert.match(moduleJs, /ACCESSORY_QUESTIONS/, 'accessories are collected as sequential questions');
assert.match(moduleJs, /window\.BELLORE_BRANDS/, 'brand previews use the canonical Bellore brand source');
assert.match(moduleJs, /FALLBACK_BRANDS/, 'major brand logos remain available when the legacy global is unavailable');
assert.match(html, /구성품 이미지\/ChatGPT Image 2026년 8월 26일 오전 11_18_56 \(1\)\.png/, 'the new accessory artwork replaces emoji icons');
assert.match(css, /\.sell-guide__question-visual img\s*\{[\s\S]*?height:\s*160px/, 'guided accessory artwork stays fully visible');
assert.match(css, /\.sell-guide__suggestions\s*\{[\s\S]*?max-height:\s*234px;[\s\S]*?overflow-y:\s*auto/, 'brand preview shows six cards and scrolls the complete list');
assert.match(css, /\.sell-guide__suggestions--models\s*\{[\s\S]*?max-height:\s*186px/, 'model preview shows three rows and scrolls the complete list');
assert.doesNotMatch(moduleJs, /matches = [^;]+\.slice\(0, 8\)/, 'guided previews no longer truncate the available options');
assert.match(html, /id="sellGuideDetails"/, 'reference and stamping/year are collected before accessory questions');
assert.match(html, /스탬핑\/연식/, 'the purchase timing field uses the approved stamping/year label');
assert.match(html, /assets\/cq-guide\/front\.jpg/, 'the guided detail page uses the supplied photo examples');
assert.match(css, /\.sell-method__form-mount\.is-guided-details[\s\S]*?#sellWatchInfoBlock/, 'the second guided page hides already-completed watch fields');
assert.match(moduleJs, /stage:\s*entryMode,\s*guideComplete/, 'the completed guided stage is persisted with the draft');

console.log('sell method sheet width invariants: ok');
