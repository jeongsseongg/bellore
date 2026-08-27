# 인증·페이지 통합 회귀 — 2026-08-28

## 사용자 영향

- 휴대폰 번호 입력 뒤 KG 통합인증 창에서 번호를 다시 입력하게 됐고, 공급자 인증 완료 뒤 회원가입 단계가 진행되지 않았다.
- 마이페이지를 독립 HTML로 분리한 뒤 루트에만 있던 설정·프로필·주문·관리자·법적 문서 UI 계약이 끊겼다.
- 빌드와 테스트가 초록이어도 신규 런타임 파일이 Pages 산출물과 서비스워커 셸에서 빠질 수 있었다.

## 확인된 원인

1. `e82e8d...`에서 `sendPhoneOtp`를 PortOne 통합인증으로 연결하고 문자 OTP verifier를 비활성화했다. 이후 화면만 두 경로처럼 나눠 실제 호출은 계속 하나였다.
2. PortOne 요청 고객 필드가 공식 `customer.fullName`이 아니라 `customer.name`이었고, 외부 인증 복귀 ID 처리도 없었다. 최종 인증 수정은 `8b48f594...`에 반영됐다.
3. 운영 SMS 공급자 자격이 없다. 따라서 문자 OTP는 코드만으로 실가동할 수 없으며 `PHONE_OTP_ENABLED=false`와 `SMS_NOT_CONFIGURED`가 정직한 상태다.
4. `e6c9dfc71ad5f8fc3e34f92881511388cfcab569`가 마이페이지 모달을 루트에서 제거하고 독립 페이지가 `/index.html`을 다시 받아 지원 UI와 17개 레거시 스크립트를 복제하게 했다.
5. 당시 테스트는 루트 `myPageModal` 부재를 성공 조건으로 단언해 구조 단절을 오히려 보호했다.
6. 산출물 검사는 허용목록에 적힌 파일만 확인하고 서비스워커는 개수 하한만 봤다. 허용목록 자체에서 빠진 런타임은 검사 대상이 되지 않는 거짓 음성이었다.
7. 최근 Pages 성공 push 45건 중 30건은 verify/build/deploy가 모두 skipped였다. 워크플로 conclusion만으로 운영 게시를 판정하면 안 된다.

## 복구 원칙

- 문자 OTP와 KG 통합인증은 공급자·UI·서버 검증을 각각 분리한다. 공급자 자격이 없으면 문자 버튼을 숨기고 실패를 공개 코드로 남긴다.
- `/pages/mypage`는 인증을 서버에서 확인한 뒤 `/?view=mypage`로 보내는 호환 진입점일 뿐, UI를 복제하지 않는다.
- 마이페이지 정본과 지원 화면은 루트 한 곳에 둔다. MY 버튼과 직접 URL 모두 `auth.getUser()` 이후에만 연다.
- 선택 이식한 런타임은 source, build allowlist, SW exact URL, 산출물 검사를 함께 통과해야 한다.
- Pages는 exact SHA의 verify/truth_guard/build/deploy 단계와 운영 HTTP·브라우저 상태를 모두 확인한다.

## 재현·회귀 검사

- `scripts/test-mypage-standalone.mjs`
- `scripts/test-standalone-auth-gate.mjs`
- `scripts/test-standalone-tabbar.mjs`
- `scripts/test-standalone-clean-routes.mjs`
- `scripts/test-release-cache-key.js`
- `scripts/test-checkout-v2-safety.mjs`
- `scripts/test-home-layout-runtime.mjs`
