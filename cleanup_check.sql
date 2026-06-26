-- ============================================================
-- 벨로르(BELLORE) · 중복 점검 + 불필요 데이터 정리
-- Supabase 대시보드 > SQL Editor
--
-- 사용 순서:
--   1) [A] 점검 SQL 을 먼저 RUN → 결과(중복 건수) 확인.
--   2) 지울 게 있으면 [B] 정리 SQL 을 RUN.
--   ※ [A] 는 읽기만 함(안전). [B] 는 실제 삭제(되돌릴 수 없음).
--      profiles(회원 계정) 는 자동 삭제하지 않음 — 점검만 하고 사람이 판단.
-- ============================================================


-- ============================================================
-- [A] 중복 점검 (읽기 전용 — 데이터 변경 없음)
--     각 블록을 따로 실행해도 되고, 전체를 한 번에 실행해도 됩니다.
-- ============================================================

-- A-1) 아이디(username) 중복 — 같은 아이디로 2개 이상 계정
select lower(username) as username, count(*) as cnt
  from public.profiles
 where username is not null and trim(username) <> ''
 group by lower(username)
having count(*) > 1
 order by cnt desc;

-- A-2) 이메일 중복
select lower(email) as email, count(*) as cnt
  from public.profiles
 where email is not null and trim(email) <> ''
 group by lower(email)
having count(*) > 1
 order by cnt desc;

-- A-3) 휴대폰번호 중복(숫자만 비교)
select regexp_replace(phone, '[^0-9]', '', 'g') as phone_digits, count(*) as cnt
  from public.profiles
 where phone is not null and trim(phone) <> ''
 group by regexp_replace(phone, '[^0-9]', '', 'g')
having count(*) > 1
 order by cnt desc;

-- A-4) 알림 중복 — 같은 사람에게 같은 내용 알림이 여러 번
select user_id, type, title, coalesce(body,'') as body, coalesce(ref_id,'') as ref_id,
       count(*) as cnt
  from public.notifications
 group by user_id, type, title, coalesce(body,''), coalesce(ref_id,'')
having count(*) > 1
 order by cnt desc;

-- A-5) 무슨 알림인지 알 수 없는 옛날 알림(정체불명) 건수
select count(*) as unknown_old_notifications
  from public.notifications n
 where coalesce(n.type,'') not in
   ('quote_open','quote_new','bid_new','awarded','approved',
    'account','business','listing','settlement','support_new','support_reply','info')
   and (n.body is null or char_length(trim(n.body)) < 8);

-- A-6) 발급 쿠폰(user_coupons) 중복 — 같은 사람에게 같은 쿠폰이 중복 발급(미사용분)
select user_id, coupon_id, count(*) as cnt
  from public.user_coupons
 where status = 'active'
 group by user_id, coupon_id
having count(*) > 1
 order by cnt desc;


-- ============================================================
-- [B] 정리(삭제) — 필요할 때만 RUN. 되돌릴 수 없습니다.
-- ============================================================

-- B-1) 정체불명 옛날 알림 삭제(제목/이동 정보 없는 것)
delete from public.notifications n
 where coalesce(n.type,'') not in
   ('quote_open','quote_new','bid_new','awarded','approved',
    'account','business','listing','settlement','support_new','support_reply','info')
   and (n.body is null or char_length(trim(n.body)) < 8);

-- B-2) 중복 알림 정리 — 같은 내용은 "가장 최근 1건"만 남기고 삭제
delete from public.notifications a
 using public.notifications b
 where a.user_id = b.user_id
   and a.type    = b.type
   and a.title   = b.title
   and coalesce(a.body,'')   = coalesce(b.body,'')
   and coalesce(a.ref_id,'') = coalesce(b.ref_id,'')
   and a.id < b.id;   -- 더 오래된(작은 id) 쪽 삭제

-- B-3) 중복 발급 쿠폰 정리 — 같은 사람·같은 쿠폰의 미사용분은 1장만 남김
delete from public.user_coupons a
 using public.user_coupons b
 where a.user_id   = b.user_id
   and a.coupon_id = b.coupon_id
   and a.status    = 'active'
   and b.status    = 'active'
   and a.created_at < b.created_at;

-- B-4) (선택) 오래된 접속/조회 로그 정리 — 90일 지난 분석 로그 삭제
--      통계 누적이 부담될 때만. 주석 풀고 실행.
-- delete from public.page_views    where created_at < now() - interval '90 days';
-- delete from public.product_views where created_at < now() - interval '90 days';
-- delete from public.search_logs   where created_at < now() - interval '90 days';
