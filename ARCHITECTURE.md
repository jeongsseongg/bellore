# 벨로르 애플리케이션 구조

## 현재와 목표

현재 앱은 하나의 정적 PWA지만, `index.html`, `script.js`, `styles.css`, `supabase.js`가 여러 기능을 동시에 소유한다. 새 구조도 배포 단위는 하나로 유지한다. 마이크로서비스로 쪼개는 것이 아니라, 한 저장소 안에서 경계가 보이는 **모듈러 모놀리스**로 점진 전환한다.

```text
index.html                         정적·SEO·접근성 셸
  └─ app/bootstrap.js              유일한 신규 코드 조립점
       ├─ features/<기능>/         검색, 상품, 찜, 결제, 법적고지처럼 사용자 기능
       ├─ services/<경계>/         Supabase, 결제사, 분석 등 외부 시스템 어댑터
       ├─ ui/<공유 UI>/             둘 이상 기능이 실제 공유하는 표현 요소
       ├─ core/<순수 규칙>/         DOM·네트워크 없는 공통 규칙
       └─ legacy/<어댑터>/          전환 중인 window 전역과 기존 API 격리
```

폴더는 계획만으로 만들지 않는다. 첫 실제 소유 코드가 생길 때 만든다.

## 의존 방향

```text
index.html → bootstrap → feature public API → service interface / ui / core
                         service adapter → core
                         ui → core
legacy globals ← legacy adapter ← bootstrap
```

- `bootstrap`만 구체 구현을 조립한다.
- 기능은 다른 기능의 내부 파일을 직접 import하지 않는다.
- 서비스는 DOM을 모르고, UI는 Supabase·PortOne을 모른다.
- `core`는 브라우저 전역, DOM, 네트워크, Supabase를 모른다.
- 레거시 전역은 새 기능의 API가 아니다. 전환용 어댑터를 통해서만 접근한다.
- 순환 의존을 허용하지 않는다.

## 기능 한 조각의 모양

```text
app/features/checkout/
  checkout-controller.js           화면 흐름과 상태
  checkout-view.js                 해당 기능 DOM 표현
  checkout-policy.js               순수 검증·계산

app/services/payments/
  portone-payment-service.js       외부 SDK/Edge 호출 경계
```

`bootstrap`은 `createCheckout({ paymentService, backend, view })`처럼 필요한 것을 주입한다. 결제 기능이 `window.sbClient`나 PortOne 전역을 곳곳에서 직접 찾지 않게 하는 것이 목적이다.

파일 하나로 명확한 기능은 억지로 세 파일로 나누지 않는다. 반대로 파일 이름에 “그리고”가 필요하거나 서로 다른 이유로 자주 바뀌는 코드가 섞이면 분리한다.

## 운영 중인 벨로르의 전환 순서

1. **동결:** 현재 레거시 크기·인라인 코드·전역·스타일 부채를 래칫으로 기록한다.
2. **특성 확인:** 옮길 기능의 현재 입력·출력·DOM 상태를 테스트한다. 결제·권한은 현재 동작이 아니라 서버 권위 불변식을 테스트한다.
3. **작은 경계 선택:** 최근 수정 중인 검색·추천·결제 대신, 상태가 적고 독립된 기능부터 고른다.
4. **한 번만 이동:** 기존 구현과 새 구현을 동시에 고치지 않는다. 필요한 동안 legacy adapter로 기존 호출 계약을 유지한다.
5. **검증:** `node scripts/check.mjs`와 해당 기능 테스트, HTTP 로컬 서버 브라우저 확인을 함께 수행한다.
6. **전환:** 새 경로가 같은 동작을 보인 뒤 기존 코드를 제거하고 baseline 천장을 낮춘다.
7. **어댑터 제거:** 호출자가 모두 새 공개 API로 이동하면 정한 종료 조건에 따라 legacy adapter를 삭제한다.

대규모 ESM 전환은 순수 이동이 아니다. 모듈은 자동 defer·strict mode·모듈 스코프·CORS 규칙이 classic script와 다르다. 따라서 새 코드와 검증된 작은 추출에만 네이티브 ESM을 사용하고, 기존 전역 스크립트는 한 번에 바꾸지 않는다.

## HTML과 CSS

- HTML에는 의미 구조, SEO 데이터, 접근성 landmark와 서버 없이 보여야 하는 기본 콘텐츠를 둔다.
- 새 실행 로직은 인라인 `<script>`가 아니라 기능 모듈에 둔다. JSON-LD는 실행 코드가 아니므로 예외다.
- 첫 페인트 전에 반드시 실행되어야 하는 작은 설정은 이유·바이트 수·대체 불가성을 문서화한 경우만 예외다.
- 새 `style=`와 `!important`를 만들지 않는다. 기존 값은 기능을 옮길 때 같은 기능의 CSS로 이동한다.
- 토큰은 전면 일괄 치환하지 않는다. 먼저 신규 코드에 적용하고, 기능별 시각 회귀 검증과 함께 기존 값을 줄인다.

## Supabase·결제 경계

- 공개 조회와 사용자 소유 데이터: publishable/anon 키 + RLS + 최소 grant가 기본 경로다.
- secret/service-role, 관리자 작업, 결제 금액 확정, 승인·취소·환불: Edge Function/서버/DB RPC가 권위다.
- 브라우저 역할 확인은 버튼 노출을 위한 UX일 뿐 권한 검사가 아니다.
- 가격은 브라우저 요청값을 신뢰하지 않고 서버가 상품·쿠폰·포인트 원장을 다시 읽어 계산한다.

## 빌드와 배포

현재는 package.json 없는 정적 배포를 유지한다. 이것이 영구 결정이라는 뜻은 아니다.

- no-build도 여러 CSS 링크와 네이티브 ESM으로 모듈 경계를 만들 수 있다.
- HTML 부분 조립·해시 자산·번들 최적화가 실제 병목으로 확인되면 최소 조립기나 빌드 도구를 별도 결정한다.
- `package.json` 자체가 GitHub Pages/Firebase의 빌드를 자동 전환하는 것은 아니다. 실제 영향은 Pages 게시원, Actions workflow, Firebase `public`/`ignore` 설정으로 검증한다.
- 현재 primary Pages는 branch-source이므로 독립 `quality-gate.yml`은 검사 신호를 만들지만 게시를 선행 차단하지 못한다. 보조 Firebase workflow에는 동일 검사를 선행 단계로 연결했다. 주 운영 Pages 차단은 원격 브랜치 규칙 또는 승인된 Pages Actions 전환 작업으로 분리한다.

## 추출 현황과 보류 대상

- 완료(2026-08-24): 법적고지 모달을 `app/bootstrap.js`와 `app/features/legal/legal-modals.js`로 옮겼다. clean `main` 기준 `index.html`은 3,713→3,685줄, 인라인 실행 블록은 4→3, 줄바꿈을 LF로 정규화한 실행 본문은 34,049→32,747바이트이며 Node 테스트와 HTTP 브라우저 열기·닫기를 통과했다.
- 다음 후보는 시작 시점의 dirty hunk와 호출 관계를 다시 재서 고른다. 낮은 상태·낮은 권한·독립 DOM 기능을 우선한다.
- 보류: 현재 dirty worktree에서 작업 중인 검색 10개 무한스크롤, 추천 v2, 결제, `supabase.js`, 서비스워커 관련 대형 블록.
- 기존 JS/CSS가 참조하지만 저장소에 없는 동적 이미지 9개는 별도 콘텐츠 부채다. 1차 구조 배포에서는 임의 대체하지 않고 baseline 경고로 고정해 추가 누락만 차단한다.
- `app/bootstrap.js`에는 조립만 추가하고 기능 구현을 넣지 않는다.
