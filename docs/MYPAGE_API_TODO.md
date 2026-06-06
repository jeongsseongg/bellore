# 마이포켓 · 상품상세 — DB 연동 현황 & 추가 구현 필요 목록

구구스 「마이포켓」/상품상세 디자인으로 개편하면서, **현재 Supabase 스키마로 바로 연동 가능한 항목**과
**추가 테이블·컬럼·API가 필요한 항목**을 정리합니다.

---

## ✅ 지금 DB로 실제 연동된 것

| 화면 | 항목 | 데이터 출처 |
|------|------|-------------|
| 마이포켓 | 고객명(고객님) | `profiles.display_name` (auth) |
| 마이포켓 | 이메일 | `profiles.email` |
| 마이포켓 | 계정 유형(일반/업체/관리자) | `profiles.role`, `approved` |
| 마이포켓 | 구매 가능한 상품 건수 | 컬렉션 그리드(`listings`)의 노출 카드 수 |
| 마이포켓 | 내 비교견적 + 입찰 현황 | `quote_requests` / `bids` (기존 연동) |
| 상품상세 | 브랜드·모델·가격 | `listings.title / description / price` |
| 상품상세 | 이미지 갤러리·썸네일·상세 큰 이미지 | `listings.image_urls[]` |
| 상품상세 | 상품번호 | `listings.id` (앞 8자리) |
| 상품상세 | 적립 포인트(표시값) | `price × 0.3%` 계산값 |

---

## ⚠️ 화면엔 있으나 DB가 없어 "0 / 더미"로 표시 중 — 추가 구현 필요

### 1. 포인트 시스템
- **표시 위치:** 마이포켓 `보유 포인트`(현재 `0P` 고정)
- **필요:**
  - `profiles.points int default 0` 컬럼 추가
  - 적립/사용 이력 `point_history(id, user_id, amount, reason, created_at)`
  - API: `getPoints(uid)`, `addPoints()`, `usePoints()`

### 2. 쿠폰
- **표시 위치:** 마이포켓 `보유 쿠폰`(현재 `0장` 고정)
- **필요:**
  - `coupons(id, code, name, discount_type, amount, expires_at)`
  - `user_coupons(user_id, coupon_id, used bool)`
  - API: `listMyCoupons(uid)`

### 3. 멤버십 등급
- **표시 위치:** 마이포켓 우상단 배지(현재 `Family` 고정), `정회원 전환` 버튼
- **필요:**
  - `profiles.grade text default 'family'` (family/regular/vip 등)
  - `정회원 전환` 버튼 → 현재는 카카오 상담 연결. 실제 전환 로직 시 `updateGrade(uid, grade)` API

### 4. 주문 / 결제 (나의쇼핑 상태)
- **표시 위치:** 결제대기·결제완료·상품준비중·배송중·배송완료(현재 전부 `0`),
  빠른메뉴 `입금되지 않은 주문` `보고구매 예약상품`
- **필요(가장 큰 작업):**
  - `orders(id, user_id, listing_id, status, total, created_at)`
    - status enum: `awaiting_payment / paid / preparing / shipping / delivered / canceled`
  - `order_items` (멀티상품 시)
  - 결제 PG 연동(가상계좌·퀵계좌이체·페이코 등 — 상품상세 결제혜택 문구와 연결)
  - API: `subscribeMyOrders(uid)`, `getOrderCounts(uid)`
  - 상품상세 `바로구매` 버튼 → 현재 카카오 상담. 실제 주문 생성 시 `createOrder()` 연결

### 5. 찜(위시리스트)
- **표시 위치:** 상품상세 하트(상단·하단) — 현재 토글만 되고 저장 안 됨
- **필요:**
  - `wishlists(user_id, listing_id, created_at)`
  - API: `toggleWish(uid, listingId)`, `subscribeWishlist(uid)`

### 6. 상품 상세 메타(부속품/상태/매장)
- **표시 위치:** 주요 부속품(박스·케이스·개런티카드·보증서), 상태 설명, 판매매장
- **현재:** 박스/케이스/개런티 ON, 보증서 OFF + 상태 문구 고정
- **필요:** `listings`에 컬럼 추가 권장
  - `accessories text[]` (보유 부속품)
  - `condition_note text` (상태 상세)
  - `store text` (판매 매장)
  - `reference text` (레퍼런스 번호)

---

## 권장 작업 순서
1. `wishlists` (가장 간단, 효과 큼)
2. `listings` 메타 컬럼(accessories/condition_note/store/reference)
3. `points` + `point_history`
4. `coupons` / `user_coupons`
5. `orders` + 결제 PG 연동 (가장 크고 PG 계약 필요)

> 위 1~4는 기존 Supabase 패턴(`supabase.js`의 `subscribe*` / `mapXxx`)을 그대로 따라 추가하면 됩니다.
> 5번(주문/결제)은 PG사 선정·정산 정책 등 비즈니스 결정이 선행되어야 합니다.
