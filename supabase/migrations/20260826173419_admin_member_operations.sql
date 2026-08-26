-- Auditable administrator actions for member suspension, resumption, and deletion.

create table if not exists public.member_admin_events (
  id uuid primary key default gen_random_uuid(),
  target_user_id uuid not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  target_role text not null check (target_role in ('customer', 'vendor', 'partner')),
  action text not null check (action in ('suspend', 'resume', 'delete')),
  status text not null check (status in ('pending', 'succeeded', 'failed')),
  reason text not null check (char_length(reason) between 2 and 300),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint member_admin_events_metadata_object
    check (jsonb_typeof(metadata) = 'object')
);

create index if not exists member_admin_events_target_created_idx
  on public.member_admin_events (target_user_id, created_at desc);

create index if not exists member_admin_events_actor_created_idx
  on public.member_admin_events (actor_user_id, created_at desc);

alter table public.member_admin_events enable row level security;
revoke all on table public.member_admin_events from anon, authenticated;

