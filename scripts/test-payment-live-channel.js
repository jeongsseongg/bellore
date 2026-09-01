'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const config = fs.readFileSync(path.join(root, 'supabase-config.js'), 'utf8');
const payments = fs.readFileSync(path.join(root, 'payments.js'), 'utf8');
const presentation = fs.readFileSync(path.join(root, 'app/features/checkout/checkout-presentation.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const serviceWorker = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');

const expectedLiveChannel = 'channel-key-f9693f47-56c9-4732-822d-bace693db3cb';
const retiredTestChannel = 'channel-key-cf2d8c63-bc14-4341-a885-ce472b9fb07a';
const cardChannel = config.match(/id:\s*"card"[^\n]*channelKey:\s*"([^"]+)"/)?.[1];
const configUrl = html.match(/<script src="(supabase-config\.js\?v=[^"]+)"/)?.[1];

assert.equal(cardChannel, expectedLiveChannel, 'production card payments must use the approved PortOne LIVE channel');
assert.doesNotMatch(config, new RegExp(retiredTestChannel), 'retired PortOne TEST channel must not return to production config');
assert.ok(configUrl, 'HTML must request the payment config with a release key');
assert.ok(serviceWorker.includes(`'./${configUrl}'`), 'service worker must precache the exact payment config URL requested by HTML');
assert.match(config, /testOnly:\s*true/, 'Naver Pay must remain review-account-only until Naver grants final approval');

for (const [id, payMethod] of [['virtual', 'VIRTUAL_ACCOUNT'], ['easy', 'EASY_PAY']]) {
  assert.match(config, new RegExp(`id:\\s*"${id}"[^\\n]*payMethod:\\s*"${payMethod}"[^\\n]*channelKey:\\s*"${expectedLiveChannel}"`));
}
assert.doesNotMatch(config, /id:\s*"(?:kakaopay|tosspay)"|easyPayProvider:/,
  'KG hub easy-pay must not be split into provider-direct channels');
assert.match(config, /label:\s*"간편결제"[^\n]*hint:\s*"카카오페이·토스페이 등"/);
assert.match(payments, /requestChannel\.id === 'card'[\s\S]*?acceptmethod:\s*\['noeasypay'\]/,
  'card route must hide hub easy-pay choices on desktop');
assert.match(payments, /requestChannel\.id === 'card'[\s\S]*?P_RESERVED:\s*\['noeasypay=Y'\]/,
  'card route must hide hub easy-pay choices on mobile');
assert.match(presentation, /easy:\s*\{\s*src:\s*'assets\/payment-methods\/easy-pay\.svg'/,
  'KG hub easy-pay must have one neutral payment-method visual');
assert.match(config, /pointEarnBps:\s*0/,
  'client must not advertise points until an explicit operating policy enables them');

console.log('PortOne live payment channel contract: 13/13 passed');
