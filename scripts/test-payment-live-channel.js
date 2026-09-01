'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const config = fs.readFileSync(path.join(root, 'supabase-config.js'), 'utf8');
const payments = fs.readFileSync(path.join(root, 'payments.js'), 'utf8');
const paymentFlow = fs.readFileSync(path.join(root, 'app/features/checkout/payment-flow.js'), 'utf8');
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

for (const [id, payMethod] of [['easy', 'CARD']]) {
  assert.match(config, new RegExp(`id:\\s*"${id}"[^\\n]*payMethod:\\s*"${payMethod}"[^\\n]*channelKey:\\s*"${expectedLiveChannel}"`));
}
for (const id of ['virtual', 'kakaopay', 'tosspay']) {
  assert.doesNotMatch(config, new RegExp(`id:\\s*"${id}"`),
    `${id} must stay hidden until its operating contract is approved`);
}
assert.match(config, /label:\s*"간편결제"[^\n]*hint:\s*"KG 통합 간편결제"/);
assert.match(config, /id:\s*"easy"[^\n]*payMethod:\s*"CARD"[^\n]*hub:\s*true/,
  'KG hub route must open CARD without the card-only noeasypay bypass');
assert.match(payments, /if \(requestChannel\.easyPayProvider\) req\.easyPay = \{ easyPayProvider: requestChannel\.easyPayProvider \}/,
  'provider-direct routes must pass easyPayProvider to PortOne');
assert.match(paymentFlow, /console\.warn\(`\[BELLORE_PAYMENT\] \$\{diagnostic\}`\)/,
  'provider failures must be serialized so the live failure code is visible in browser logs');
assert.match(paymentFlow, /setAttribute\?\.\('data-bellore-payment-diagnostic', diagnostic\)/,
  'the latest safe provider diagnostic must be inspectable during live browser verification');
assert.match(payments, /requestChannel\.id === 'card'[\s\S]*?acceptmethod:\s*\['noeasypay'\]/,
  'card route must hide hub easy-pay choices on desktop');
assert.match(payments, /requestChannel\.id === 'card'[\s\S]*?P_RESERVED:\s*\['noeasypay=Y'\]/,
  'card route must hide hub easy-pay choices on mobile');
assert.match(presentation, /easy:\s*\{\s*src:\s*'assets\/payment-methods\/easy-pay\.svg'/,
  'KG hub easy-pay must have one neutral payment-method visual');
assert.match(config, /pointEarnBps:\s*0/,
  'client must not advertise points until an explicit operating policy enables them');

console.log('PortOne live payment channel contract: 18/18 passed');
