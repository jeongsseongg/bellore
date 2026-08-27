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

console.log('PortOne live payment channel contract: 5/5 passed');
