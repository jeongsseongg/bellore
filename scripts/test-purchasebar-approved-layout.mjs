import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const css = read('bellore-redesign.css');
const html = read('index.html');
const hooks = read('.codex/hooks.json');

const desktopBar = /\.pp-bottom\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*52px minmax\(178px, 1fr\) minmax\(176px, 1fr\);[^}]*width:\s*calc\(100% - 24px\);[^}]*margin:\s*0 12px 12px;[^}]*border:\s*1px solid #e5e3df;[^}]*border-radius:\s*18px;[^}]*box-shadow:\s*0 12px 34px rgba\(20, 27, 25, \.08\);[^}]*\}/s;
const desktopNpayBar = /\.pp-bottom\.has-npay\s*\{[^}]*grid-template-columns:\s*52px minmax\(178px, 1fr\) minmax\(176px, 1fr\) minmax\(176px, 1fr\);[^}]*\}/s;
const inlinePrice = /\.pp-bottom \.pp-buyprice\s*\{[^}]*position:\s*relative;[^}]*flex-direction:\s*row;[^}]*padding:\s*25px 8px 0;[^}]*\}/s;
const priceLabel = /\.pp-bottom \.pp-buyprice::before\s*\{[^}]*position:\s*absolute;[^}]*top:\s*8px;[^}]*left:\s*8px;[^}]*\}/s;
const mobileNpayBar = /@media \(max-width:\s*679px\)\s*\{[\s\S]*?\.pp-bottom\.has-npay\s*\{[^}]*grid-template-columns:\s*48px minmax\(0, 1fr\) minmax\(0, 1fr\);[^}]*\}/s;

assert.match(css, desktopBar, 'approved purchase bar stays an inset fully-rounded card');
assert.match(css, desktopNpayBar, 'approved purchase bar keeps regular purchase left and N Pay right');
assert.match(css, inlinePrice, 'approved purchase bar keeps amount and won on one line');
assert.match(css, priceLabel, 'approved purchase bar keeps the sale-price label above the inline amount');
assert.match(css, mobileNpayBar, 'approved purchase bar keeps the compact three-column mobile grid');
assert.doesNotMatch(css, /\.pp-bottom \.pp-buyprice\s*\{[^}]*flex-direction:\s*column;/s, 'price and won must not stack vertically');
assert.match(
  html,
  /<div class="pp-bottom">[\s\S]*id="pmWish"[\s\S]*id="pmBuyPrice"[\s\S]*id="pmBuy"[\s\S]*id="npay-button-container"/,
  'purchase bar DOM order must remain wish, price, regular purchase, then N Pay',
);
assert.match(hooks, /PYTHONUTF8=1 PYTHONIOENCODING=utf-8 python3/, 'POSIX invariant hooks must read UTF-8 paths and payloads');
assert.match(hooks, /\$env:PYTHONUTF8='1'; \$env:PYTHONIOENCODING='utf-8'; python/, 'Windows invariant hooks must read UTF-8 paths and payloads');

console.log('Approved purchase bar layout contract: 9/9 passed');
