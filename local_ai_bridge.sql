-- BELLORE SHOP LOCAL AI BRIDGE v1
-- Supabase SQL Editor에서 파일 전체를 한 번 실행하세요.
-- 공개 웹 → 안전한 요청 큐 → 사무실 로컬 AI → 검증된 답변 조회

begin;

create extension if not exists pgcrypto;

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
  user_id uuid references auth.users(id) on delete set null,
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
create index if not exists idx_ai_shop_chat_logs_request
  on public.ai_shop_chat_logs(request_id, created_at desc);

create or replace function public.ai_touch_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
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
set search_path = public, pg_temp
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
set search_path = public, pg_temp
as $$
declare
  v_message text;
  v_candidates jsonb;
begin
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
    auth.uid(), v_message, v_candidates
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
set search_path = public, pg_temp
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
  limit 1;
$$;

create or replace function public.get_shop_ai_runtime_status()
returns table(online boolean)
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select coalesce(bool_or(
    worker.is_active
    and worker.last_seen_at > now() - interval '45 seconds'
  ), false)
  from public.ai_local_worker_auth worker;
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
set search_path = public, pg_temp
as $$
begin
  if not public.verify_local_ai_worker(p_worker_name, p_worker_secret) then
    raise exception 'worker_unauthorized';
  end if;

  update public.ai_local_worker_auth
  set last_seen_at = now()
  where worker_name = p_worker_name;

  update public.ai_shop_chat_requests
  set status = 'submitted', processing_started_at = null
  where status = 'processing'
    and processing_started_at < now() - interval '15 minutes';

  return query
  with next_request as (
    select queued.id
    from public.ai_shop_chat_requests queued
    where queued.status = 'submitted'
    order by queued.created_at asc
    for update skip locked
    limit 1
  )
  update public.ai_shop_chat_requests request
  set status = 'processing', processing_started_at = now()
  from next_request
  where request.id = next_request.id
  returning request.id, request.message, request.candidate_list;
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
set search_path = public, pg_temp
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
set search_path = public, pg_temp
as $$
begin
  if not public.verify_local_ai_worker(p_worker_name, p_worker_secret) then
    raise exception 'worker_unauthorized';
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

revoke all on public.ai_local_worker_auth from anon, authenticated;
revoke all on public.ai_shop_chat_requests from anon, authenticated;
revoke all on public.ai_shop_chat_logs from anon, authenticated;

revoke all on function public.verify_local_ai_worker(text, text) from public;
revoke all on function public.submit_shop_ai_chat(jsonb) from public;
revoke all on function public.get_shop_ai_chat_result(uuid) from public;
revoke all on function public.get_shop_ai_runtime_status() from public;
revoke all on function public.claim_shop_ai_chat(text, text) from public;
revoke all on function public.get_shop_ai_knowledge(text, text) from public;
revoke all on function public.complete_shop_ai_chat(
  text, text, uuid, jsonb, text, text[], text[], boolean, integer
) from public;

grant execute on function public.submit_shop_ai_chat(jsonb) to anon, authenticated;
grant execute on function public.get_shop_ai_chat_result(uuid) to anon, authenticated;
grant execute on function public.get_shop_ai_runtime_status() to anon, authenticated;
grant execute on function public.claim_shop_ai_chat(text, text) to anon, authenticated;
grant execute on function public.get_shop_ai_knowledge(text, text) to anon, authenticated;
grant execute on function public.complete_shop_ai_chat(
  text, text, uuid, jsonb, text, text[], text[], boolean, integer
) to anon, authenticated;

insert into public.ai_local_worker_auth(worker_name, secret_hash, is_active)
values ('bellore-shop-office', 'f0006c94c6bb5feac3106b80e814e53ab918e28715b5e7e7ec9d44d5300d0210', true)
on conflict (worker_name) do update set
  secret_hash = excluded.secret_hash,
  is_active = true,
  updated_at = now();

comment on table public.ai_shop_chat_requests is
  '벨로르 쇼핑 비서 공개 요청과 사무실 로컬 AI 처리 큐';
comment on table public.ai_shop_chat_logs is
  '추론 과정 없이 저장하는 벨로르 쇼핑 로컬 AI 검증 로그';

commit;
