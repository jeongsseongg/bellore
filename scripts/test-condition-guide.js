const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const html = read('index.html');
const bootstrap = read('app/bootstrap.js');
const guide = read('app/features/condition-guide/condition-guide.js');
const css = read('app/features/condition-guide/condition-guide.css');

assert.match(html, /condition-guide\.css\?v=20260826-member-verification-live-v2/);
assert.match(bootstrap, /initConditionGuide\(\{ document, window \}\)/);
assert.match(guide, /\[10, '미사용급'/);
assert.match(guide, /\[1, '정상 사용 어려움'/);
assert.match(guide, /10에 가까울수록 외관 사용 흔적이 적습니다/);
assert.match(guide, /정품 여부·무브먼트 성능·연식·구성품 평가는 별도/);
assert.match(guide, /data-condition-more>자세히 보기/);
assert.match(guide, /MutationObserver/);
assert.match(css, /width: min\(100%, 660px\)/);
assert.match(css, /@media \(max-width: 430px\)/);

console.log('condition guide checks: 10 passed');
