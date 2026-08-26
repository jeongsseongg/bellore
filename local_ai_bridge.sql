-- BELLORE SHOP LOCAL AI BRIDGE v1
-- Supabase SQL Editor에서 파일 전체를 한 번 실행하세요.
-- 공개 웹 → 안전한 요청 큐 → 사무실 로컬 AI → 검증된 답변 조회

begin;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- Supabase installs extensions in the `extensions` schema. `IF NOT EXISTS`
-- does not relocate a legacy installation from another schema, so fail with a
-- precise operator action instead of compiling functions against a missing
-- `extensions.digest(text,text)` symbol.
do $pgcrypto_schema_required$
begin
  if to_regprocedure('extensions.digest(text,text)') is null then
    raise exception 'LOCAL_AI_BRIDGE_PGCRYPTO_SCHEMA_REQUIRED'
      using hint = 'Move/reinstall pgcrypto in the extensions schema, then rerun this file.';
  end if;
end
$pgcrypto_schema_required$;

create table if not exists public.ai_local_worker_auth (
  worker_name text primary key,
  secret_hash text not null check (char_length(secret_hash) = 64),
  is_active boolean not null default true,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ai_local_worker_auth
  add column if not exists last_seen_at timestamptz;

create table if not exists public.ai_shop_chat_requests (
  id uuid primary key default gen_random_uuid(),
  client_token uuid not null default gen_random_uuid() unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_id uuid not null references public.customer_ai_profiles(id) on delete cascade,
  message text not null check (char_length(message) between 1 and 600),
  candidate_list jsonb not null default '[]'::jsonb
    check (jsonb_typeof(candidate_list) = 'array'),
  ai_response jsonb,
  ai_model text,
  ai_grounding_sources text[] not null default '{}',
  ai_validation_errors text[] not null default '{}',
  ai_fallback_used boolean not null default false,
  ai_latency_ms integer,
  processing_started_at timestamptz,
  status text not null default 'submitted'
    check (status in ('submitted','processing','completed','safe_fallback','ai_failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Upgrade an empty legacy queue safely. A populated queue without profile_id
-- needs an explicit owner/backfill decision; never guess from historical data.
alter table public.ai_shop_chat_requests
  add column if not exists profile_id uuid;

do $$
declare
  v_constraint record;
begin
  if exists (
    select 1 from public.ai_shop_chat_requests where profile_id is null
  ) then
    raise exception 'LOCAL_AI_BRIDGE_PROFILE_BACKFILL_REQUIRED';
  end if;

  for v_constraint in
    select constraint_row.conname
    from pg_constraint constraint_row
    join pg_attribute attribute_row
      on attribute_row.attrelid = constraint_row.conrelid
     and attribute_row.attnum = constraint_row.conkey[1]
    where constraint_row.contype = 'f'
      and constraint_row.conrelid = 'public.ai_shop_chat_requests'::regclass
      and array_length(constraint_row.conkey, 1) = 1
      and attribute_row.attname in ('user_id', 'profile_id')
  loop
    execute format(
      'alter table public.ai_shop_chat_requests drop constraint %I',
      v_constraint.conname
    );
  end loop;
end;
$$;

alter table public.ai_shop_chat_requests
  add constraint ai_shop_chat_requests_user_id_fkey
    foreign key (user_id) references auth.users(id) on delete cascade,
  add constraint ai_shop_chat_requests_profile_id_fkey
    foreign key (profile_id) references public.customer_ai_profiles(id) on delete cascade;
alter table public.ai_shop_chat_requests alter column user_id set not null;
alter table public.ai_shop_chat_requests alter column profile_id set not null;

create table if not exists public.ai_shop_chat_logs (
  id uuid primary key default gen_random_uuid(),
  request_id uuid references public.ai_shop_chat_requests(id) on delete cascade,
  model_name text,
  grounding_sources text[] not null default '{}',
  validation_passed boolean not null default false,
  validation_errors text[] not null default '{}',
  fallback_used boolean not null default false,
  latency_ms integer,
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_shop_chat_queue
  on public.ai_shop_chat_requests(status, created_at asc);
create index if not exists idx_ai_shop_chat_created
  on public.ai_shop_chat_requests(created_at desc);
create index if not exists idx_ai_shop_chat_user_created
  on public.ai_shop_chat_requests(user_id, created_at desc);
create index if not exists idx_ai_shop_chat_profile
  on public.ai_shop_chat_requests(profile_id);
create index if not exists idx_ai_shop_chat_logs_request
  on public.ai_shop_chat_logs(request_id, created_at desc);

create or replace function public.ai_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_ai_local_worker_auth_touch on public.ai_local_worker_auth;
create trigger trg_ai_local_worker_auth_touch
before update on public.ai_local_worker_auth
for each row execute function public.ai_touch_updated_at();

drop trigger if exists trg_ai_shop_chat_touch on public.ai_shop_chat_requests;
create trigger trg_ai_shop_chat_touch
before update on public.ai_shop_chat_requests
for each row execute function public.ai_touch_updated_at();

-- Keep the FK/cascade lock order identical to account deletion:
-- auth user -> customer profile -> request/conversation row.
create or replace function public.ai_lock_auth_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  perform 1
  from auth.users auth_user
  where auth_user.id = p_user_id
  for key share;
  if not found then
    raise exception 'AUTH_USER_NOT_FOUND' using errcode = '23503';
  end if;
end;
$$;

revoke all on function public.ai_lock_auth_user(uuid) from public, anon, authenticated;

-- Raw customer prompts are personalized data. Every enqueue uses the same
-- profile-row lock as consent withdrawal, and the server owns identity/time.
create or replace function public.ai_guard_shop_chat_request_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_profile_id uuid;
begin
  if v_actor is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  perform public.ai_lock_auth_user(v_actor);
  select profile.id into v_profile_id
  from public.customer_ai_profiles profile
  where profile.user_id = v_actor
    and profile.consent_personalization is true
  for update;
  if v_profile_id is null then
    raise exception 'AI_PERSONALIZATION_CONSENT_REQUIRED' using errcode = '42501';
  end if;

  new.user_id := v_actor;
  new.profile_id := v_profile_id;
  new.created_at := clock_timestamp();
  return new;
end;
$$;

revoke all on function public.ai_guard_shop_chat_request_insert() from public, anon, authenticated;
drop trigger if exists trg_ai_shop_chat_consent_insert on public.ai_shop_chat_requests;
create trigger trg_ai_shop_chat_consent_insert
before insert on public.ai_shop_chat_requests
for each row execute function public.ai_guard_shop_chat_request_insert();

create or replace function public.ai_guard_shop_chat_request_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.user_id is distinct from old.user_id
     or new.profile_id is distinct from old.profile_id
     or new.client_token is distinct from old.client_token
     or new.message is distinct from old.message
     or new.candidate_list is distinct from old.candidate_list then
    raise exception 'AI_SHOP_CHAT_IMMUTABLE_FIELDS' using errcode = '42501';
  end if;

  perform 1
  from public.customer_ai_profiles profile
  where profile.id = old.profile_id
    and profile.user_id = old.user_id
    and profile.consent_personalization is true;
  if not found then
    raise exception 'AI_PERSONALIZATION_CONSENT_REQUIRED' using errcode = '42501';
  end if;

  new.created_at := old.created_at;
  return new;
end;
$$;

revoke all on function public.ai_guard_shop_chat_request_update() from public, anon, authenticated;
drop trigger if exists trg_ai_shop_chat_consent_update on public.ai_shop_chat_requests;
create trigger trg_ai_shop_chat_consent_update
before update on public.ai_shop_chat_requests
for each row execute function public.ai_guard_shop_chat_request_update();

create or replace function public.ai_jsonb_is_string_array(payload jsonb)
returns boolean
language sql
immutable
parallel safe
as $$
  select case
    when payload is null or jsonb_typeof(payload) <> 'array' then false
    else not exists (
      select 1
      from jsonb_array_elements(payload) item
      where jsonb_typeof(item) <> 'string'
    )
  end;
$$;

create or replace function public.validate_shop_ai_response(payload jsonb)
returns boolean
language sql
immutable
parallel safe
as $$
  select coalesce((
    jsonb_typeof(payload) = 'object'
    and payload->>'schema_version' = '1'
    and payload->>'intent' in (
      'identity','customer_identity','recommendation','inventory_question',
      'price_question','sell_question','general','out_of_scope'
    )
    and jsonb_typeof(payload->'reply') = 'string'
    and public.ai_jsonb_is_string_array(payload->'recommended_listing_ids')
    and public.ai_jsonb_is_string_array(payload->'grounding_sources')
    and payload->'requires_human' = 'true'::jsonb
    and payload->'uses_only_candidates' = 'true'::jsonb
    and char_length(payload->>'reply') between 1 and 600
    and not (
      payload->>'reply'
      ~* '(₩[[:space:]]*[0-9]|KRW[[:space:]]*[0-9]|[0-9][0-9,. ]{1,14}[[:space:]]*(원|만원|억원))'
    )
    and not (
      payload->>'reply'
      ~ '(지난번|전에[[:space:]]*보셨|보고[[:space:]]*계셨|기억하고[[:space:]]*있|다시[[:space:]]*오셨)'
    )
    and not (
      payload->>'reply'
      ~ '(곧[[:space:]]*연결|추후[[:space:]]*연결|기능은[[:space:]]*준비[[:space:]]*중)'
    )
    and not (
      payload->>'reply'
      ~ '(정품|진품|가품)(으로)?[[:space:]]*(확실|보장|맞습니다|아닙니다|판단|확인)'
    )
    and not (
      payload->>'reply'
      ~ '(신분증|계좌번호|카드번호|주민등록번호|시리얼(번호)?).{0,12}(전체|전부|원본)(을|를)?[[:space:]]*(보내|올려|입력|제출)([[:space:]]*(주세요|하십시오|하세요|해요|해야|바랍니다)|야|(이[[:space:]]*)?필요)'
    )
  ), false);
$$;

alter table public.ai_shop_chat_requests
  drop constraint if exists ai_shop_response_guarded;
alter table public.ai_shop_chat_requests
  add constraint ai_shop_response_guarded
  check (ai_response is null or public.validate_shop_ai_response(ai_response)) not valid;

create or replace function public.verify_local_ai_worker(
  p_worker_name text,
  p_worker_secret text
)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.ai_local_worker_auth worker
    where worker.worker_name = p_worker_name
      and worker.is_active = true
      and worker.secret_hash = encode(
        extensions.digest(coalesce(p_worker_secret, ''), 'sha256'),
        'hex'
      )
  );
$$;

create or replace function public.submit_shop_ai_chat(p_payload jsonb)
returns table(request_id uuid, client_token uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_message text;
  v_candidates jsonb;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  if jsonb_typeof(p_payload) <> 'object' then
    raise exception 'invalid_payload';
  end if;

  v_message := nullif(left(trim(coalesce(p_payload->>'message', '')), 600), '');
  if v_message is null then
    raise exception 'invalid_message';
  end if;

  if (
    select count(*)
    from public.ai_shop_chat_requests
    where created_at > now() - interval '1 minute'
  ) >= 90 then
    raise exception 'queue_busy';
  end if;

  if jsonb_typeof(p_payload->'candidates') = 'array' then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', left(trim(item->>'id'), 80),
          'name', left(trim(item->>'name'), 180)
        )
      ),
      '[]'::jsonb
    )
    into v_candidates
    from (
      select item
      from jsonb_array_elements(p_payload->'candidates') item
      where jsonb_typeof(item) = 'object'
        and nullif(trim(item->>'id'), '') is not null
        and nullif(trim(item->>'name'), '') is not null
      limit 8
    ) candidate_rows;
  else
    v_candidates := '[]'::jsonb;
  end if;

  return query
  insert into public.ai_shop_chat_requests (
    user_id, message, candidate_list
  ) values (
    v_user_id, v_message, v_candidates
  )
  returning ai_shop_chat_requests.id, ai_shop_chat_requests.client_token;
end;
$$;

create or replace function public.get_shop_ai_chat_result(p_client_token uuid)
returns table(
  status text,
  reply text,
  recommended_listing_ids text[],
  requires_human boolean
)
language sql
security definer
stable
set search_path = ''
as $$
  select
    request.status,
    case
      when request.status in ('completed','safe_fallback')
      then request.ai_response->>'reply'
      else null
    end,
    case
      when request.status in ('completed','safe_fallback')
        and jsonb_typeof(request.ai_response->'recommended_listing_ids') = 'array'
      then array(
        select jsonb_array_elements_text(request.ai_response->'recommended_listing_ids')
      )
      else '{}'::text[]
    end,
    true
  from public.ai_shop_chat_requests request
  where request.client_token = p_client_token
    and request.user_id = auth.uid()
    and exists (
      select 1
      from public.customer_ai_profiles profile
      where profile.user_id = auth.uid()
        and profile.consent_personalization is true
    )
  limit 1;
$$;

create or replace function public.get_shop_ai_runtime_status()
returns table(online boolean)
language sql
security definer
stable
set search_path = ''
as $$
  select coalesce(bool_or(
    worker.is_active
    and worker.last_seen_at > now() - interval '45 seconds'
  ), false)
  from public.ai_local_worker_auth worker;
$$;

create or replace function public.log_shop_ai_turn(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_turn_id uuid := gen_random_uuid();
  v_user_id uuid := auth.uid();
  v_profile_id uuid;
  v_session_id uuid;
  v_user_message text;
  v_assistant_reply text;
  v_provider text;
  v_intent text;
  v_needs_review boolean;
  v_recommended jsonb := '[]'::jsonb;
  v_metadata jsonb;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  if jsonb_typeof(p_payload) <> 'object' then
    raise exception 'invalid_payload';
  end if;

  v_user_message := nullif(left(trim(coalesce(p_payload->>'user_message', '')), 600), '');
  v_assistant_reply := nullif(left(trim(coalesce(p_payload->>'assistant_reply', '')), 600), '');
  if v_user_message is null or v_assistant_reply is null then
    raise exception 'invalid_turn';
  end if;

  v_provider := coalesce(nullif(p_payload->>'provider', ''), 'rule_fallback');
  if v_provider not in (
    'local_ai', 'edge_ai', 'rule_fallback', 'market_price_lookup', 'preference_prompt'
  ) then
    v_provider := 'rule_fallback';
  end if;

  v_intent := coalesce(nullif(p_payload->>'intent', ''), 'general');
  if v_intent not in (
    'identity','customer_identity','recommendation','inventory_question',
    'price_question','sell_question','general','out_of_scope'
  ) then
    v_intent := 'general';
  end if;
  v_needs_review := coalesce(p_payload->'needs_review' = 'true'::jsonb, false);

  perform public.ai_lock_auth_user(v_user_id);
  select profile.id into v_profile_id
  from public.customer_ai_profiles profile
  where profile.user_id = v_user_id
    and profile.consent_personalization is true
  for update;
  if v_profile_id is null then
    raise exception 'AI_PERSONALIZATION_CONSENT_REQUIRED' using errcode = '42501';
  end if;
  begin
    v_session_id := nullif(p_payload->>'session_id', '')::uuid;
  exception when invalid_text_representation then
    v_session_id := null;
  end;

  if (
    select count(*)
    from public.ai_conversations conversation
    where conversation.channel = 'web-ai-audit'
      and conversation.role = 'user'
      and conversation.created_at > now() - interval '1 minute'
  ) >= 180 then
    raise exception 'log_rate_limited';
  end if;

  if public.ai_jsonb_is_string_array(p_payload->'recommended_listing_ids') then
    select coalesce(jsonb_agg(item.id), '[]'::jsonb)
    into v_recommended
    from (
      select left(value, 80) as id
      from jsonb_array_elements_text(p_payload->'recommended_listing_ids') value
      where nullif(trim(value), '') is not null
      limit 8
    ) item;
  end if;

  v_metadata := jsonb_build_object(
    'turn_id', v_turn_id,
    'provider', v_provider,
    'intent', v_intent,
    'needs_review', v_needs_review,
    'recommended_listing_ids', v_recommended
  );

  insert into public.ai_conversations (
    user_id, profile_id, session_id, channel, role, message, metadata
  ) values
    (
      v_user_id, v_profile_id, v_session_id, 'web-ai-audit', 'user',
      v_user_message, v_metadata
    ),
    (
      v_user_id, v_profile_id, v_session_id, 'web-ai-audit', 'assistant',
      v_assistant_reply, v_metadata
    );

  return v_turn_id;
end;
$$;

create or replace function public.claim_shop_ai_chat(
  p_worker_name text,
  p_worker_secret text
)
returns table(
  request_id uuid,
  message text,
  candidate_list jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request_id uuid;
  v_profile_id uuid;
begin
  if not public.verify_local_ai_worker(p_worker_name, p_worker_secret) then
    raise exception 'worker_unauthorized';
  end if;

  -- Defense in depth for a withdrawal that removed consent while this worker
  -- was offline. Completed history may remain when the customer chose keep.
  delete from public.ai_shop_chat_requests queued
  where queued.status in ('submitted', 'processing')
    and not exists (
      select 1
      from public.customer_ai_profiles profile
      where profile.id = queued.profile_id
        and profile.user_id = queued.user_id
        and profile.consent_personalization is true
    );

  -- Choose without locking, then lock profile → request in the same order as
  -- withdrawal. Recheck both predicates after each lock.
  select queued.id, queued.profile_id
  into v_request_id, v_profile_id
  from public.ai_shop_chat_requests queued
  join public.customer_ai_profiles profile
    on profile.id = queued.profile_id
   and profile.user_id = queued.user_id
   and profile.consent_personalization is true
  where queued.status = 'submitted'
     or (
       queued.status = 'processing'
       and queued.processing_started_at < now() - interval '15 minutes'
     )
  order by queued.created_at asc
  limit 1;
  if v_request_id is null then
    update public.ai_local_worker_auth
    set last_seen_at = now()
    where worker_name = p_worker_name;
    return;
  end if;

  perform 1
  from public.customer_ai_profiles profile
  where profile.id = v_profile_id
    and profile.consent_personalization is true
  for update;
  if not found then
    update public.ai_local_worker_auth
    set last_seen_at = now()
    where worker_name = p_worker_name;
    return;
  end if;

  return query
  update public.ai_shop_chat_requests request
  set status = 'processing', processing_started_at = now()
  where request.id = v_request_id
    and request.profile_id = v_profile_id
    and (
      request.status = 'submitted'
      or (
        request.status = 'processing'
        and request.processing_started_at < now() - interval '15 minutes'
      )
    )
  returning request.id, request.message, request.candidate_list;

  update public.ai_local_worker_auth
  set last_seen_at = now()
  where worker_name = p_worker_name;
end;
$$;

create or replace function public.get_shop_ai_knowledge(
  p_worker_name text,
  p_worker_secret text
)
returns table(
  knowledge_key text,
  title text,
  content text
)
language plpgsql
security definer
stable
set search_path = ''
as $$
begin
  if not public.verify_local_ai_worker(p_worker_name, p_worker_secret) then
    raise exception 'worker_unauthorized';
  end if;

  return query
  select
    'guideline:' || guideline.id::text,
    guideline.title,
    left(guideline.content, 3000)
  from public.ai_response_guidelines guideline
  where guideline.is_active = true

  union all

  select
    'knowledge:' || note.id::text,
    note.title,
    left(note.content, 3000)
  from public.expert_knowledge_notes note
  where note.status in ('approved','reviewed')
  order by 1
  limit 50;
end;
$$;

create or replace function public.complete_shop_ai_chat(
  p_worker_name text,
  p_worker_secret text,
  p_request_id uuid,
  p_response jsonb,
  p_model_name text,
  p_grounding_sources text[],
  p_validation_errors text[],
  p_fallback_used boolean,
  p_latency_ms integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
begin
  if not public.verify_local_ai_worker(p_worker_name, p_worker_secret) then
    raise exception 'worker_unauthorized';
  end if;

  select request.profile_id into v_profile_id
  from public.ai_shop_chat_requests request
  where request.id = p_request_id
    and request.status = 'processing';
  if v_profile_id is null then
    return false;
  end if;

  -- Lock profile first, then request: the same order used by withdrawal.
  perform 1
  from public.customer_ai_profiles profile
  where profile.id = v_profile_id
    and profile.consent_personalization is true
  for update;
  if not found then
    return false;
  end if;

  perform 1
  from public.ai_shop_chat_requests request
  where request.id = p_request_id
    and request.profile_id = v_profile_id
    and request.status = 'processing'
  for update;
  if not found then
    return false;
  end if;

  if not public.validate_shop_ai_response(p_response) then
    raise exception 'invalid_ai_response';
  end if;

  if exists (
    select 1
    from jsonb_array_elements_text(p_response->'recommended_listing_ids') recommended(id)
    where not exists (
      select 1
      from public.ai_shop_chat_requests request,
           jsonb_array_elements(request.candidate_list) candidate
      where request.id = p_request_id
        and candidate->>'id' = recommended.id
    )
  ) then
    raise exception 'ungrounded_listing_id';
  end if;

  update public.ai_shop_chat_requests
  set
    ai_response = p_response,
    ai_model = left(p_model_name, 120),
    ai_grounding_sources = coalesce(p_grounding_sources, '{}'),
    ai_validation_errors = coalesce(p_validation_errors, '{}'),
    ai_fallback_used = coalesce(p_fallback_used, false),
    ai_latency_ms = p_latency_ms,
    processing_started_at = null,
    status = case when coalesce(p_fallback_used, false) then 'safe_fallback' else 'completed' end
  where id = p_request_id
    and status = 'processing';

  if not found then
    return false;
  end if;

  update public.ai_local_worker_auth
  set last_seen_at = now()
  where worker_name = p_worker_name;

  insert into public.ai_shop_chat_logs (
    request_id, model_name, grounding_sources, validation_passed,
    validation_errors, fallback_used, latency_ms
  ) values (
    p_request_id, left(p_model_name, 120), coalesce(p_grounding_sources, '{}'),
    cardinality(coalesce(p_validation_errors, '{}')) = 0,
    coalesce(p_validation_errors, '{}'), coalesce(p_fallback_used, false), p_latency_ms
  );

  return true;
end;
$$;

alter table public.ai_local_worker_auth enable row level security;
alter table public.ai_shop_chat_requests enable row level security;
alter table public.ai_shop_chat_logs enable row level security;

revoke all on public.ai_local_worker_auth from public, anon, authenticated;
revoke all on public.ai_shop_chat_requests from public, anon, authenticated;
revoke all on public.ai_shop_chat_logs from public, anon, authenticated;

revoke all on function public.verify_local_ai_worker(text, text) from public, anon, authenticated;
revoke all on function public.submit_shop_ai_chat(jsonb) from public, anon, authenticated;
revoke all on function public.get_shop_ai_chat_result(uuid) from public, anon, authenticated;
revoke all on function public.get_shop_ai_runtime_status() from public, anon, authenticated;
revoke all on function public.log_shop_ai_turn(jsonb) from public, anon, authenticated;
revoke all on function public.claim_shop_ai_chat(text, text) from public, anon, authenticated;
revoke all on function public.get_shop_ai_knowledge(text, text) from public, anon, authenticated;
revoke all on function public.complete_shop_ai_chat(
  text, text, uuid, jsonb, text, text[], text[], boolean, integer
) from public, anon, authenticated;

grant execute on function public.submit_shop_ai_chat(jsonb) to authenticated;
grant execute on function public.get_shop_ai_chat_result(uuid) to authenticated;
grant execute on function public.get_shop_ai_runtime_status() to anon, authenticated;
grant execute on function public.log_shop_ai_turn(jsonb) to authenticated;
grant execute on function public.claim_shop_ai_chat(text, text) to anon, authenticated;
grant execute on function public.get_shop_ai_knowledge(text, text) to anon, authenticated;
grant execute on function public.complete_shop_ai_chat(
  text, text, uuid, jsonb, text, text[], text[], boolean, integer
) to anon, authenticated;

-- A custom/default grantee is not silently inherited. Roll the installation
-- back so the operator can review that role before this queue becomes active.
do $acl_invariant$
begin
  if exists (
    select 1
    from pg_class relation
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    cross join lateral aclexplode(
      coalesce(relation.relacl, acldefault('r', relation.relowner))
    ) acl
    left join pg_roles role_row on role_row.oid = acl.grantee
    where namespace.nspname = 'public'
      and relation.relname in (
        'ai_local_worker_auth', 'ai_shop_chat_requests', 'ai_shop_chat_logs'
      )
      and acl.grantee <> relation.relowner
      and (
        acl.grantee = 0
        or coalesce(role_row.rolname, '') not in (
          current_user, 'postgres', 'supabase_admin',
          'anon', 'authenticated', 'service_role'
        )
      )
  ) then
    raise exception 'LOCAL_AI_BRIDGE_UNKNOWN_TABLE_ACL_REVIEW_REQUIRED';
  end if;
  if exists (
    select 1
    from pg_proc procedure
    join pg_namespace namespace on namespace.oid = procedure.pronamespace
    cross join lateral aclexplode(
      coalesce(procedure.proacl, acldefault('f', procedure.proowner))
    ) acl
    left join pg_roles role_row on role_row.oid = acl.grantee
    where namespace.nspname = 'public'
      and procedure.proname in (
        'verify_local_ai_worker', 'submit_shop_ai_chat',
        'get_shop_ai_chat_result', 'get_shop_ai_runtime_status',
        'log_shop_ai_turn', 'claim_shop_ai_chat',
        'get_shop_ai_knowledge', 'complete_shop_ai_chat'
      )
      and acl.grantee <> procedure.proowner
      and (
        acl.grantee = 0
        or coalesce(role_row.rolname, '') not in (
          current_user, 'postgres', 'supabase_admin',
          'anon', 'authenticated', 'service_role'
        )
      )
  ) then
    raise exception 'LOCAL_AI_BRIDGE_UNKNOWN_FUNCTION_ACL_REVIEW_REQUIRED';
  end if;
end
$acl_invariant$;

-- No default worker credential is inserted here. Generate a strong random
-- secret out of band, store only its SHA-256 hash in ai_local_worker_auth, and
-- keep the original only in the office worker's ignored .env.local. Provision
-- and rotate it as a separate audited operation; rerunning this schema file
-- must never reactivate or overwrite an operator-managed credential.

comment on table public.ai_shop_chat_requests is
  '벨로르 쇼핑 비서 공개 요청과 사무실 로컬 AI 처리 큐';
comment on table public.ai_shop_chat_logs is
  '추론 과정 없이 저장하는 벨로르 쇼핑 로컬 AI 검증 로그';

commit;
