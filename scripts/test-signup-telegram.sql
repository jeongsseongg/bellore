-- All synthetic identities, coupons and outbox entries are rolled back.
begin;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
do $$
declare uid uuid := gen_random_uuid(); before_count bigint; result jsonb; n bigint;
begin
  select count(*) into before_count from public.telegram_ops_outbox where target='signup_room';
  assert not has_table_privilege('anon','public.member_signup_notice_state','SELECT'), 'anon state access';
  assert not has_table_privilege('authenticated','public.member_signup_notice_state','SELECT'), 'member state access';
  assert not has_function_privilege('anon','public.record_signup_notice_context(jsonb)','EXECUTE'), 'anon RPC';
  insert into auth.users(id,instance_id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
    values(uid,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
      'signup-test-'||uid||'@example.invalid','{"provider":"kakao"}',
      '{"display_name":"가입 알림 테스트","role":"customer"}',now(),now());
  assert exists(select 1 from public.member_signup_notice_state where user_id=uid and eligible), 'missing new state';
  assert not exists(select 1 from public.telegram_ops_outbox where dedupe_key='member-signup:'||uid), 'premature signup';
  update public.profiles set phone='01000000000',phone_verified=true,
    verified_name='가입 알림 테스트',birth_date='1990-01-01' where id=uid;
  assert not exists(select 1 from public.telegram_ops_outbox where dedupe_key='member-signup:'||uid), 'missing address accepted';
  perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',uid)::text,true);
  result := public.record_signup_notice_context('{"analytics":"denied","ads":"denied","first":{"utm_source":"must-not-store"}}');
  assert result->>'accepted'='true','context not accepted';
  assert (select context from public.member_signup_notice_state where user_id=uid) = '{"analytics":"denied","ads":"denied"}'::jsonb, 'denied attribution stored';
  update public.profiles set postcode='00000',addr1='테스트 전용 주소' where id=uid;
  select count(*) into n from public.telegram_ops_outbox where dedupe_key='member-signup:'||uid;
  assert n=1,'signup enqueue count';
  assert (select payload->'context'->>'analytics' from public.telegram_ops_outbox where dedupe_key='member-signup:'||uid)='denied','lost consent';
  update public.profiles set addr2='프로필 수정 시험' where id=uid;
  assert (select count(*) from public.telegram_ops_outbox where dedupe_key='member-signup:'||uid)=1,'duplicate signup';
  result := public.record_signup_notice_context('{"analytics":"granted","ads":"denied","first":{"utm_source":"naver","gclid":"discard","url":"https://discard"}}');
  assert (select payload->'context'->'first' from public.telegram_ops_outbox where dedupe_key='member-signup:'||uid)='{"utm_source":"naver"}'::jsonb,'context whitelist';
  result := public.record_signup_notice_context('{"analytics":"denied","ads":"denied"}');
  assert not (select (payload->'context') ? 'first' from public.telegram_ops_outbox where dedupe_key='member-signup:'||uid),'withdrawal failed';
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  update public.member_signup_notice_state set eligible=false where user_id=uid;
  perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',uid)::text,true);
  result := public.record_signup_notice_context('{"analytics":"granted"}');
  assert result->>'reason'='existing_member','existing member was accepted';
end $$;
rollback;
select 'PASS: signup lifecycle assertions; synthetic rows rolled back' as result;
