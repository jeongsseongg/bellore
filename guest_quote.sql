-- ============================================================
-- 벨로르(BELLORE) · 비회원(게스트) 비교견적 접수 허용
-- 증상: 비회원으로 '내시계팔기(비교견적)'를 신청하면 메일만 오고
--       관리자 페이지(승인 대기)에 시계가 나타나지 않음.
-- 원인: 비로그인(anon)은 quote_requests insert / 사진 업로드 권한이 없어
--       클라이언트가 메일 접수로만 폴백했기 때문.
-- Supabase 대시보드 > SQL Editor 에 "통째로" 붙여넣고 RUN (1회, 재실행 안전)
-- ============================================================
--
-- 동작 원리 / 보안 메모 (guest_checkout.sql 과 동일한 방식)
--   - 비회원 견적은 customer_id 가 NULL, 상태는 'pending'(승인 대기)으로만 생성 가능.
--   - 비회원은 견적을 조회(select)·수정(update)·삭제(delete)할 수 없다
--     (연락처 등 개인정보 보호 — 조회는 관리자/업체 정책 그대로).
--   - 사진 업로드는 photos 버킷의 'anon/' 폴더에만 허용(회원 폴더 침범 불가).
--   - 승인/거부는 기존과 동일하게 관리자만 가능(기존 정책 유지).

-- 1) customer_id 를 NULL 허용으로 (비회원 = 회원 미연결)
alter table public.quote_requests alter column customer_id drop not null;

-- 2) 비회원(anon)의 견적 생성: customer_id 비어있고 승인 대기(pending)인 행만 허용
drop policy if exists quotes_insert_guest on public.quote_requests;
create policy quotes_insert_guest on public.quote_requests
  for insert
  to anon
  with check (customer_id is null and status = 'pending');

-- 3) 비회원 사진 업로드: photos 버킷의 anon/ 폴더에만 업로드 허용
--    (읽기는 기존 photos_public_read 정책으로 공개 URL 그대로 동작)
drop policy if exists "photos_anon_insert" on storage.objects;
create policy "photos_anon_insert"
  on storage.objects for insert
  to anon
  with check (bucket_id = 'photos' and name like 'anon/%');

-- 참고: 회원 신청 정책 · 관리자 승인/조회 정책은 기존 그대로 유지된다(추가 정책임).
--       quote_compare.sql 의 관리자 알림 트리거(notify_admin_quote)는
--       비회원 insert 에도 그대로 동작해 관리자에게 '승인 대기' 알림이 남는다.
