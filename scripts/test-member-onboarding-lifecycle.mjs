import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('..', import.meta.url);
const migration = await readFile(new URL('supabase/migrations/20260827183000_member_onboarding_lifecycle.sql', root), 'utf8');
const edge = await readFile(new URL('supabase/functions/admin-member-ops/index.ts', root), 'utf8');

for (const column of ['signup_submitted_at', 'signup_reviewed_at', 'signup_reviewed_by', 'signup_review_note', 'verification_deferred_at']) {
  assert.match(migration, new RegExp(`add column if not exists ${column}`));
}
assert.match(migration, /create or replace function public\.submit_member_onboarding/);
assert.match(migration, /target\.role::text not in \('vendor', 'partner'\)/);
assert.match(migration, /email_verified[\s\S]*phone_verified[\s\S]*biz_verified/);
assert.match(migration, /grant execute on function public\.submit_member_onboarding\(boolean\) to authenticated/);
assert.match(migration, /create or replace function public\.admin_review_member_onboarding/);
assert.match(migration, /public\.admin_manage_member_profile/);
assert.match(migration, /grant execute on function public\.admin_review_member_onboarding[\s\S]*to service_role/);
assert.match(edge, /Object\.hasOwn\(patch, "approved"\) \? "admin_review_member_onboarding"/);

console.log('member onboarding lifecycle: columns=5 submit=1 review=1 edge=1 passed');
