# 벨로르 결제(토스페이먼츠) 설정 가이드

현재 상태: **테스트 키로 즉시 동작**합니다. 실제 정산을 받으려면 아래 3단계를 진행하세요.

## 구성 요소

| 파일 | 역할 |
|------|------|
| `supabase-config.js` (`window.BELLORE_PAYMENTS`) | 프런트 결제 설정 (clientKey, 예약금 비율 등) |
| `payments.js` | 체크아웃 모달 + 토스 결제위젯 + 결과 처리 |
| `orders.sql` | 주문 테이블 + RLS |
| `supabase/functions/confirm-payment/index.ts` | 서버 결제 승인(검증) Edge Function |

## 1단계 — 주문 테이블 생성

Supabase 대시보드 → SQL Editor 에서 `orders.sql` 전체를 실행합니다.

## 2단계 — Edge Function 배포 (결제 승인 검증)

> 이 단계 전까지는 결제창은 뜨지만 승인은 "데모"로만 처리됩니다.
> 실제 결제 확정/위변조 방지를 위해 반드시 배포해야 합니다.

```bash
# Supabase CLI 설치 후
supabase login
supabase link --project-ref iumsnacuxgssnnbckurq

# 토스 시크릿키 등록 (절대 깃에 올리지 말 것!)
supabase secrets set TOSS_SECRET_KEY=test_gsk_xxxxxxxx

# 배포
supabase functions deploy confirm-payment --no-verify-jwt
```

- 테스트 시크릿키는 토스 개발자센터에서 발급되는 `test_gsk_...` 값입니다.
- 라이브 전환 시 `live_gsk_...` 로 교체하면 됩니다.

## 3단계 — 라이브 키로 교체 (실제 정산)

1. 토스페이먼츠 가입·심사 완료 후 라이브 키 발급
2. `supabase-config.js` 의 `clientKey` 를 `live_gck_...` 로 교체
3. Edge Function 시크릿을 `live_gsk_...` 로 재설정 후 재배포

## 결제 정책 (조정 가능 — `supabase-config.js`)

- `depositRate`: 예약금 비율 (기본 10%)
- `depositMin` / `depositMax`: 예약금 하한/상한
- `shippingFee`: 전액 결제 시 배송비

## 동작 흐름

1. 상품 상세 → **바로구매** → 체크아웃 모달
2. 예약금/전액 선택 + 구매자 정보 입력
3. 토스 결제위젯(카드·가상계좌·간편결제)에서 결제
4. `?pay=success` 로 복귀 → Edge Function 이 토스 승인 + 금액 검증 → `orders.status = paid`
5. 마이페이지에 결제대기/결제완료 건수 반영

## 테스트 카드

토스 테스트 환경에서는 아무 카드번호나 입력해도 승인됩니다.
(예: 카드번호 4242-4242-4242-4242, 유효기간 미래 아무 값)
