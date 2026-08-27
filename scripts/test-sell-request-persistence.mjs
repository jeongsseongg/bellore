import assert from 'node:assert/strict';
import fs from 'node:fs';
import { installSellRequestAccess } from '../app/services/sell/sell-request-access.js';

const calls = [];
const backend = {
  uploadPhotos: async (photos, limit) => {
    assert.deepEqual(photos, ['data:image/webp;base64,AAA']);
    assert.equal(limit, 10);
    return ['https://iumsnacuxgssnnbckurq.supabase.co/storage/v1/object/public/photos/quote/test.webp'];
  },
  currentUser: () => ({ id: 'member-1' }),
};
const client = {
  functions: {
    invoke: async (name, options) => {
      calls.push({ name, body: options.body });
      return {
        data: {
          ok: true,
          receiptNo: 'BLR-1234567890',
          record: { quoteRequestId: 'quote-1' },
        },
        error: null,
      };
    },
  },
};

installSellRequestAccess({
  backend,
  getClient: () => client,
  window: { localStorage: new Map() },
});

assert.equal(typeof backend.createSellRequest, 'function');
const result = await backend.createSellRequest({
  method: 'compare',
  name: '테스트 고객',
  phone: '01012345678',
  brand: 'Rolex',
  model: 'Submariner',
  ref: '126610LN',
  year: '2024',
  parts: ['보증서'],
  memo: 'persistence contract',
  photos: ['data:image/webp;base64,AAA'],
});

assert.equal(calls.length, 1);
assert.equal(calls[0].name, 'sell-request-access');
assert.deepEqual(calls[0].body, {
  action: 'create',
  method: 'compare',
  name: '테스트 고객',
  phone: '01012345678',
  brand: 'Rolex',
  model: 'Submariner',
  ref: '126610LN',
  year: '2024',
  parts: ['보증서'],
  memo: 'persistence contract',
  photoUrls: ['https://iumsnacuxgssnnbckurq.supabase.co/storage/v1/object/public/photos/quote/test.webp'],
});
assert.equal(result.record.quoteRequestId, 'quote-1');

const edge = fs.readFileSync(new URL('../supabase/functions/sell-request-access/index.ts', import.meta.url), 'utf8');
const telegramSql = fs.readFileSync(new URL('../telegram_operations.sql', import.meta.url), 'utf8');
assert.match(edge, /from\("quote_requests"\)\.insert\(/, 'the create action persists a comparison request');
assert.match(telegramSql, /after insert or update of status on public\.quote_requests/, 'the quote insert reaches the Telegram trigger');
assert.match(telegramSql, /private\.telegram_ops_new_key\(\)/, 'the trigger allocates the four-digit operation key');
assert.match(telegramSql, /insert into public\.telegram_ops_outbox[\s\S]*?'quote_received'/, 'the trigger durably queues the Telegram notification');

console.log('sell request persistence path: client=1 edge=1 key=1 outbox=1 passed');
