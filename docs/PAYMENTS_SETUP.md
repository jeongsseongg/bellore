# 벨로르 포트원 V2 운영 결제 설정

벨로르 결제는 **전액 결제만** 지원합니다. 예약금·분할결제는 제공하지 않습니다.

## 1. 포트원 콘솔

1. `https://admin.portone.io`에서 벨로르 상점을 선택합니다.
2. 결제연동 → 연동 정보 → 채널 관리에서 PG 심사가 완료된 **운영 채널**을 추가합니다.
3. 테스트 중에는 KG이니시스 `INIpayTest` 채널의 `channelKey`를 `supabase-config.js`의 `card` 항목에 입력하고 `test: true`를 유지합니다.
4. 테스트 채널은 로컬 환경 또는 운영 주소 뒤에 `?paymentTest=1`을 붙였을 때만 노출됩니다.
5. 카드사 심사가 끝나면 카드 항목의 `channelKey`를 운영 채널키로 교체하고, 라벨의 `(테스트)`와 `test: true`를 제거합니다.
6. 카카오페이·네이버페이 등은 각 서비스의 가맹점 심사와 포트원 채널 연결을 모두 마친 후에만 해당 `channelKey`를 입력합니다.

`channelKey`가 빈 결제수단은 체크아웃에 표시되지 않습니다. 테스트 채널은 일반 방문자에게 숨겨지며, 심사되지 않은 운영 결제수단을 버튼만 노출하는 방식은 금지합니다.

## 2. Supabase Edge Function 시크릿

Supabase 프로젝트의 Function Secrets에 아래 값을 등록합니다.

```text
PORTONE_API_SECRET=포트원_V2_API_Secret
PORTONE_STORE_ID=store-c0c1bc9e-60c2-4ac6-9bb1-80c0ee7337ef
PORTONE_API_BASE=https://api.portone.io
ALLOW_TEST_PAYMENTS=false
POINT_EARN_BPS=0
CHECKOUT_RATE_KEY_SECRET=32바이트_이상_무작위값
PAYMENT_RECONCILE_TOKEN=32바이트_이상_무작위값
```

API Secret은 브라우저 코드나 저장소에 넣지 않습니다.

`PAYMENT_RECONCILE_TOKEN`은 GitHub Actions의 동명 repository secret에도 같은 값으로 등록합니다. `CHECKOUT_RATE_KEY_SECRET`과 `PAYMENT_RECONCILE_TOKEN`은 서로 다른 값이어야 합니다. `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`는 Supabase가 함수에 제공합니다.

## 3. DB 권한·결제 마이그레이션

SQL Editor에 과거 `payment_full_only.sql`을 붙여 넣지 않습니다. GitHub Actions의 `DB Maintenance`에서 아래 순서로 실행합니다.

1. `validate-authority-payment`: 전체 마이그레이션을 실행한 뒤 항상 rollback합니다.
2. 24시간 이내의 성공한 `Daily DB Backup` run ID를 확인합니다.
3. `apply-authority-payment`: 배포할 정확한 main SHA와 backup run ID를 입력합니다.
4. 워크플로가 백업 아티팩트의 복호화·압축·SQL 형식을 확인하고, 마이그레이션 적용 뒤 ACL 전수검사와 10개 동시 세션 제한 검사를 수행합니다.

적용 파일은 `supabase/migrations/20260824090000_authority_payment_hardening.sql` 하나입니다.

## 4. Edge Function 배포

```bash
supabase functions deploy create-checkout
supabase functions deploy confirm-payment
supabase functions deploy cancel-payment
supabase functions deploy payment-webhook --no-verify-jwt
supabase functions deploy reconcile-payments --no-verify-jwt
```

- `create-checkout`: 브라우저 대신 서버에서 주문 capability를 만들고 IP별 15분 요청 상한을 적용합니다. `CHECKOUT_RATE_KEY_SECRET`에는 32바이트 이상의 무작위 secret을 설정합니다.
- `confirm-payment`: 포트원 결제 상태, 상점 ID, DB 상품가격, 배송비, 쿠폰을 서버에서 재검증합니다.
- `cancel-payment`: 관리자 JWT를 확인한 뒤 포트원 V2 취소 API를 호출합니다.
- `payment-webhook`: JWT 대신 포트원 서버 재조회로 결제·취소 상태를 검증하고 DB와 동기화합니다.
- `reconcile-payments`: `PAYMENT_RECONCILE_TOKEN`으로 보호된 정기 재대조 함수입니다. GitHub의 동명 secret과 Supabase Edge secret에 같은 무작위 값을 설정합니다.
- 실제 포트원 취소가 성공하기 전에는 DB 주문을 환불완료로 변경하지 않습니다.

## 5. 운영 배포 순서

1. 정적 사이트 배포를 잠급니다: repository variable `PRODUCTION_DEPLOY_ENABLED=false`.
2. 품질 게이트가 통과한 main SHA로 DB validate → apply를 완료합니다.
3. Supabase Function Secrets를 등록하고 위 Edge 함수 5개를 배포합니다.
4. 포트원 운영 웹훅 URL을 `.../functions/v1/payment-webhook`으로 등록합니다.
5. `Payment Reconcile`을 수동 실행해 성공을 확인합니다.
6. `PRODUCTION_DEPLOY_ENABLED=true`로 바꾸고 Pages/Firebase 정적 사이트를 배포합니다.
7. 운영 도메인에서 모바일 화면과 결제 승인→취소→웹훅→재대조를 확인합니다.

DB → Edge → 웹훅 → 정적 사이트 순서를 바꾸지 않습니다. 새 프런트는 `create-checkout` 함수와 새 RPC가 모두 준비된 뒤에만 공개합니다.

## 6. 운영 전 필수 테스트

1. 승인된 실제 상품 한 건으로 카드 결제창이 열리는지 확인합니다.
2. 주문금액이 `상품가 + 35,000원`인지 확인합니다(500만원 이상).
3. 500만원 미만은 배송비가 0원인지 확인합니다.
4. 결제 성공 후 주문이 `paid`로 바뀌고 영수증 URL이 저장되는지 확인합니다.
5. 금액을 변조한 요청이 `amount_mismatch`로 거절되고 자동 취소되는지 확인합니다.
6. 관리자 환불 시 포트원 결제내역이 실제 취소되고 주문이 `refunded`로 바뀌는지 확인합니다.
7. 테스트·샘플 상품이 운영 화면과 HTML에 존재하지 않는지 확인합니다.
8. 중고 상품명이 `[중고]`로 표시되는지 확인합니다.

## 7. 장애 시 원칙

- 포트원 SDK, 운영 채널, 주문 DB, 서버 검증 함수 중 하나라도 준비되지 않으면 결제 버튼을 차단합니다.
- 데모 주문이나 서버 검증 없는 성공 처리는 운영에서 사용하지 않습니다.
- PG 콘솔에서 직접 상태를 바꾸지 말고 포트원 대시보드 또는 포트원 API로 취소합니다.
