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
PAYMENT_CHECKOUT_ENABLED=false
PAYMENT_RECONCILE_ENABLED=false
```

API Secret은 브라우저 코드나 저장소에 넣지 않습니다.

`PAYMENT_RECONCILE_TOKEN`은 GitHub Actions의 동명 repository secret에도 같은 값으로 등록합니다. 운영 DB apply 직전의 비변경 잠금 점검용으로 GitHub Actions repository secret `SUPABASE_ANON_KEY`에도 현재 프로젝트의 anon key를 등록합니다. 이 점검은 유효한 상품이나 주문을 전달하지 않으며 체크아웃·승인확인·취소·웹훅·재대조 다섯 엔드포인트가 DB나 결제사를 읽기 전에 정확한 503 잠금 응답을 내는지만 확인합니다. `CHECKOUT_RATE_KEY_SECRET`과 `PAYMENT_RECONCILE_TOKEN`은 서로 다른 값이어야 합니다. `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`는 Supabase가 함수에 제공합니다.

## 3. DB 권한·결제 마이그레이션

SQL Editor에 과거 `payment_full_only.sql`을 붙여 넣지 않습니다. GitHub Actions의 `DB Maintenance`에서 아래 순서로 실행합니다.

`validate-authority-payment`는 GitHub runner 안에 운영과 같은 PostgreSQL 17 계열의 일회성 Supabase DB를 만듭니다. 운영에서는 `pg_dump --schema-only`로 DDL·ACL·RLS만 읽고, archive TOC에 `TABLE DATA`·`SEQUENCE SET`·`BLOB`이 0건인지 확인한 뒤에만 복원합니다. 주문·회원·상품 같은 운영 행은 복제하지 않으며, 필요한 판매 상품 6건은 일회성 트랜잭션 안에서만 합성합니다. `pg_control_system()`의 물리 system identifier가 운영과 다를 때만 픽스처를 실행하고, 완료·실패와 관계없이 네트워크가 차단된 컨테이너와 정확한 runner 임시 폴더를 삭제합니다.

1. `validate-authority-payment`: 데이터 없는 일회성 검증 DB에서 전체 마이그레이션과 합성 픽스처를 실행한 뒤 항상 rollback합니다.
2. 24시간 이내의 성공한 `Daily DB Backup` run ID를 확인합니다.
3. 정적 배포와 다섯 결제 Edge 경로가 모두 잠겼고 다섯 응답이 실제 503이며 새 주문·예약이 0건인지 확인합니다. GitHub variables `PRODUCTION_DEPLOY_ENABLED=false`, `PAYMENT_RECONCILE_ENABLED=false`도 명시적으로 설정합니다. apply 워크플로가 같은 503 응답을 다시 기계 확인하며, 정확한 잠금 오류가 아니면 DB를 건드리기 전에 중단합니다.
4. `apply-authority-payment`: 배포할 정확한 main SHA, backup run ID, `production_apply_ack=APPLY_AUTHORITY_PAYMENT_TO_PRODUCTION`, `payment_locks_ack=PAYMENT_CHECKOUT_AND_RECONCILE_LOCKED`, 보호 주문번호를 로컬에서 변환한 64자리 소문자 `payment_hold_sha256`, `payment_hold_ack=SEED_HASH_ONLY_PAYMENT_OPERATION_HOLD`를 입력합니다. 주문번호 원문은 저장소·워크플로 입력·로그·hold 테이블에 넣지 않습니다.
5. 워크플로는 백업 아티팩트가 복호화·압축 해제되고 SQL dump 표식을 포함하는지만 확인합니다. 이 검사는 **실제 복원이 된다는 증거가 아닙니다**. 별도 격리 DB 복원 훈련이 성공한 시점·대상·명령을 운영 기록으로 남긴 경우에만 “복원 가능”이라고 표현합니다.
6. 운영의 과거 authority hardening은 저장소 파일명과 같은 버전으로 원장에 남아 있지 않으므로 과거 번호를 임의로 추가하거나 `migration repair`로 역사를 위조하지 않습니다. 대신 `customer_shipping_addresses` 이름이 원장에 정확히 1건인지, 기존 orders/listings/rate-limit/shipping 테이블의 핵심 열·RPC·트리거·RLS·권한이 운영 기준과 일치하는지 데이터 행을 읽지 않고 검사합니다. 대상 6개 버전이나 고유 열·함수·인덱스·트리거·view 중 하나라도 이미 있으면 부분 적용으로 판단해 SQL 실행 전에 중단합니다.
7. 대상 SQL 6개와 해당 이력 6개는 한 트랜잭션에서 함께 기록됩니다. 가장 먼저 hash-only hold와 DB 제어 스위치를 만들고 보호 hash를 활성화한 뒤 후속 마이그레이션을 실행합니다. 운영 apply는 보호 주문을 개별 조회하거나 잠그지 않으며, 모든 백필터의 hold 제외 조건과 DB trigger가 변경을 이중 차단합니다. DB 잠금은 5초, 문장 실행은 5분을 넘기면 전체 트랜잭션을 실패시킵니다. 적용 뒤 ACL 전수검사와 10개 동시 세션 제한 검사를 수행합니다.

적용 파일은 아래 6개이며 반드시 이 순서로 한 트랜잭션에 적용합니다.

1. `supabase/migrations/20260826155000_payment_operation_hold.sql`
2. `supabase/migrations/20260826160000_payment_recovery_listing_state.sql`
3. `supabase/migrations/20260826170000_checkout_claim_integrity.sql`
4. `supabase/migrations/20260826180000_order_financial_state_guard.sql`
5. `supabase/migrations/20260826190000_payment_finalization_closed_order_contract.sql`
6. `supabase/migrations/20260826203000_checkout_cancellation_release.sql`

첫 번째 마이그레이션은 다섯 결제 경로를 기본 `false`로 두는 DB 제어 스위치와 SHA-256 기반 주문 보류를 설치합니다. 활성 hold 주문과 연결 상품은 Edge 결제사 호출 전에 제외되고 DB trigger에서도 UPDATE·DELETE·TRUNCATE가 차단됩니다. 보류 해제는 이번 배포 범위가 아니며 별도 승인 없이 `released_at`을 변경하거나 hold 행을 삭제하지 않습니다.

`20260824090000_authority_payment_hardening.sql`은 이미 적용된 역사 마이그레이션이므로 수정하거나 이 경로에서 다시 실행하지 않습니다. 새 결제 계약 변경은 위 후속 마이그레이션에만 추가합니다. Supabase는 적용 여부를 `supabase_migrations.schema_migrations`로 판단하므로 SQL만 직접 실행하고 이력을 남기지 않는 방식도 금지합니다.

두 번째 마이그레이션은 새 주문에 `payment_contract_version=2`를 부여합니다. 최종 `paid_only` 계약에서는 같은 상품의 결제대기 주문을 여러 개 만들 수 있지만 같은 쿠폰은 한 미해결 주문만 소유할 수 있습니다. `NULL`인 과거 주문은 레거시 주문으로 남으며 `confirm-payment`·`payment-webhook`·`reconcile-payments`의 자동 확정·해제·취소 대상에 포함하지 않습니다. 레거시 주문은 운영자가 별도 근거와 승인으로 처리합니다. 마이그레이션이 기존 주문의 버전을 일괄 변경하지 않는지 적용 전에 확인합니다.

새 체크아웃의 상품 계약은 `paid_only`입니다. 상품 보기, 결제창 열기, `pending`·`payment_review`, 브라우저 이탈은 상품을 예약하지 않습니다. 포트원에서 `PAID`와 금액을 서버가 검증한 결제만 DB 상품 행을 잠그고 확정할 수 있으며, 같은 상품의 결제가 겹치면 먼저 원자적으로 확정한 한 주문만 성공하고 나머지 승인 건은 기존 자동 전액 취소·환불 경로로 보냅니다. 고객이 결제창에서 이탈했고 bounded 재조회 전체가 404이거나 포트원이 미결제 `CANCELLED`를 반환하면 그 결제대기 주문과 쿠폰 점유를 즉시 닫습니다. 콜백이 유실된 주문은 생성 후 1시간 이상 지난 뒤 정기 재대조에서도 계속 `NOT_FOUND`일 때 종료하며, 5분 주기 실행을 포함한 정리 시점은 약 60~65분입니다. 이 시간은 상품 재판매 시점이 아니라 주문·쿠폰 정리 시점입니다. 포트원 `PENDING`은 24시간 뒤 검토 상태로 올리되 상품을 막지 않습니다. 최근 종료 주문은 7일간 회전 재조회하여 늦게 나타난 `PAID`를 자동 전액 취소합니다.

## 4. Edge Function 배포

```bash
supabase functions deploy payment-webhook --no-verify-jwt
supabase functions deploy confirm-payment
supabase functions deploy cancel-payment
supabase functions deploy reconcile-payments --no-verify-jwt
supabase functions deploy create-checkout
```

운영 잠금 배포에서는 외부 비동기 이벤트가 먼저 들어오는 경로를 닫기 위해 `payment-webhook`을 반드시 첫 번째로 교체합니다. 그 다음 `confirm-payment` → `cancel-payment` 순서로 교체하고, 기존 환경 스위치로 이미 잠긴 `reconcile-payments`와 `create-checkout`을 마지막에 교체합니다.

- `create-checkout`: 브라우저가 네트워크 요청 전에 세션용 UUID 요청키와 32바이트 주문 capability를 생성·저장합니다. Edge는 두 값을 검증해 SHA-256 해시만 DB에 전달하며, DB에는 원문 capability를 저장하지 않습니다. 응답이 유실돼도 같은 입력은 같은 요청키·주문으로 재개하고, 다른 입력은 충돌로 닫습니다. IP별 15분 요청 상한은 최초 주문에만 소비합니다. `CHECKOUT_RATE_KEY_SECRET`에는 32바이트 이상의 무작위 secret을 설정합니다.
- 모든 함수는 각 DB 제어 스위치가 정확히 `true`일 때만 작동합니다. 제어 RPC가 없거나 읽기에 실패하거나 값이 `false`이면 주문 DB와 포트원을 읽기 전에 503으로 닫힙니다.
- `PAYMENT_CHECKOUT_ENABLED`는 기존 환경 스위치와 DB `create_checkout`이 둘 다 정확히 `true`일 때만 새 결제를 허용합니다. 누락 또는 `false`이면 주문이나 예약을 만들기 전에 중단하며, 고객에게는 내부 설정값 대신 "잠시 점검 중" 안내가 표시됩니다.
- `confirm-payment`: v2 주문만 포트원 결제 상태, 상점 ID, DB 상품가격, 배송비, 쿠폰을 서버에서 재검증합니다. 결제창 이탈 신호만으로는 해제하지 않으며, bounded 재조회가 모두 정확한 404일 때만 미결제 주문을 종료합니다.
- `cancel-payment`: 관리자 JWT를 확인한 뒤 포트원 V2 취소 API를 호출합니다.
- `payment-webhook`: JWT 대신 포트원 서버 재조회로 v2 결제·취소 상태를 검증하고 DB와 동기화합니다. 레거시 또는 계약 버전을 확인할 수 없는 주문은 자동 변경하지 않습니다.
- `reconcile-payments`: `PAYMENT_RECONCILE_TOKEN`으로 보호된 v2 정기 재대조 함수입니다. GitHub의 동명 secret과 Supabase Edge secret에 같은 무작위 값을 설정합니다.
- `PAYMENT_RECONCILE_ENABLED`는 Supabase Function Secret과 GitHub repository variable 양쪽이 정확히 `true`일 때만 재대조를 실행합니다. 배포 중이거나 값이 없으면 변경 작업을 하지 않습니다.
- `PENDING`은 결제 실패가 아니며 24시간 뒤 검토 상태로 바뀌어도 상품 재고를 막지 않습니다. `NOT_FOUND`도 단일 응답으로는 주문을 닫지 않고, 명시적 결제창 취소 후 bounded 재조회 또는 생성 1시간 뒤 정기 재대조에서만 주문·쿠폰 점유를 종료합니다. 5분 실행 주기 때문에 자동 정리는 약 60~65분에 일어납니다. 이후 7일 회전 재조회에서 늦은 `PAID`가 확인되면 상품을 결제완료로 바꾸지 않고 전액 자동 취소합니다.
- 실제 포트원 취소가 성공하기 전에는 DB 주문을 환불완료로 변경하지 않습니다. 취소 요청액이나 주문 예정액이 아니라 포트원 응답의 실제 누적 취소액(`cancellation.totalAmount` 또는 재조회한 `payment.amount.cancelled`)을 DB 환불액으로 기록합니다. 실제 취소액을 확인할 수 없으면 `refund_pending`을 유지하며 `refunded`로 확정하지 않습니다.

## 5. 운영 배포 순서

1. 정적 배포를 잠급니다: repository variable `PRODUCTION_DEPLOY_ENABLED=false`.
2. 재대조를 잠급니다: GitHub variable과 Supabase Function Secret의 `PAYMENT_RECONCILE_ENABLED=false`.
3. 새 결제를 잠급니다: Supabase Function Secret `PAYMENT_CHECKOUT_ENABLED=false`.
4. DB 제어 RPC가 없거나 false이면 닫히는 새 Edge 함수 다섯 개를 `payment-webhook` → `confirm-payment` → `cancel-payment` → `reconcile-payments` → `create-checkout` 순서로 배포합니다. 함수별 교체 직후 동일한 503 점검 응답이며 주문 DB·포트원 호출이 0회인지 확인합니다.
5. 잠금 전 시작된 요청이 끝나도록 180초 drain한 뒤에만 DB 검증·적용으로 이동합니다. 이는 재대조 함수의 150초 실행 상한보다 긴 보수적 대기입니다.
6. 품질 게이트가 통과한 동일 main SHA로 DB `validate-authority-payment`를 **데이터 없는 일회성 검증 DB**에서 실행합니다. 이 검사는 운영 스키마만 복제하고 합성 상품으로 `SET CONSTRAINTS ALL IMMEDIATE`까지 실행한 뒤 rollback하며, 운영 DB에서는 픽스처를 실행하지 않습니다.
7. 24시간 이내 백업 아티팩트의 복호화·압축·SQL dump 표식 검사를 통과시킵니다. 이것만으로 복원 가능하다고 단정하지 말고, 최근 격리 복원 훈련 기록을 별도로 확인합니다. 그 뒤 정확한 승인 문자열·보호 hash·SHA를 입력해 운영 DB 마이그레이션 6개를 한 트랜잭션으로 apply합니다.
8. 운영 DB 계약·hold·trigger·ACL 사후검사와 Supabase 보안/성능 advisor를 통과시킵니다. 사후검사는 hold hash 행과 계약 객체만 확인하며 보호 주문을 직접 조회하지 않습니다.
9. 배포된 Edge 다섯 개가 같은 release SHA의 소스인지 다시 확인하고 Pages를 검증한 뒤, `PRODUCTION_DEPLOY_ENABLED=false`를 유지한 채 Pages 수동 `static_release_sha` 경로로 배포합니다. Firebase는 공개 도메인 경로가 아닙니다.
10. DB `payment_webhook` → `confirm_payment` → `cancel_payment` 제어만 먼저 개방하고 비변경 요청으로 정상 응답 경계를 확인합니다.
11. held 주문 제외가 확인된 수동 재대조 1회를 통과한 뒤에만 DB `reconcile_payments`, Supabase/GitHub `PAYMENT_RECONCILE_ENABLED`을 함께 개방합니다.
12. 마지막으로 DB `create_checkout`과 Supabase `PAYMENT_CHECKOUT_ENABLED`을 함께 개방해 새 결제를 엽니다.
13. 운영 도메인에서 새 주문으로 모바일 결제 승인→웹훅→재대조→예약 표시를 확인하고, 승인된 별도 테스트 주문으로 취소·전액 환불도 검증합니다.

웹훅 잠금 Edge → 나머지 잠금 Edge → 5개 잠금 확인 → 180초 drain → 별도 DB 검증 → 운영 DB 적용 → Edge·정적 사이트 검증 → 정적 배포 → 웹훅/확인/취소 개방 → 재대조 → 체크아웃 개방 순서를 바꾸지 않습니다. 단계가 실패하면 결제·재대조·정적 배포 스위치를 `false`로 유지하며, 이미 적용한 DB를 임의로 되돌리지 않습니다.

## 6. 운영 전 필수 테스트

1. 승인된 실제 상품 한 건으로 카드 결제창이 열리는지 확인합니다.
2. 주문금액이 `상품가 + 35,000원`인지 확인합니다(500만원 이상).
3. 500만원 미만은 배송비가 0원인지 확인합니다.
4. 결제 성공 후 주문이 `paid`로 바뀌고 영수증 URL이 저장되는지 확인합니다.
5. 금액을 변조한 요청이 `amount_mismatch`로 거절되고 자동 취소되는지 확인합니다.
6. 관리자 환불 시 포트원 결제내역이 실제 취소되고 주문이 `refunded`로 바뀌는지 확인합니다.
7. 테스트·샘플 상품이 운영 화면과 HTML에 존재하지 않는지 확인합니다.
8. 중고 상품명이 `[중고]`로 표시되는지 확인합니다.
9. 결제창 취소 후 같은 주문을 bounded 재조회하고, `PENDING`·조회 오류·첫 404에서도 상품은 계속 판매 가능하며 결제대기 주문만 안전하게 유지되는지 확인합니다. 명시적 이탈 뒤 재조회 전체가 404이면 주문·쿠폰 점유가 즉시 종료되고, 이후 늦은 `PAID`를 모의하면 기존 주문이 결제완료가 되지 않고 자동 전액 취소되는지 확인합니다.
10. 같은 상품으로 서로 다른 미해결 주문을 두 개 만들 수 있고 상품이 `on_sale`·무예약 상태인지, 같은 쿠폰으로는 미해결 주문을 두 개 만들 수 없는지 확인합니다.
11. `paid_only`·`paymentContractVersion=2`가 체크아웃 응답과 주문 행에 함께 기록되고, 응답에 시간 만료값(`expiresAt`)이 없는지 확인합니다.
12. 같은 상품의 결제 두 건을 동시에 확정하면 상품 행 잠금으로 한 건만 확정되고 다른 승인 건은 자동 전액 취소·환불되는지 확인합니다.
13. 레거시(`payment_contract_version IS NULL`) 주문을 웹훅·재대조가 자동 변경하지 않는지 확인합니다.
14. 부분취소 또는 이전 취소가 있는 주문에서 포트원이 반환한 실제 누적 취소액과 DB `refund_amount`가 같은지 확인합니다.
15. 주문 생성 응답을 유실시킨 뒤 같은 브라우저 세션·같은 입력으로 재시도했을 때 주문 행과 요청 상한이 각각 한 번만 생성·소비되고 같은 `orderNo`가 반환되는지 확인합니다.
16. 같은 요청키로 금액·쿠폰·배송정보를 바꾼 재시도는 `checkout_request_conflict`로 닫히며, 브라우저가 pending 주문과 capability를 저장·재확인하지 못하면 포트원 결제창이 열리지 않는지 확인합니다.

## 7. 장애 시 원칙

- 포트원 SDK, 운영 채널, 주문 DB, 서버 검증 함수 중 하나라도 준비되지 않으면 결제 버튼을 차단합니다.
- 데모 주문이나 서버 검증 없는 성공 처리는 운영에서 사용하지 않습니다.
- PG 콘솔에서 직접 상태를 바꾸지 말고 포트원 대시보드 또는 포트원 API로 취소합니다.
