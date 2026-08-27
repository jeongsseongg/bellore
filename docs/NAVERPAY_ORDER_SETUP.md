# 네이버페이 주문형 V2.1 설정

## 현재 단계

- 운영 노출 전환
- 상품 상세와 장바구니에서 운영 버튼 노출
- 서버 함수와 필수 인증값 등록 완료
- 샌드박스 주문 등록은 네이버 기술지원에서 가맹점 정보를 등록한 뒤 활성화됨

현재 실제 상품 주문 등록 테스트 응답:

```text
FAIL:[ERR-OR-100001] 가맹점ID 정보가 없습니다.
```

코드 오류가 아니라 신규 가맹점의 샌드박스 정보가 아직 등록되지 않은 상태입니다.
아래 검수 정보와 함께 샌드박스 등록을 요청합니다.

## Supabase Function Secrets

아래 값은 저장소나 브라우저 코드에 넣지 않습니다.

```text
NAVERPAY_MERCHANT_ID=np_로 시작하는 가맹점 ID
NAVERPAY_CERTI_KEY=가맹점 인증키
NAVERPAY_BUTTON_KEY=버튼 인증키
NAVERPAY_ACCOUNT_ID=네이버 공통 인증키
NAVERPAY_RETURN_ZIPCODE=반품지 우편번호
NAVERPAY_RETURN_ADDRESS1=반품지 기본주소
NAVERPAY_RETURN_ADDRESS2=반품지 상세주소
NAVERPAY_SELLER_NAME=벨로르
NAVERPAY_SELLER_CONTACT=01062936668
NAVERPAY_SITE_URL=https://bellore.co.kr
```

## 배포

`naverpay-order` 함수는 가입 최종 승인 전까지 JWT 검증 없이 배포합니다.
함수 내부에서 공개 상품 ID만 받고 DB의 실제 상품 상태·가격을 다시 조회합니다.

```bash
supabase functions deploy naverpay-order --no-verify-jwt
```

## 테스트

1. `https://bellore.co.kr/?naverPayTest=1` 접속
2. 판매 중인 상품 상세 열기
3. 공식 Npay 구매 버튼 노출 확인
4. 버튼 클릭 후 샌드박스 주문서 진입 확인
5. 상품명·가격·배송비·재고 상태 확인

## 네이버 검수 요청

- 수신: `dl_techsupport@navercorp.com`
- 가맹점명 및 가맹점 ID
- 주문 연동버전 `2.1`
- 테스트 URL과 접근 방법
- 상품정보 XML URL:
  `https://iumsnacuxgssnnbckurq.supabase.co/functions/v1/naverpay-order`

상품정보 XML 도메인 일치 여부는 검수 전에 네이버 기술지원팀에 확인합니다.
