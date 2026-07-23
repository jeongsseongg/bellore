# 벨로르 포트원 V2 운영 결제 설정

벨로르 결제는 **전액 결제만** 지원합니다. 예약금·분할결제는 제공하지 않습니다.

## 1. 포트원 콘솔

1. `https://admin.portone.io`에서 벨로르 상점을 선택합니다.
2. 결제연동 → 연동 정보 → 채널 관리에서 PG 심사가 완료된 **운영 채널**을 추가합니다.
3. 신용·체크카드 운영 채널의 `channelKey`를 `supabase-config.js`의 `card` 항목에 입력합니다.
4. 카카오페이·네이버페이 등은 각 서비스의 가맹점 심사와 포트원 채널 연결을 모두 마친 후에만 해당 `channelKey`를 입력합니다.
5. 테스트 채널 키는 운영 사이트에 입력하지 않습니다.

`channelKey`가 빈 결제수단은 체크아웃에 표시되지 않습니다. 심사되지 않은 결제수단을 버튼만 노출하는 방식은 금지합니다.

## 2. Supabase Edge Function 시크릿

Supabase 프로젝트의 Function Secrets에 아래 값을 등록합니다.

```text
PORTONE_API_SECRET=포트원_V2_API_Secret
PORTONE_STORE_ID=store-c0c1bc9e-60c2-4ac6-9bb1-80c0ee7337ef
SHIPPING_FEE=35000
PREMIUM_SHIP_THRESHOLD=5000000
```

API Secret은 브라우저 코드나 저장소에 넣지 않습니다.

## 3. Edge Function 배포

```bash
supabase functions deploy confirm-payment --no-verify-jwt
supabase functions deploy cancel-payment
```

- `confirm-payment`: 포트원 결제 상태, 상점 ID, DB 상품가격, 배송비, 쿠폰을 서버에서 재검증합니다.
- `cancel-payment`: 관리자 JWT를 확인한 뒤 포트원 V2 취소 API를 호출합니다.
- 실제 포트원 취소가 성공하기 전에는 DB 주문을 환불완료로 변경하지 않습니다.

## 4. DB 전액결제 마이그레이션

Supabase SQL Editor에서 `payment_full_only.sql`을 한 번 실행합니다.

## 5. 운영 전 필수 테스트

1. 승인된 실제 상품 한 건으로 카드 결제창이 열리는지 확인합니다.
2. 주문금액이 `상품가 + 35,000원`인지 확인합니다(500만원 이상).
3. 500만원 미만은 배송비가 0원인지 확인합니다.
4. 결제 성공 후 주문이 `paid`로 바뀌고 영수증 URL이 저장되는지 확인합니다.
5. 금액을 변조한 요청이 `amount_mismatch`로 거절되고 자동 취소되는지 확인합니다.
6. 관리자 환불 시 포트원 결제내역이 실제 취소되고 주문이 `refunded`로 바뀌는지 확인합니다.
7. 테스트·샘플 상품이 운영 화면과 HTML에 존재하지 않는지 확인합니다.
8. 중고 상품명이 `[중고]`로 표시되는지 확인합니다.

## 6. 장애 시 원칙

- 포트원 SDK, 운영 채널, 주문 DB, 서버 검증 함수 중 하나라도 준비되지 않으면 결제 버튼을 차단합니다.
- 데모 주문이나 서버 검증 없는 성공 처리는 운영에서 사용하지 않습니다.
- PG 콘솔에서 직접 상태를 바꾸지 말고 포트원 대시보드 또는 포트원 API로 취소합니다.
