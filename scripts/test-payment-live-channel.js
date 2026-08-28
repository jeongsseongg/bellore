'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const config = fs.readFileSync(path.join(root, 'supabase-config.js'), 'utf8');
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
assert.match(config, /testOnly:\s*false/, 'later cache releases must preserve the live Naver Pay channel');

for (const [id, payMethod] of [
  ['virtual', 'VIRTUAL_ACCOUNT'],
  ['kakaopay', 'EASY_PAY'],
  ['tosspay', 'EASY_PAY'],
]) {
  assert.match(config, new RegExp(`id:\\s*"${id}"[^\\n]*payMethod:\\s*"${payMethod}"[^\\n]*channelKey:\\s*"${expectedLiveChannel}"`));
}
assert.match(config, /easyPayProvider:\s*"KAKAOPAY"/);
assert.match(config, /easyPayProvider:\s*"TOSSPAY"/);
assert.doesNotMatch(config, /EASY_PAY_PROVIDER_(?:KAKAOPAY|TOSSPAY)/,
  'PortOne V2 direct-call providers must use KAKAOPAY/TOSSPAY');
assert.match(config, /hint:\s*"카카오페이 바로 결제"/);
assert.match(config, /hint:\s*"토스페이 바로 결제"/);
assert.match(config, /pointEarnBps:\s*0/,
  'client must not advertise points until an explicit operating policy enables them');

console.log('PortOne live payment channel contract: 14/14 passed');
