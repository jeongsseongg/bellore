# BELLORE 프로젝트 인덱스

> 세션 시작 시 이 파일만 읽는다. 본문은 여기 적힌 위치에서 해당 섹션만 찾아 읽는다. 전체를 통독하지 않는다.

## 공개 기준

- 현재 확인된 공개 코드 기준: `2faf8f688be07c7bc078c379c779cb2bfe5ef0ff`
- 최소 공개 기준 원장: `.brain/LATEST_PUBLIC_BASE.json`
- 최신 값은 기억하지 말고 작업 직전에 Git과 운영 응답에서 다시 읽는다.

## 미해결

- 문자 OTP 공급자: 운영 자격이 없어 비활성. 본문: `.brain/incidents/2026-08-28-auth-and-page-integration-regressions.md`
- KG 통합인증: 서버·프런트 수정은 배포됐으나 실제 사람 종단 확인이 남음. 같은 본문.
- 네이버페이 주문형: 공급자 응답 `ERR-OR-000001`; 가맹점 주문형 활성 확인 필요. 같은 본문.
- 결제 v2: 운영 migration·Edge·Pages가 같은 SHA로 적용되기 전까지 완료 아님. `docs/PAYMENTS_SETUP.md`

## 진행 중

- 완성본 통합: `release/regression-integrated-site-20260828`
- 범위: 마이페이지 루트 재통합, KG 직접 결제 UI, checkout v2, 관리자 블록 편집, Telegram v6, 판매 흐름·주소검색.

## 최근 사고

- 인증 두 경로 혼합 및 완료 복귀 유실 — 2026-08-28 — `.brain/incidents/2026-08-28-auth-and-page-integration-regressions.md`
- 마이페이지 독립 분리로 루트 계약·지원 화면 단절 — 2026-08-27 — 같은 본문
- Pages 성공 표시와 실제 게시 단계 불일치 — 2026-08-27 — 같은 본문
