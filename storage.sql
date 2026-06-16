-- ============================================================
-- 벨로르(BELLORE) · 이미지 스토리지(photos 버킷) 설정
-- Supabase SQL Editor 에서 1회 실행하세요.
-- 증상: "이미지를 업로드해도 안 나온다" → 대부분 아래 둘 중 하나가 원인입니다.
--   (1) 'photos' 버킷이 public 이 아니라 공개 URL 이 안 열림(403)
--   (2) 업로드 정책(RLS)이 없어 업로드 자체가 막힘
-- 이 스크립트가 둘 다 해결합니다. (여러 번 실행해도 안전)
-- ============================================================

-- 1) 'photos' 버킷을 public 으로 생성(이미 있으면 public 으로 전환)
insert into storage.buckets (id, name, public)
values ('photos', 'photos', true)
on conflict (id) do update set public = true;

-- 2) 누구나 읽기(공개 URL 로 이미지가 보이도록)
drop policy if exists "photos_public_read" on storage.objects;
create policy "photos_public_read"
  on storage.objects for select
  using (bucket_id = 'photos');

-- 3) 로그인한 사용자는 업로드 가능
drop policy if exists "photos_auth_insert" on storage.objects;
create policy "photos_auth_insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'photos');

-- 4) 로그인한 사용자는 수정/덮어쓰기 가능
drop policy if exists "photos_auth_update" on storage.objects;
create policy "photos_auth_update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'photos')
  with check (bucket_id = 'photos');

-- 5) 로그인한 사용자는 삭제 가능
drop policy if exists "photos_auth_delete" on storage.objects;
create policy "photos_auth_delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'photos');
