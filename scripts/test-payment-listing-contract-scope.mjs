import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const migration = readFileSync(
  join(root, 'supabase/migrations/20260826160000_payment_recovery_listing_state.sql'),
  'utf8',
);
const occurrences = (source, pattern) => (source.match(pattern) || []).length;

const columnDefinition = migration.indexOf(
  'add column if not exists payment_contract_version smallint',
);
const triggerFunction = migration.indexOf(
  'create or replace function public.sync_listing_state_from_order_v1()',
);
assert(columnDefinition >= 0, '1600 must define the payment contract discriminator');
assert(
  columnDefinition < triggerFunction,
  'the discriminator must exist before the listing-state trigger is compiled',
);
assert.match(
  migration,
  /add column if not exists restock_required boolean not null default false/,
  'v2 physical-restock hold must be durable on the order',
);
assert.match(
  migration,
  /add column if not exists payment_review_required boolean not null default false/,
  'financial review must be recorded without replacing fulfilment lifecycle',
);

const triggerBody = migration.match(
  /create or replace function public\.sync_listing_state_from_order_v1\(\)([\s\S]*?)\$\$;/,
)?.[1] || '';
assert.match(
  triggerBody,
  /if new\.payment_contract_version is distinct from 2 then\s+return null;\s+end if;/,
  'legacy orders must be a no-op in the listing-state trigger',
);

const backfillStart = migration.indexOf('-- Backfill listings directly.');
const cleanupStart = migration.indexOf(
  'create or replace function public.release_expired_checkout_reservations()',
);
assert(backfillStart >= 0 && cleanupStart > backfillStart, 'listing backfill boundary missing');
const backfill = migration.slice(backfillStart, cleanupStart);
assert.equal(
  occurrences(backfill, /from public\.orders as orders/g),
  6,
  'the deterministic backfill must retain its six order sources',
);
assert.equal(
  occurrences(backfill, /orders\.payment_contract_version = 2/g),
  6,
  'every listing backfill source must be scoped to payment contract v2',
);

const cleanupBody = migration.match(
  /create or replace function public\.release_expired_checkout_reservations\(\)([\s\S]*?)\$\$;/,
)?.[1] || '';
assert.match(
  cleanupBody,
  /where payment_contract_version = 2\s+and status in \('refunded', 'canceled', 'failed'\)\s+and not coalesce\(restock_required, false\)/,
  'scheduled listing cleanup must ignore legacy terminal orders',
);
assert.match(
  backfill,
  /orders\.restock_required[\s\S]*orders\.status in \('refund_pending', 'refunded', 'canceled', 'failed'\)/,
  'post-fulfilment refund holds must backfill to sold ownership, not on_sale',
);

const syncListing = (listing, order) => {
  if (order.paymentContractVersion !== 2) return listing;
  if (order.status === 'refunded' && order.restockRequired) {
    return { ...listing, status: 'sold' };
  }
  return { ...listing, status: order.status === 'confirmed' ? 'sold' : 'reserved' };
};
const currentListing = { id: 'watch-current', status: 'on_sale' };
assert.equal(
  syncListing(currentListing, { paymentContractVersion: null, status: 'confirmed' }),
  currentListing,
  'a historical order cannot mark a current listing sold',
);
assert.deepEqual(
  syncListing(currentListing, { paymentContractVersion: 2, status: 'confirmed' }),
  { id: 'watch-current', status: 'sold' },
  'the v2 listing-state contract remains active',
);
assert.deepEqual(
  syncListing(currentListing, {
    paymentContractVersion: 2,
    status: 'refunded',
    restockRequired: true,
  }),
  { id: 'watch-current', status: 'sold' },
  'a post-fulfilment refund stays physically unavailable until inspection',
);

console.log('payment listing contract scope: ok');
