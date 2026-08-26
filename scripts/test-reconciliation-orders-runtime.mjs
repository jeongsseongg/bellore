import assert from 'node:assert/strict';
import {
  CONFIRMED_RECONCILIATION_STATUSES,
  MAX_ORDERS_PER_RECONCILIATION_GROUP,
  PROVIDER_CANCELLATION_MAX_MS,
  RECENT_TERMINAL_RECONCILIATION_AGE_MS,
  RECONCILIATION_CONCURRENCY,
  RECONCILIATION_GROUP_COUNT,
  SUPABASE_REQUEST_IDLE_TIMEOUT_MS,
  loadReconciliationOrders,
  reconciliationExecutionBudget,
} from '../supabase/functions/_shared/reconciliation-orders.ts';
import { RECONCILIATION_ROTATION_MS } from '../supabase/functions/_shared/payment-recovery-policy.mjs';

class Query {
  constructor(rows, calls) {
    this.rows = rows;
    this.calls = calls;
    this.filters = [];
    this.orders = [];
    this.head = false;
    this.window = null;
  }

  select(_columns, options = {}) { this.head = options.head === true; return this; }
  eq(field, value) { this.filters.push(['eq', field, value]); return this; }
  in(field, values) { this.filters.push(['in', field, values]); return this; }
  lt(field, value) { this.filters.push(['lt', field, value]); return this; }
  gte(field, value) { this.filters.push(['gte', field, value]); return this; }
  order(field, options = {}) { this.orders.push([field, options.ascending !== false]); return this; }
  range(from, to) { this.window = [from, to]; return this; }

  execute() {
    let result = this.rows.filter((row) => this.filters.every(([operator, field, value]) => {
      if (operator === 'eq') return row[field] === value;
      if (operator === 'in') return value.includes(row[field]);
      if (operator === 'lt') return row[field] < value;
      return row[field] >= value;
    }));
    result.sort((left, right) => {
      for (const [field, ascending] of this.orders) {
        const compared = String(left[field]).localeCompare(String(right[field]));
        if (compared) return ascending ? compared : -compared;
      }
      return 0;
    });
    const count = result.length;
    if (this.window) result = result.slice(this.window[0], this.window[1] + 1);
    this.calls.push({ filters: this.filters, head: this.head, window: this.window });
    return { data: this.head ? null : result, count: this.head ? count : null, error: null };
  }

  then(resolve, reject) { return Promise.resolve(this.execute()).then(resolve, reject); }
}

const nowMs = Date.parse('2026-08-26T12:00:00.000Z');

assert.deepEqual(reconciliationExecutionBudget(), {
  maxOrders: 5,
  waves: 1,
  providerWorstCaseMs: 120_000,
  withinIdleTimeout: true,
});
assert.equal(RECONCILIATION_GROUP_COUNT, 5);
assert.equal(MAX_ORDERS_PER_RECONCILIATION_GROUP, 1);
assert.equal(RECONCILIATION_CONCURRENCY, 5);
assert.equal(PROVIDER_CANCELLATION_MAX_MS, 120_000);
assert.equal(SUPABASE_REQUEST_IDLE_TIMEOUT_MS, 150_000);
assert(PROVIDER_CANCELLATION_MAX_MS < SUPABASE_REQUEST_IDLE_TIMEOUT_MS);

const isoBefore = (milliseconds) => new Date(nowMs - milliseconds).toISOString();
const rows = [
  { id: 'refund', order_no: 'refund', status: 'refund_pending', created_at: isoBefore(9_000), payment_contract_version: 2 },
  { id: 'review', order_no: 'review', status: 'payment_review', created_at: isoBefore(8_000), payment_contract_version: 2 },
  { id: 'pending-stale', order_no: 'pending-stale', status: 'pending', created_at: isoBefore(120_000), payment_contract_version: 2 },
  { id: 'pending-fresh', order_no: 'pending-fresh', status: 'pending', created_at: isoBefore(-270_000), payment_contract_version: 2 },
  ...['paid', 'shipping', 'confirmed', 'cancel_req'].map((status, index) => ({
    id: `confirmed-${index}`,
    order_no: `confirmed-${index}`,
    status,
    paid_at: isoBefore((index + 1) * 2_000),
    created_at: isoBefore((index + 1) * 2_000),
    payment_contract_version: 2,
  })),
  ...['a', 'b', 'c', 'd'].map((id, index) => ({
    id: `terminal-${id}`,
    order_no: `terminal-${id}`,
    status: index % 2 ? 'canceled' : 'failed',
    // The checkout is old, but it entered a terminal state recently. Filtering
    // by created_at would silently miss this late-PAID recovery candidate.
    created_at: isoBefore(30 * 86_400_000 + index * 1_000),
    payment_terminal_at: isoBefore((index + 1) * 3_600_000),
    payment_contract_version: 2,
  })),
  { id: 'terminal-old', order_no: 'terminal-old', status: 'failed', created_at: isoBefore(1_000), payment_terminal_at: isoBefore(8 * 86_400_000), payment_contract_version: 2 },
  { id: 'terminal-legacy', order_no: 'terminal-legacy', status: 'failed', created_at: isoBefore(1_000), payment_terminal_at: isoBefore(1_000), payment_contract_version: null },
  { id: 'confirmed-legacy', order_no: 'confirmed-legacy', status: 'paid', created_at: isoBefore(1_000), payment_contract_version: null },
].map((row) => ({ amount: 1300, paid_at: null, payment_terminal_at: null, payment_key: row.order_no, ...row }));

async function load(atMs, limit = 2) {
  const calls = [];
  const admin = { from: () => new Query(rows, calls) };
  const loaded = await loadReconciliationOrders({
    admin,
    staleBefore: new Date(atMs - 60_000).toISOString(),
    nowMs: atMs,
    limit,
  });
  assert.ok(loaded.orders);
  assert.equal(calls.length, 10);
  assert(calls.every((call) => call.filters.some(
    ([operator, field, value]) => operator === 'eq' && field === 'payment_contract_version' && value === 2,
  )));
  const terminalCalls = calls.filter((call) => call.filters.some(
    ([operator, field, value]) => operator === 'in' && field === 'status' &&
      value.length === 2 && value.includes('failed') && value.includes('canceled'),
  ));
  assert.equal(terminalCalls.length, 2);
  assert(terminalCalls.every((call) => call.filters.some(
    ([operator, field, value]) => operator === 'gte' && field === 'payment_terminal_at' &&
      value === new Date(atMs - RECENT_TERMINAL_RECONCILIATION_AGE_MS).toISOString(),
  )));
  assert.equal(loaded.orders.some((order) => order.id === 'terminal-old'), false);
  assert.equal(loaded.orders.some((order) => order.id === 'terminal-legacy'), false);
  assert.equal(loaded.orders.some((order) => order.id === 'confirmed-legacy'), false);
  assert.equal(loaded.orders.some((order) => order.id === 'pending-fresh'), false);
  return loaded.orders;
}

const first = await load(nowMs);
const second = await load(nowMs + RECONCILIATION_ROTATION_MS);
const bounded = await load(nowMs, MAX_ORDERS_PER_RECONCILIATION_GROUP);
assert.equal(bounded.length <= RECONCILIATION_GROUP_COUNT, true);
assert.equal(bounded.length <= RECONCILIATION_CONCURRENCY, true,
  'the scheduled batch must fit in one provider-call wave');
for (const statuses of [
  ['refund_pending'], ['payment_review'], ['pending'], ['failed', 'canceled'],
  [...CONFIRMED_RECONCILIATION_STATUSES],
]) {
  assert.equal(bounded.filter((order) => statuses.includes(order.status)).length <= 1, true);
}
const visitedTerminalIds = new Set(
  [...first, ...second].filter((order) => ['failed', 'canceled'].includes(order.status)).map((order) => order.id),
);
const visitedConfirmedIds = new Set(
  [...first, ...second]
    .filter((order) => CONFIRMED_RECONCILIATION_STATUSES.includes(order.status))
    .map((order) => order.id),
);
assert.deepEqual([...visitedTerminalIds].sort(), [
  'terminal-a', 'terminal-b', 'terminal-c', 'terminal-d',
]);
assert.equal(
  rows.find((order) => order.id === 'terminal-a').created_at < isoBefore(RECENT_TERMINAL_RECONCILIATION_AGE_MS),
  true,
  'an old checkout closed today must still enter the seven-day terminal sweep',
);
assert.deepEqual([...visitedConfirmedIds].sort(), [
  'confirmed-0', 'confirmed-1', 'confirmed-2', 'confirmed-3',
]);
for (const batch of [first, second]) {
  assert.equal(batch.filter((order) => ['failed', 'canceled'].includes(order.status)).length, 2);
  assert.equal(batch.some((order) => order.id === 'refund'), true);
  assert.equal(batch.some((order) => order.id === 'review'), true);
  assert.equal(batch.some((order) => order.id === 'pending-stale'), true);
  assert.equal(batch.filter((order) => CONFIRMED_RECONCILIATION_STATUSES.includes(order.status)).length, 2);
}

console.log('reconciliation order selection runtime: ok');
