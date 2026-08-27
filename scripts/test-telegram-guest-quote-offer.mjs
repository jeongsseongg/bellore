import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const migration = await readFile(
  new URL('supabase/migrations/20260827165000_guest_quote_bid_notification.sql', root),
  'utf8'
);
const currentNotification = await readFile(new URL('bid_notify.sql', root), 'utf8');

assert.match(migration, /drop trigger if exists trg_notify_bid on public\.bids/i,
  'the legacy trigger that writes a NULL notification recipient must be removed');
assert.match(migration, /drop function if exists public\.notify_on_bid\(\)/i,
  'the obsolete duplicate trigger function must not remain callable');
assert.match(migration, /trg_notify_customer_on_bid[\s\S]*notify_customer_on_bid/i,
  'migration must fail closed if the guest-safe notification trigger is absent');
assert.match(currentNotification, /if not found or customer_id is null then\s+return new;/i,
  'the retained customer notification trigger must explicitly allow guest quotes');
assert.match(currentNotification, /exception\s+when others then[\s\S]*raise warning/i,
  'notification persistence must remain non-fatal to bid persistence');

console.log('telegram guest quote offer migration checks passed');
