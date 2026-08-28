# 텔레그램 주문·견적 운영 설정

이 문서는 로컬 후보 구현을 실제 Supabase 프로젝트에 연결할 때 사용하는 체크리스트다.
토큰, 서비스 역할 키, 고객 전화번호는 Git과 채팅에 붙여넣지 않는다.

## 동작 범위

- 주문관리방: 결제 완료(`paid`) 알림 → 4자리 키 입력 → 확인 버튼 → `inspecting`
- 견적관리방: 견적 양식 알림 → `4821 500` 입력 → 확인 버튼 → 500만원 제안 누적
- 견적·주문 알림: 공개 사진과 저장된 상세 항목을 함께 전송하고 사진 실패 시 텍스트로 폴백
- 업체 앱 제안: 모든 제안은 이력에 남기고 직전 최고가를 넘긴 제안만 견적관리방에 알림
- 72시간 종료: 고객 앱 알림, 고객 알림톡, 관리자 최종보고, 종료 스냅샷 저장
- 텔레그램은 결제 완료 상태를 만들 수 없다. 결제 승인은 기존 PortOne 서버 검증만 담당한다.

## 적용 순서

1. 운영 DB 백업과 복원 방법을 검증한다.
2. 새 staging DB에만 `telegram_operations.sql`을 먼저 실행한다.
3. 아래 운영 원장 버전 migration을 파일명 순서대로 적용한다.
   - `20260826053138_telegram_ops_media_payload.sql`
   - `20260826053958_telegram_ops_complete_payload.sql`
   - `20260826055215_telegram_vendor_highest_only.sql`
4. 기존 운영 DB의 `supabase_migrations.schema_migrations`에 위 세 버전이 모두 있으면 SQL을 다시 실행하거나 다른 버전으로 repair하지 않는다. 코드와 운영 원장의 내용 일치만 검증한다.
5. `telegram-ops` Edge Function을 JWT 검증 없이 배포한다. Telegram 웹훅 비밀 헤더와 아래 관리자 허용목록이 대신 요청을 검증한다.
6. 아래 secret을 Supabase Edge Function에 등록한다.
7. BotFather에서 만든 봇을 비공개 주문관리방·견적관리방에 초대한다.
8. Telegram `setWebhook`에 Edge Function HTTPS URL, `secret_token`, `allowed_updates=["message","callback_query"]`를 등록한다.
9. Supabase Cron에서 1분마다 같은 Edge Function을 POST 호출하고 `x-bellore-cron-secret` 헤더를 넣는다.
10. staging 테스트표를 모두 통과한 뒤 운영에 같은 순서로 적용한다.

## 필요한 Edge Function secret

```text
TELEGRAM_BOT_TOKEN
TELEGRAM_WEBHOOK_SECRET
TELEGRAM_CRON_SECRET
TELEGRAM_ORDER_CHAT_ID
TELEGRAM_QUOTE_CHAT_ID
TELEGRAM_ADMIN_USER_IDS          # 쉼표로 구분한 Telegram 숫자 사용자 ID
TELEGRAM_BELLORE_PROFILE_ID      # profiles.role='admin'인 벨로르 관리자 UUID

SOLAPI_API_KEY
SOLAPI_API_SECRET
SOLAPI_PFID
SOLAPI_SENDER
SOLAPI_TEMPLATE_QUOTE_APPROVED
SOLAPI_TEMPLATE_QUOTE_PRICE
SOLAPI_TEMPLATE_QUOTE_CLOSED
SOLAPI_TEMPLATE_QUOTE_CLOSED_EMPTY
```

Supabase가 자동 제공하는 `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`도 필요하다.
서비스 역할 키는 브라우저 코드나 텔레그램 메시지에 절대 노출하지 않는다.

## 솔라피 템플릿 변수 계약

심사 완료 템플릿과 코드의 변수명이 글자 단위로 일치해야 한다.

| 템플릿 | 변수 |
|---|---|
| 비교견적 신청 승인 안내 | `#{시계정보}`, `#{승인일시}`, `#{고객명}` |
| 비교견적 새 견적 도착 안내 | `#{제안금액}`, `#{견적일시}`, `#{시계정보}`, `#{현재최고금액}`, `#{고객명}` |
| 견적 종료(제안 있음) | `#{상품명}`, `#{최종금액}` |
| 견적 종료(제안 없음) | `#{상품명}` |

현재 솔라피에 만든 템플릿의 변수명이 다르면 배포 전에 코드 또는 템플릿 계약을 맞춘다.

## Cron 설정 원칙

Supabase 공식 권장 방식은 Cron과 `pg_net`으로 Edge Function을 호출하고, URL·인증값은 Vault에 저장하는 것이다. 여기서는 Cron 요청에 별도 `x-bellore-cron-secret`을 붙인다. SQL 파일에는 실제 URL이나 secret을 넣지 않는다.

권장 주기: `* * * * *` (매분). 이 호출이 다음 작업을 수행한다.

- 만료된 견적을 최대 1분 지연으로 종료
- 텔레그램·카카오 발송 큐 재시도
- 실패를 최대 8회, 2~30분 간격으로 재시도

## staging 필수 테스트표

1. 미허용 Telegram 사용자와 다른 그룹방의 입력이 무시되는지 확인한다.
2. `4821 500`, `4821 500만`, `4821 5,000,000`이 모두 500만원으로 미리보기 되는지 확인한다.
3. 같은 Telegram update를 재전송해도 견적·주문이 중복 처리되지 않는지 확인한다.
4. `pending` 견적에 첫 가격을 등록하면 `open`이 되고 `bids`에 새 행이 추가되는지 확인한다.
5. 1차·2차·N차 입력이 기존 행을 덮어쓰지 않는지 확인한다.
6. 고객 앱 `notifications`와 솔라피 알림톡 결과가 각각 기록되는지 확인한다.
7. `paid`가 아닌 주문은 텔레그램 승인이 거부되는지 확인한다.
8. 만료시 외부 업체 제안 수·업체 수·업체별 전체 금액·전화번호·벨로르 제안이 최종보고와 스냅샷에 일치하는지 확인한다.
9. 제안 0건 종료 템플릿과 제안 있음 종료 템플릿이 구분되는지 확인한다.
10. 텔레그램 또는 솔라피를 일시 차단한 뒤 outbox 실패 로그와 재시도가 남는지 확인한다.

## 현재 로컬 검증 명령

```powershell
node --test supabase/functions/_shared/telegram-ops-core.test.mjs
node --test scripts/test-telegram-ops-v6.mjs
node scripts/check-edge.mjs
```

Supabase CLI가 설치·연결된 환경에서는 staging DB 적용 전후로 migration dry-run, function serve, function logs를 추가 확인한다.
