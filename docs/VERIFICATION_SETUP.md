# 회원 인증 4종 운영 설정

## 현재 구현 경계

| 인증 | 정본 | 서버 확정 함수 | 현재 활성화 조건 |
|---|---|---|---|
| 휴대폰 | KG이니시스 통합인증(포트원 V2 채널) | `verify-identity` | 포트원 본인인증 채널·시크릿·운영 조회 검증 |
| 이메일 | Supabase Auth 이메일 OTP | `sync-email-verification` | 이메일 템플릿에 `{{ .Token }}` 적용 후 송수신 검증 |
| 사업자 | 국세청 사업자등록정보 진위확인 API | `verify-business` | 공공데이터포털 서비스키·Edge 배포 검증 |
| 계좌 | 금융결제원 오픈뱅킹 계좌실명조회 | `verify-account` | 테스트/운영 키·실명번호 구분코드·실계좌 종단검증 후 활성화 |

브라우저 성공 응답은 인증 완료의 근거가 아니다. 모든 인증 플래그는 서버가 공급자 결과를 재조회하거나 Supabase Auth의 확인 시각을 확인한 후 DB 트랜잭션으로 기록한다.

## DB 정본

- 휴대폰: `phone_verified`, `phone_verified_at`, `phone_verification_provider`
- 이메일: `email_verified`, `email_verified_at`, `email_verification_provider`
- 사업자: `biz_verified`, `biz_verified_at`, `biz_verification_provider`
- 계좌: `account_verified`, `account_verified_at`, `account_verification_provider`
- 감사기록: `member_verification_events`

사용자가 휴대폰·사업자·계좌 원본 정보를 바꾸면 해당 인증은 자동 해제된다. 브라우저와 관리자 클라이언트는 플래그를 직접 바꿀 수 없으며, 서버 RPC만 인증 상태와 감사기록을 한 트랜잭션으로 변경한다.

## 필요한 Edge Function 시크릿

공통 자동 주입값 외에 다음 값이 필요하다. 원문 시크릿은 저장소나 이 문서에 기록하지 않는다.

- 휴대폰: `PORTONE_API_SECRET`, `PORTONE_STORE_ID`, `PORTONE_IDENTITY_CHANNEL_KEY`
- 선택: `PORTONE_API_BASE`(기본 `https://api.portone.io`), `ALLOW_TEST_IDENTITY=true`(로컬 시험 전용)
- 사업자: `NTS_SERVICE_KEY`
- 계좌: `KFTC_OPENBANKING_ENV`(`test` 또는 `production`), `KFTC_CLIENT_ID`, `KFTC_CLIENT_SECRET`, `KFTC_ACCOUNT_HOLDER_INFO_TYPE`
- 계좌 인증은 국세청 사업자 인증이 완료된 계정의 사업자등록번호만 서버에서 읽어 사용한다. Client Secret·Access Token·사업자번호·계좌번호 원문은 감사기록에 저장하지 않는다.

## 배포 전 순서

1. `20260826172707_harden_member_verifications.sql`을 스테이징 DB에 적용한다.
2. `verify-identity`, `sync-email-verification`, `complete-otp-signup`, `verify-business`, `verify-account`, `admin-manage-verification`을 JWT 검증 활성 상태로 배포한다.
3. 이메일 OTP → 회원 프로필 완성 → 휴대폰/사업자 인증 순으로 실제 테스트 계정을 검증한다.
4. 동일 휴대폰 인증 ID 재사용, 공급자/상점/채널 불일치, 사업자 불일치, 관리자 정지·승인취소를 각각 거부하는지 확인한다.
5. 감사기록에 원문 전화번호·이메일·사업자번호·계좌번호가 저장되지 않는지 조회한다.
6. 해당 항목의 전체 운영 검증이 끝난 뒤에만 `BELLORE_VERIFY.<항목>.enabled`를 `true`로 바꾼다.

## 관리자 API

`admin-manage-verification`은 로그인 사용자를 서버에서 다시 조회하고 `role=admin`, `approved=true`, `suspended!=true`를 모두 만족할 때만 처리한다.

- 상태: `{ "action":"get_status", "targetUserId":"uuid" }`
- 감사: `{ "action":"list_events", "targetUserId":"uuid", "limit":50 }`
- 수동 처리: `{ "action":"set_status", "targetUserId":"uuid", "method":"phone|email|business|account", "verified":true, "reason":"5자 이상 사유" }`

계좌 실명조회는 금융결제원의 Client Credentials(`scope=oob`)와 계좌실명조회 API를 사용한다. 테스트 키는 `test` 환경에서만 사용하며, 운영 이용승인과 운영 키 발급 전에는 공개 설정의 `account.enabled`를 켜지 않는다.
