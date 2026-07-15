-- ============================================================
-- 벨로르(BELLORE) · 디스코드 비교견적 v3 — GitHub 봇(Actions) 지원
-- 실행: GitHub Actions 'DB Maintenance' 워크플로가 자동 실행
--       (Supabase SQL Editor 에 붙여넣어 실행해도 동일 — 재실행 안전)
--
-- 내용:
--   1) 디스코드 봇이 photos 버킷의 discord/ 폴더에만 사진을 올릴 수 있게
--      anon 업로드 정책 추가 (그 외 경로는 기존대로 로그인 필요)
--   2) 디스코드 메시지 중복 수집 방지용 인덱스 (metadata.raw.id 기준)
-- ============================================================

-- 1) 봇 사진 업로드 허용 (photos/discord/* 한정)
drop policy if exists "photos_discord_bot_insert" on storage.objects;
create policy "photos_discord_bot_insert"
  on storage.objects for insert
  to anon
  with check (bucket_id = 'photos' and name like 'discord/%');

-- 2) 디스코드 메시지 ID 중복 방지 인덱스
create index if not exists idx_team_messages_discord_id
  on public.team_messages ((metadata->'raw'->>'id'))
  where platform = 'discord';
