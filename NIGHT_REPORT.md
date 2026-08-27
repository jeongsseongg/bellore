# NIGHT REPORT — 2026-08-27

## 0. 한 줄 결론

확인 필요 — A 변경 자체의 새 회귀는 없고 A-2는 의미 동등·85.6% 단축으로 유지했지만, 공유 `main`의 동시 변경과 PortOne 콘솔 상태는 사람 확인이 필요하다.

## 1. 한 것 (A 항목)

- A-0 기준선: `node scripts/check.mjs` 18.435초, 종료 코드 1, 본체 테스트 65/65 통과, 전체 요약 pass=99 / warn=7 / fail=34. 실패 34개는 작업 시작 전부터 있던 미추적 `.codex-hero-viver-proportion/`이 검사 범위에 포함되어 발생. 커밋 `bcb0afb`.
- A-1 중복 훅 제거: `.codex/hooks.json`의 `PostToolUse`/`Bash` 불변식 검사 블록 1개를 삭제하고 `Stop` 검사는 유지. JSON 파싱 통과. 커밋 `a11773b`(동시 작업의 rebase로 최초 SHA `11f81f0`에서 변경).
- A-2 최적화 성공: 원본과 최적화본은 같은 현재 작업 트리에서 모두 종료 코드 2, 전체 출력 SHA-256 `b12b4950bf4d62b152bdb48df58191151b614446417e5f7ed2dd00e8197e584a`로 일치. 원본 4.409초 → 최적화본 0.636초(85.6% 단축). 최적화본 유지, `.bak` 보존. 이전 실패 보고 `2b32218`, 정정 커밋 `ac8bd3c`.
- A-3 SHA 대조 스크립트: `scripts/check-brain-latest-sha.mjs` 생성. 로컬 `main` HEAD `3ccf2220d13902b0fc2f099d6c40521bf2cf42c5`와 `PROJECT_CONTEXT.md`·Chronicle의 최신 SHA `f45fe5b8c7fefba51837eb56ad60926f5ea413a2` 2개가 달라 의도대로 종료 코드 1. 게이트 미연결. 커밋 `21aecaa`.

## 2. 조사 결과 (B 항목)

### B-1 — worktree 43개 / 형제 작업 폴더 30개

기준은 지시된 `main` SHA `aca3ab1`. `뒤/앞`은 `main...HEAD` 커밋 수, `머지`는 읽기 전용 `merge-tree`의 충돌 표식 기준이다. 마지막 커밋은 모두 표의 SHA와 날짜이며 제목은 `git show -s`로 전수 확인했다. `변경`이 1개 이상이면 실제 사용 여부를 단정하지 않고 보존 대상으로 분류했다.

| worktree | 브랜치@마지막(날짜) | 뒤/앞 | 머지 | prune | 변경 | 사용 추정 |
| --- | --- | ---: | --- | --- | ---: | --- |
| bellore-shop-fix | main@3ccf222 (8/26) | 102/1 | 충돌 | N | 74 | 사용 중·보존 |
| bellore-mypick-fix(옛 경로) | detached@f9e0ee8 (7/31) | 213/0 | 포함 | Y | 미확인 | 미사용 추정 |
| bellore-release-fresh | hero-v340-release-fresh@4fa11dd (8/26) | 30/0 | 포함 | N | 2 | 변경 보존 |
| .codex-hero-single-line | detached@0000000 | ?/? | 미확인 | N | 미확인 | 깨짐·백업 우선 |
| .codex-preview-4d25ee2 | detached@4d25ee2 (8/26) | 58/0 | 포함 | N | 5 | 변경 보존 |
| .codex-preview-7fd33a2 | detached@7fd33a2 (8/26) | 105/0 | 포함 | N | 0 | 정리 후보 |
| .codex-release-3897462 | detached@b6415b9 (8/26) | 39/0 | 포함 | N | 0 | 정리 후보 |
| .codex-release-final | detached@b6415b9 (8/26) | 39/0 | 포함 | N | 0 | 정리 후보 |
| .codex-release-hero-edge-v3 | hero-edge-v3@b788c12 (8/26) | 54/1 | 충돌 | N | 0 | 고유 커밋 확인 |
| .codex-release-hero-motion-v2 | hero-motion-v2@c3f0e0d (8/26) | 48/0 | 포함 | N | 1 | 변경 보존 |
| .codex-shipping-address-popup | shipping-address-popup@3897462 (8/26) | 44/0 | 포함 | N | 0 | 정리 후보 |
| listing-v4-live-verify | detached@2d341a2 (8/26) | 102/0 | 포함 | N | 2 | 변경 보존 |
| listing-v5-live-verify | detached@b98bf05 (8/26) | 101/0 | 포함 | N | 1 | 변경 보존 |
| market-share-indexing | market-share-indexing@1368816 (8/24) | 133/0 | 포함 | N | 0 | 정리 후보 |
| truth-guard-deploy | truth-guard-install@ca84391 (8/24) | 123/0 | 포함 | N | 0 | 정리 후보 |
| bellore-auth-social | social-auth-phone-gate@aca3ab1 (8/26) | 0/0 | 동일 | N | 0 | 정리 후보 |
| bellore-coupon-release | coupon-checkout@1f418b8 (8/26) | 105/0 | 포함 | N | 0 | 정리 후보 |
| bellore-featured-release | featured-showcase@24080d7 (8/26) | 110/0 | 포함 | N | 0 | 정리 후보 |
| bellore-hero-release | hero-banners@75e675c (8/26) | 97/1 | 충돌 | N | 12 | 변경·고유 보존 |
| bellore-home-admin | locked-pages@f811732 (8/25) | 108/0 | 포함 | N | 29 | 변경 보존 |
| bellore-home-deploy | home-final@f9885d8 (8/24) | 130/0 | 포함 | N | 11 | 변경 보존 |
| bellore-member-verification-release | member-verification@21cadbd (8/26) | 38/1 | 자동 | N | 0 | 고유 커밋 확인 |
| bellore-naverpay-release | naverpay-review@aca3ab1 (8/26) | 0/0 | 동일 | N | 8 | 변경 보존 |
| bellore-payment-live | payment-live@49b7662 (8/26) | 17/0 | 포함 | N | 0 | 정리 후보 |
| bellore-payment-recovery | payment-recovery@003c63e (8/26) | 41/0 | 포함 | N | 0 | 정리 후보 |
| bellore-payment-session | payment-session@11a8b8b (8/25) | 118/0 | 포함 | N | 7 | 변경 보존 |
| bellore-payment-static | payment-static@92b3631 (8/25) | 115/0 | 포함 | N | 7 | 변경 보존 |
| bellore-phase2-deploy | phase6-reveal@40287fb (8/24) | 132/0 | 포함 | N | 0 | 정리 후보 |
| bellore-phase7-11 | webhook-test@1952aba (8/25) | 123/1 | 충돌 | N | 0 | 고유 커밋 확인 |
| bellore-popup-baseline | detached@f811732 (8/25) | 108/0 | 포함 | N | 0 | 정리 후보 |
| bellore-popup-release | popup-release@bd1a163 (8/25) | 107/0 | 포함 | N | 19 | 변경 보존 |
| bellore-release | listing-title@49cebf0 (8/26) | 106/0 | 포함 | N | 13 | 변경 보존 |
| bellore-sell-hero389-latest | sell-hero389@0dd4f2e (8/26) | 10/1 | 충돌 | N | 0 | 고유 커밋 확인 |
| bellore-sell-motion-deploy | sell-motion-deploy@b898d62 (8/26) | 104/0 | 포함 | N | 0 | 정리 후보 |
| bellore-sell-motion-final | sell-motion-final@df509ed (8/26) | 105/1 | 충돌 | N | 9 | 변경·고유 보존 |
| bellore-sell-motion-latest | sell-motion-latest@7dc94c1 (8/26) | 56/0 | 포함 | N | 18 | 변경 보존 |
| bellore-sell-motion-release | sell-motion-release@9a245b1 (8/26) | 71/0 | 포함 | N | 10 | 변경 보존 |
| bellore-sell-services-blue | sell-services-blue@f4c223f (8/26) | 45/0 | 포함 | N | 27 | 변경 보존 |
| bellore-seo-deploy | seo-market@9496b8b (8/24) | 141/0 | 포함 | N | 0 | 정리 후보 |
| .codex-hero-viver-proportion | hero-viver@14ea7a2 (8/26) | 46/0 | 포함 | N | 7 | 변경 보존 |
| bellore-shop-release | admin-catalog@58e9049 (8/26) | 8/1 | 충돌 | N | 0 | 고유 커밋 확인 |
| bellore-stability-audit | stability-audit@bbf74bc (8/25) | 112/1 | 충돌 | N | 27 | 변경·고유 보존 |
| bellore-ui-hotfix | ui-hotfix@530c7de (8/26) | 5/0 | 포함 | N | 0 | 정리 후보 |

형제 작업 폴더 30개는 위 등록 worktree 27개와 등록 밖 3개다: `bellore-home-compose-release-20260826`(독립 `.git`, `2d341a2`, clean), `bellore-mypick-fix`(끊어진 `.git` 파일, 상태 미확인), `bellore-phase1-deploy`(Git 메타데이터 없음). 요약: clean 21 / 변경 20 / 상태 미확인 2 / 충돌 예상 8 / 고유 ahead 9 / main 포함 31 / prunable 1.

그래서 뭐가 문제인지: 즉시 삭제 가능한 것은 clean·main 포함 후보뿐이고, 20개는 미커밋 변경 때문에 백업·사람 확인 전 삭제 금지다. 고유 커밋 9개 중 8개는 main과 충돌 예상이라 단순 병합 대상도 아니다.

### B-2 — 깨진 `.codex-hero-single-line`

| 확인 | 결과 | 근거 |
| --- | --- | --- |
| 마지막 정상 이력 | 브랜치 `codex/hero-v340-release`, 마지막 정상 HEAD `0649a64`(`fix: refine home hero layout`) | worktree `logs/HEAD` 마지막 정상 reflog |
| 중단 상태 | rebase 2번째 단계에서 멈춤. 충돌 표시는 `scripts/test-release-cache-key.js`, `scripts/test-service-worker-seo-routes.js`, `sw.js` | `COMMIT_EDITMSG`, `rebase-merge/msgnum` |
| Git 메타데이터 손상 | `HEAD`, `ORIG_HEAD`, `REBASE_HEAD`, `AUTO_MERGE`, 194,419-byte `index`, `MERGE_MSG`, rebase 상태 파일 11개가 크기만 남고 전부 0x00 | 바이트 전수 검사 |
| 작업 폴더 내용 | 1,554파일 / 468,550,977 bytes 중 정확히 16파일이 전부 0x00. 나머지 1,538파일은 비어 있지 않음 | 재귀 파일·바이트 검사 |
| 0x00 파일 | `index.html`, `sw.js`, `.brain/INVARIANTS.json`, `app/bootstrap.js`, 홈 CSS 2개, 판매 JS/CSS 2개, `page-runtime.js`, 테스트 7개 | 바이트 전수 검사 |
| 미커밋 작업 판단 | 충돌 대상과 병합 결과가 0으로 소실되어 현재 worktree에서 복구 가능한 미커밋 텍스트는 확인되지 않음. 직전 의도는 커밋 `0649a64`에 남아 있음 | reflog + zero-file 목록 + 충돌 메시지 |

그래서 뭐가 문제인지: 폴더 전체를 바로 지울 상태는 아니지만, 핵심 16파일과 Git 상태는 복구 원본이 아니라 영(0) 데이터다. 아침에 폴더 전체를 먼저 백업한 뒤 `0649a64`와 남은 1,538파일을 기준으로 별도 복구·폐기 판정해야 한다.

### B-3 — GitHub Actions 트리거·중복·최근 시간

| workflow | 트리거 | 실제 역할 | 중복/사용 판단 |
| --- | --- | --- | --- |
| `db-backup.yml` | 매일 03:00 KST, 수동 | Supabase dump→gzip→AES256 artifact 30일 | 배포와 비중복, 유지 |
| `db-maintenance.yml` | 매일 03:20 KST, 수동 | 예약 시 analytics purge, 수동 진단·DB migration/apply/verify | 배포와 비중복. 오래된 Discord apply 선택지는 사용 여부 미확인 |
| `discord-poll.yml` | 5분마다, 수동 | Discord→Supabase 수집 | Telegram 전환 뒤 실제 사용 여부 미확인; 삭제 단정 금지 |
| `firebase-deploy.yml` | main push, 수동, 매일 03:00 KST | Truth Guard, `check.mjs`, Edge check, artifact build/verify, Firebase live | Pages와 검증 중복이나 별도 호스팅·schedule 안전망 |
| `pages-deploy.yml` | main push, 잠금 SHA 수동 | Truth Guard, 잠금 SHA 검증, `check.mjs`, Edge check, artifact build/verify, Pages deploy | 실제 운영 경로, 유지 |
| `payment-reconcile.yml` | 매시 17분, 수동 | stuck payment Edge reconcile | 배포와 비중복, 유지 |
| `quality-gate.yml` | PR, main push, 수동 | `check.mjs` + Edge check | 두 배포와 같은 명령 중복, PR/독립 피드백 제공 |
| `truth-guard.yml` | reusable call, PR, 수동 | pinned bundle/self-test/index gate/clean checkout | quality와 다른 증거 무결성 검사, 유지 |

`quality-gate`, `pages-deploy`, `firebase-deploy` 세 YAML 모두 `node scripts/check.mjs`와 `node scripts/check-edge.mjs`를 선언한 것이 사실이다. 단 최근 Firebase는 `PRODUCTION_DEPLOY_ENABLED=false` 조건 때문에 deploy job이 skipped되어 두 명령이 실행되지 않았다.

| workflow 최근 3회 | 결론 | 전체 초 | 핵심 실측 |
| --- | --- | ---: | --- |
| Quality `32980738606` | success | 37 | check 10s, Edge 2s |
| Quality `32977265521` | success | 66 | check 10s, Edge 2s |
| Quality `32976304287` | failure | 33 | check 10s 실패, Edge skipped |
| Pages `32981248111` | success | 276 | Truth Guard 192s(병렬), check 8s, Edge 3s, build 3s, deploy 67s |
| Pages `32980759677` | failure | 209 | Truth Guard 67s 성공, verify 107s 실패, build/deploy skipped |
| Pages `32980738854` | cancelled | 111 | Truth Guard 104s 중 취소, build/deploy 미실행 |
| Firebase `32980738758` | success | 123 | Truth Guard 119s, deploy job skipped |
| Firebase `32977265767` | success | 89 | Truth Guard 82s, deploy job skipped |
| Firebase `32976304700` | success | 79 | Truth Guard 75s, deploy job skipped |

중복 제거 시 잃는 안전성: quality에서 빼면 PR과 배포 비활성 main push의 빠른 회귀 신호를 잃는다. Pages에서 빼면 수동 잠금 SHA처럼 quality가 검사한 SHA와 다른 실제 배포 checkout 검증을 잃는다. Firebase에서 빼면 quality run이 없는 매일 schedule 재생성 시 검증을 잃는다. 따라서 단순 삭제보다 “검증 artifact/재사용 workflow + 정확한 SHA 일치 확인” 설계가 먼저다.

그래서 뭐가 문제인지: 현재 체감 1분 초과의 주원인은 8~10초 `check.mjs`가 아니라 Windows Truth Guard runner(최근 75~192초)와 Pages deploy 67초다. 중복만 지워도 Pages 성공 276초가 1분 안으로 줄어든다는 근거는 없다.

### B-4 — 1,300원 결제

| 확인 | 결과 | 근거 |
| --- | --- | --- |
| PortOne 콘솔 | 로그인 화면이라 8/1~ 기간·TEST 필터 조회 불가. 채널(TEST/LIVE), 현재 상태, 매입 여부는 미확인 | `admin.portone.io/auth/signin` 실측 |
| 실제 Edge 로그 | 2026-08-26 20:24:21 KST `confirm-payment provider rejected {"paymentRef":"AE4B7D3C","code":"provider_channel_not_live"}` | Supabase confirm-payment Logs, 최근 24시간 |
| 409 실제 조건 | 채널 type이 `LIVE`가 아니거나 type이 없고 `ALLOW_TEST_PAYMENTS`가 false이면 `provider_channel_not_live`; identity error는 HTTP 409로 반환 | `supabase/functions/_shared/payment-recovery.ts:83-89`, `:181-184`; `confirm-payment/index.ts:157-170` |
| DB 대상 주문 | ref `AE4B7D3C`, 1,300원, `pending`, `pay_type=full`, 8/26 20:23:58 KST 생성. `paid_at`·payment key·receipt 없음, refund amount NULL | 운영 `orders` 읽기 전용 SELECT |
| 같은 금액 대조군 | ref `367B363F`, 8/26 01:38 KST 생성, `canceled`; 대상 건과 별개 | 같은 SELECT |
| TEST인데 카드 청구 | 모순 아님. PortOne 공식 안내상 KG이니시스 테스트 결제는 실제 승인 후 30분/1시간 간격 또는 당일 23:00~23:50 자동취소될 수 있음 | `help.portone.io/content/test-mode-cancel` |

판정: “비-LIVE 결제를 LIVE 전용 서버가 409로 거절”은 로그·코드로 확정. 다만 콘솔을 못 열어 `channel.type=TEST` 자체는 미확인(없음도 같은 코드). 실제 카드 청구는 KG이니시스 TEST 정책과 양립한다. 자동취소가 실제 완료됐는지와 매입 여부는 아침에 PortOne 로그인 후 확인해야 하며, 밤에는 환불·재결제를 하지 않았다.

그래서 뭐가 문제인지: 결제대행사에는 승인/자동취소가 존재할 수 있지만 Bellore DB는 이를 확정하지 못해 `pending`으로 남았다. 콘솔 상태 확인 전에는 환불 필요 여부를 추측하면 안 된다.

### B-5 — `index.html` 잔존 모달의 페이지 분리 접점

| 대상 | 페이지로 옮길 본문 | 열기·닫기·상태 로직 | 함께 바꿀 의존성 |
| --- | --- | --- | --- |
| 마이페이지 | `index.html:1869`의 `#myPageModal` 전체(주문 모달 직전까지) | `script.js:398-509` open/close·서브화면, `:570-699` 클릭/프로필, `:896-1072` 설정·권한, `:2950` 관리자 관찰, `:5090-5102` 전역 overlay 닫기, `:5922` 탭 진입 | `ai-advisor.js:1844,2356`, `bellore-features.js:858`, `wishlist.js:398`, `app/features/mypage-settings/mypage-settings.js:147`, history 선택자 2곳; `styles.css:8494-8520,8760-8761,9229-9241,9473-9479,9823-10318`, `reference-layout.css:145-381`, `bellore-redesign.css:384-529`, `wanted-theme.css:1051-1058`의 `#myPageModal`/`body.mypage-open` 결합 제거 또는 페이지 루트로 치환 |
| 주문 내역 | `index.html:2090-2109`의 `#ordersModal` | `script.js:300-328` 필터·렌더 갱신, `:438-453` 진입/탭/닫기, `:5090-5102` overlay 닫기 | history 선택자 2곳; `styles.css:9458-9469,9473-9474`; 마이페이지에서 상태를 전달하는 URL query 또는 history state와 인증 후 직접 진입 처리 필요 |
| 제휴/광고 문의 | `index.html:2112-2129`의 `#inquiryModal`/form | `script.js:3594-3627` 유형별 문구·진입·닫기·제출, `:4442` 빈 초기화 함수 | history 선택자 2곳; 공용 `.login-modal/.login-content/.login-backdrop/.login-close/.signup-form` 스타일을 페이지용 클래스로 분리하고 `?type=partner|ad`로 기존 두 진입 의미 보존 |

공통 순서: 각 HTML을 `pages/`의 직접 URL로 만들고 인증·데이터 초기화를 페이지 진입 함수로 옮긴 뒤, 모든 `hidden` 토글을 링크/History 이동으로 바꾸고 overlay 목록에서 제거한다. 뒤로가기·딥링크·새로고침·로그아웃·모바일 safe-area를 회귀 테스트한다. `index.html:1707,1760`의 회원가입 약관 문구는 조사·분리 대상에서 제외했다.

그래서 뭐가 문제인지: 세 화면은 HTML만 옮길 수 있는 독립 모달이 아니다. 특히 마이페이지 ID가 네 CSS 파일과 여섯 JS 모듈의 상태·내비게이션 계약으로 쓰여, 본문만 분리하면 스타일·뒤로가기·관리자 갱신·관심목록 복귀가 함께 깨진다.

### B-6 — CDN·캐시·보조 백엔드

| 항목 | 실측·판정 | 근거 |
| --- | --- | --- |
| a) `sw.js` 4시간 캐시 | 등록 URL이 그대로면 새 worker 확인 시 브라우저/CDN의 최대 4시간 된 응답을 받을 수 있어, 배포 직후 방문도 구 worker가 유지될 수 있다. 브라우저는 탐색 등에서 update를 시도하지만 24시간 이전에는 HTTP 캐시를 완전히 우회한다고 보장되지 않는다. 현재 우회는 등록 URL query release key(`page-runtime.js:1-6`), 새 worker의 즉시 활성화(`sw.js:151-166`의 `skipWaiting`/`clients.claim`), 앱 코드 network-first(`sw.js:204-217`)다. 단 등록 query를 배포마다 올리지 않으면 우회가 무효이고, `controllerchange` reload가 없어 이미 열린 문서 본문은 다음 탐색/새로고침까지 그대로다. | 운영 `sw.js`: `max-age=14400`; MDN `ServiceWorkerRegistration.update()`·Service Worker API; 해당 파일·줄 |
| b) Cloudflare | 대시보드 접근 성공. `bellore.co.kr` Cache Rules 0 active, Cache Response Rules 0 active. 방법은 `URI Path equals /sw.js` Cache Rule을 최우선으로 만들어 **Bypass cache**하고, 별도 Response Header Transform에서 `Cache-Control: no-cache, no-store, must-revalidate`를 set하는 조합이다. 전자는 edge 저장 방지, 후자는 브라우저 캐시 지시다. Transform header만 바꾸면 Cloudflare의 이미 결정된 edge 캐시는 바뀌지 않는다. | Cloudflare 대시보드 읽기; 공식 Cache Rules settings·Response Header Transform Rules |
| b) 위험 | 오타/우선순위 오류면 모든 JS 캐시를 우회해 origin 부하·지연이 커진다. query가 붙은 `/sw.js?...`도 path는 `/sw.js`라 함께 매치되는지 Trace와 `CF-Cache-Status`로 검증해야 한다. 배포 직후 기존 URL purge 1회와 두 연속 요청 확인이 필요하다. 설정은 변경하지 않음. | Cloudflare 공식 규칙 우선순위·Trace 안내 |
| c) Supabase 배포 | 전제의 13개가 아니라 2026-08-27 읽기 기준 ACTIVE 20개: `dynamic-endpoint`, `confirm-payment`, `ai-learn`, `discord-ingest`, `cancel-payment`, `naverpay-order`, `collect-analytics`, `create-checkout`, `payment-webhook`, `reconcile-payments`, `telegram-ops`, `verify-account`, `sync-email-verification`, `complete-otp-signup`, `admin-manage-verification`, `verify-business`, `verify-identity`, `admin-audit-events`, `admin-member-ops`, `sell-request-access`. | Supabase `list_edge_functions` |
| c) Supabase 사용 | 최신 gateway 100건(14:08~15:22 UTC)에서 실제 호출 확인: `telegram-ops` 75, `collect-analytics` 12, `naverpay-order` 10, `verify-identity` 2, `reconcile-payments` 1. B-4의 더 이른 로그에는 `confirm-payment`도 있음. 현재 앱/워크플로/외부 webhook 설정에 호출 경로가 있는 함수는 이들을 포함해 19개이며, `dynamic-endpoint`만 저장소 호출 참조 0개다. 나머지는 “배포+호출 경로 있음”이지 최근 사용을 증명한 것은 아니다. | Supabase Edge logs 최근 100건; `git grep` 전수 대조 |
| d) Firebase | `newyork-watch.web.app`은 살아 있으나 운영과 다르다. `/` 235,116B/SHA `bebcf35a…`, `sw.js` 5,518B/`bellore-v269-home-row-admin`, `bootstrap.js` 2,142B. 운영은 각각 229,206B/SHA `fb9dcd8e…`, 12,210B/`bellore-v350-purchasebar-harmony`, 8,032B. Firebase Last-Modified 8/24 15:42 UTC, 운영 8/26 14:39 UTC. | 두 호스트 3개 URL HTTP 200·bytes·SHA-256·header 실측 |

그래서 뭐가 문제인지: 현재 서비스워커 갱신 안전성은 “배포 때 등록 query를 반드시 변경한다”는 수동 계약에 의존한다. Cloudflare에는 이를 보강할 규칙이 없고, Firebase는 운영 미러가 아니라 오래된 보조 사본이다. Supabase는 문서의 13개보다 7개 늘었으므로 삭제 판단을 함수 수가 아니라 실제 로그·호출 경로·외부 webhook 단위로 해야 한다.

### 추가 — `app/bootstrap.js` 캐시 키 불변식

| 확인 | 결과 | 근거 |
| --- | --- | --- |
| 위반 시작 | `d2eeb4b4`(2026-08-26 20:50:47 KST)에서 quicklinks 키를 v7→v8로 변경 | `git log -S`, `git show d2eeb4b4 -- app/bootstrap.js` |
| 변경 이유 | quicklinks 위의 두 번째 진녹색 막대를 제거하는 CSS 변경을 캐시 무효화하기 위한 의도적 버전 상승 | 같은 커밋의 `home-quicklinks.css`, 테스트, `sw.js` 동시 변경 |
| 운영 포함 | 예. `d2eeb4b4`는 공개 기록 SHA `f45fe5b8`의 조상 | `git merge-base --is-ancestor d2eeb4b4 f45fe5b8` 종료 0 |
| 현재 운영 응답 | `bootstrap.js` HTTP 200이 banners v7, quicklinks v8을 참조하고 quicklinks v8도 HTTP 200·9,619 bytes | 2026-08-27 `Invoke-WebRequest`, 두 응답 모두 `Cache-Control: max-age=14400` |

그래서 뭐가 문제인지: 운영 기능 회귀가 아니라 불변식의 quicklinks 요구값만 v7에 남은 거짓 양성이다. 현재 영향은 보호 훅이 정상 코드를 위반으로 차단하는 것이며, 운영은 의도한 v8 파일을 정상 제공한다. 이번 밤에는 불변식 파일을 수정하지 않는다.

## 3. 아침에 결정할 것

1. **Cloudflare에 `/sw.js` 전용 bypass+응답 헤더 규칙을 추가할까?** 예: release key 누락에도 최대 4시간 지연 제거. 아니오: 현재 수동 query 계약과 4시간 위험 유지. 실행: Dashboard → bellore.co.kr → Caching → Cache Rules에서 path exact `/sw.js`/Bypass, Rules → Transform Rules에서 같은 path에 `Cache-Control` set, Trace 후 `curl -I` 두 번 검증.
2. **PortOne 로그인 후 `AE4B7D3C`의 취소·매입 상태를 확인할까?** 예: 실제 환불 필요 여부와 Bellore `pending` 후속 조치를 안전하게 결정. 아니오: 카드사/DB 불일치 미확정 유지. 실행: TEST 포함·8/1~ 조회 → 채널·상태·매입 캡처; 결과 전에는 환불/재결제 금지.
3. **clean·main 포함 worktree 16개를 정리할까?** 예: 등록 43개를 27개로 줄이고 디스크/실수 표면 축소. 아니오: 안전하지만 혼잡 유지. 아래 C-1의 “지금 삭제” 명령만 실행하고 dirty·고유·손상 폴더는 건드리지 않는다.

### C-1 — worktree/폴더 정리 계획(실행 안 함)

- **지금 삭제**: clean이고 기준 `main`에 포함된 16개 — `.codex-preview-7fd33a2`, `.codex-release-3897462`, `.codex-release-final`, `.codex-shipping-address-popup`, `market-share-indexing`, `truth-guard-deploy`, `bellore-auth-social`, `bellore-coupon-release`, `bellore-featured-release`, `bellore-payment-live`, `bellore-payment-recovery`, `bellore-phase2-deploy`, `bellore-popup-baseline`, `bellore-sell-motion-deploy`, `bellore-seo-deploy`, `bellore-ui-hotfix`.
- **확인 후 삭제**: 변경 20개, 고유 ahead worktree, 손상 `.codex-hero-single-line`, prunable 옛 `bellore-mypick-fix`, 등록 밖 3개. 먼저 폴더별 백업과 `git status`/`git log main..HEAD` 검토. 손상 폴더는 전체 복사 후 `0649a64`와 비영 파일을 별도 복구한다.
- **유지**: `bellore-shop-fix`와 사람이 “현재 작업 중”으로 확인한 dirty/고유 브랜치. 독립 저장소 `bellore-home-compose-release-20260826`은 소유 확인 전 유지.

아침 실행 명령(현재 저장소에서만, 위 16개 전용):

```powershell
Set-Location -LiteralPath 'C:\Users\LS\Downloads\새 폴더\00_분류완료\01_브랜드_및_클라이언트\벨로르\웹서비스_및_시안\bellore-shop-fix'
$remove = @('.codex-preview-7fd33a2','.codex-release-3897462','.codex-release-final','.codex-shipping-address-popup','market-share-indexing','truth-guard-deploy','bellore-auth-social','bellore-coupon-release','bellore-featured-release','bellore-payment-live','bellore-payment-recovery','bellore-phase2-deploy','bellore-popup-baseline','bellore-sell-motion-deploy','bellore-seo-deploy','bellore-ui-hotfix')
$base = Split-Path -Parent (Get-Location)
foreach ($name in $remove) { git worktree remove -- (Join-Path $base $name) }
git worktree list --porcelain
```

`--force`, `git worktree prune`, 폴더 직접 삭제는 이 단계에서 사용하지 않는다. `bellore-mypick-fix`의 prunable 메타데이터는 백업·소유 확인 후 별도 `git worktree prune --dry-run` → 승인 시 `git worktree prune` 순서다.

### C-2 — 페이지 추가 비용을 한 곳으로 줄이는 설계(코드 미작성)

1. `tools/build-pages.mjs`에 `pages/` 재귀 수집기 하나를 두고 일반 `.html`만 상대 경로 그대로 `_site/pages/`로 복사한다. `assertNoSymlinks`와 출력 경로 탈출 검사를 재사용하고 정렬해 빌드 재현성을 보장한다. 수동 `ROOT_RUNTIME_FILES`에는 페이지를 추가하지 않는다.
2. `sw.js`에는 `const GENERATED_PAGE_ASSETS = /* @generated-pages */ [];`라는 단일 생성 지점만 두고 `SHELL_ASSETS`에 펼친다. 빌드가 복사된 `_site/sw.js`의 정확한 토큰을 `pages/**/*.html` URL 배열로 치환한다. 소스 파일을 매 빌드 수정하거나 별도 수동 캐시 목록을 만들지 않는다.
3. artifact 테스트가 (a) 모든 source page가 동일 경로에 존재, (b) 생성된 SW 목록과 정확히 일치, (c) symlink/비HTML/경로 탈출 없음, (d) `sw.js` VERSION·등록 release key가 함께 갱신됨을 검사한다.
4. 결과적으로 새 페이지 추가는 `pages/<name>.html` 1곳만 필요하다. build 포함·Firebase/GitHub artifact·SW precache는 같은 수집 결과에서 파생된다. 마이페이지/주문/문의 분리는 B-5의 JS·CSS 계약 제거를 각각 별도 slice로 진행한다.

## 4. 막힌 것

- 2026-08-26 23:57:31 다른 작업이 공유 작업 폴더를 `codex/night-cleanup-20260827`에서 `main`으로 전환했다. `main`에는 50개 이상의 기존 미커밋·미추적 변경이 있어 안전한 브랜치 복귀가 Git에 의해 차단됨. 사용자 변경은 스태시·리셋·이동하지 않고 분리 인덱스로 야간 브랜치 보고서만 갱신한다.
- PortOne 콘솔이 로그인 화면이라 `AE4B7D3C`의 정확한 TEST/LIVE 값, 현재 취소 상태, 매입 여부를 확인하지 못했다. 로그·DB·공식 정책으로 가능한 범위까지만 판정했다.
- D-1은 공유 체크아웃의 현재 `main`에서 실행할 수밖에 없어 야간 브랜치 자체의 통합 실행은 미실행이다. 대신 야간 브랜치의 코드 변경이 `.codex/hooks.json`과 A-3 스크립트뿐임을 tree diff로 확인했고, A-3 syntax·hook JSON·A-2 원본 동등성을 각각 검사했다.

## 5. 나중에 볼 것

- `app/bootstrap.js` quicklinks v8에 맞춰 stale invariant를 별도 승인 후 갱신하고 거짓 양성 해소.
- Firebase `newyork-watch`를 운영 미러로 유지할지, 보조/복구용 고정 사본으로 명시할지 결정.
- Supabase `dynamic-endpoint`의 소유·호출자를 로그 기간 확장으로 확인하고, 19개 함수도 “호출 경로”와 “실사용”을 구분해 보존 정책 작성.
- B-5/C-2 설계대로 모달을 한 slice씩 페이지화하고 generated page/SW artifact 테스트 추가.
- Actions 중복은 정확한 SHA의 검증 결과 재사용 구조를 먼저 만든 뒤 시간 재측정.

## 6. 지금 상태

- A-0: 18.435초 / 종료 코드 1 / pass=99, warn=7, fail=34.
- 실패 원인 대조군: 작업 시작 전 존재한 미추적 `.codex-hero-viver-proportion/`의 대형 소스·인라인 코드가 전역 검사에 포함됨.
- D-3 훅 쓰기 확인: 이 한 줄을 `NIGHT_REPORT.md`에 실제 추가하는 편집이 성공했다(편집 차단 없음).
- D-1 현재 공유 `main`: 14.045초 / 종료 코드 1 / pass=68, warn=15, fail=56. A-0보다 fail +22지만 동일 실패가 단순 증가한 것이 아니다. 미추적 nested worktree 실패는 34→27로 7개 줄었고, 동시 `main` 변경에서 29개(현재 소스 ceiling 8, 신규 누락 asset 19, 변경된 테스트 2)가 생겼다. 야간 허용 코드 파일은 이 실패 목록에 0개이므로 D-2 A 전체 롤백 조건에 해당하지 않는다.
- 보조 검사: A-3 `node --check` 종료 0; 야간 branch hook JSON 파싱 성공·Brain `PostToolUse/Bash` 블록 없음·Stop Brain 검사 유지; A-2 원본/최적화 종료 코드·출력 SHA 동일.
- 현재 checkout: `main` @ `3ccf2220d13902b0fc2f099d6c40521bf2cf42c5`. 야간 branch: `codex/night-cleanup-20260827` @ 아래 최종 커밋(마지막 커밋 후 갱신).

최종 `git status --short`:

```text
 M .codex/hooks.json
 M .github/workflows/db-maintenance.yml
 M app/bootstrap.js
 M app/features/home-banners/home-banners.css
 M app/features/home-rows/home-row-admin.js
 M app/features/home-rows/home-rows.css
 M app/features/home-rows/home-rows.js
 M app/features/sell-method/sell-method.css
 M app/features/sell-method/sell-method.js
 M app/legacy/legacy-collection.js
 M app/legacy/page-runtime.js
 M app/services/listings/listing-catalog-service.js
 M bellore-features.js
 M index.html
 M prototypes/account-roles/account-role-preview.css
 M prototypes/account-roles/account-role-preview.js
 M prototypes/account-roles/bootstrap.js
 M prototypes/account-roles/index.html
 M prototypes/admin-console-v2/admin-auth.js
 M prototypes/admin-console-v2/admin-console.css
 M prototypes/admin-console-v2/bootstrap.js
 M prototypes/admin-console-v2/data/admin-console-data.js
 M prototypes/admin-console-v2/features/mypage-editor/admin-mypage-editor-shadow.css
 M prototypes/admin-console-v2/features/mypage-editor/admin-mypage-editor.css
 M prototypes/admin-console-v2/features/mypage-editor/admin-mypage-editor.js
 M prototypes/admin-console-v2/features/navigation/admin-navigation.js
 M prototypes/admin-console-v2/features/workspace/admin-wanted.css
 M prototypes/admin-console-v2/features/workspace/admin-workspace.js
 M prototypes/admin-console-v2/index.html
 M script.js
 M scripts/test-account-role-preview.js
 M scripts/test-admin-console-v2.js
 M scripts/test-home-redesign.js
 M scripts/test-page-runtime-extraction.js
 M scripts/test-pages-artifact.mjs
 M scripts/test-product-sharing.js
 M scripts/test-release-cache-key.js
 M scripts/test-sell-method-sheet.js
 M scripts/test-service-worker-seo-routes.js
 M supabase-config.js
 M supabase.js
 M supabase/config.toml
 M supabase/functions/_shared/telegram-ops-core.mjs
 M supabase/functions/_shared/telegram-ops-core.test.mjs
 M supabase/functions/confirm-payment/index.ts
 M supabase/functions/payment-webhook/index.ts
 M supabase/functions/telegram-ops/index.ts
 M supabase/functions/verify-account/index.ts
 M supabase/functions/verify-business/index.ts
 M sw.js
 M telegram_operations.sql
 M tools/build-pages.mjs
?? .brain/
?? .codex-hero-viver-proportion/
?? .supabase-cli-home/
?? NIGHT_REPORT.md
?? app/features/home-merchandising/
?? app/features/sell-method/sell-service-action.css
?? app/features/sell-method/sell-service-navigation.css
?? app/features/sell-method/sell-service-pages.css
?? app/features/sell-method/sell-service-pages.js
?? app/legacy/home-merchandising-grid.js
?? outputs/
?? scripts/check-brain-latest-sha.mjs
?? scripts/test-home-merchandising.js
?? supabase/migrations/20260826143000_telegram_ops_media_payload.sql
?? supabase/migrations/20260826144500_telegram_ops_complete_payload.sql
?? supabase/migrations/20260826151000_telegram_vendor_highest_only.sql
?? "거래 이미지/"
```

최종 `git diff --stat`:

```text
 .codex/hooks.json                                  |  41 ++-
 .github/workflows/db-maintenance.yml               |  48 ++-
 app/bootstrap.js                                   |  36 ++-
 app/features/home-banners/home-banners.css         |  22 +-
 app/features/home-rows/home-row-admin.js           |  95 +++++-
 app/features/home-rows/home-rows.css               |  26 ++
 app/features/home-rows/home-rows.js                |  76 +++--
 app/features/sell-method/sell-method.css           |   4 +-
 app/features/sell-method/sell-method.js            |  10 +-
 app/legacy/legacy-collection.js                    |  13 +-
 app/legacy/page-runtime.js                         |   2 +-
 app/services/listings/listing-catalog-service.js   |   2 +
 bellore-features.js                                |   7 +-
 index.html                                         |  12 +-
 prototypes/account-roles/account-role-preview.css  |   9 +-
 prototypes/account-roles/account-role-preview.js   |  51 +++-
 prototypes/account-roles/bootstrap.js              |   2 +-
 prototypes/account-roles/index.html                |   4 +-
 prototypes/admin-console-v2/admin-auth.js          |   6 +
 prototypes/admin-console-v2/admin-console.css      |  69 ++++-
 prototypes/admin-console-v2/bootstrap.js           |  50 ++--
 .../admin-console-v2/data/admin-console-data.js    |  63 ++--
 .../mypage-editor/admin-mypage-editor-shadow.css   |   2 +
 .../features/mypage-editor/admin-mypage-editor.css |  68 ++---
 .../features/mypage-editor/admin-mypage-editor.js  |  44 +--
 .../features/navigation/admin-navigation.js        |  23 +-
 .../features/workspace/admin-wanted.css            |   2 +-
 .../features/workspace/admin-workspace.js          |  46 ++-
 prototypes/admin-console-v2/index.html             |  28 +-
 script.js                                          | 157 +++-------
 scripts/test-account-role-preview.js               |  20 +-
 scripts/test-admin-console-v2.js                   | 101 ++++++-
 scripts/test-home-redesign.js                      |  22 +-
 scripts/test-page-runtime-extraction.js            |   2 +-
 scripts/test-pages-artifact.mjs                    |  15 +-
 scripts/test-product-sharing.js                    |   6 +-
 scripts/test-release-cache-key.js                  |   4 +-
 scripts/test-sell-method-sheet.js                  |  18 +-
 scripts/test-service-worker-seo-routes.js          |   2 +-
 supabase-config.js                                 |   9 +-
 supabase.js                                        | 326 ++++++++++-----------
 supabase/config.toml                               |  24 ++
 supabase/functions/_shared/telegram-ops-core.mjs   |  87 +++++-
 .../functions/_shared/telegram-ops-core.test.mjs   |  46 +++
 supabase/functions/confirm-payment/index.ts        |   9 +-
 supabase/functions/payment-webhook/index.ts        |   9 +-
 supabase/functions/telegram-ops/index.ts           | 149 ++++++++--
 supabase/functions/verify-account/index.ts         |  95 ++----
 supabase/functions/verify-business/index.ts        | 141 ++++-----
 sw.js                                              |  24 +-
 telegram_operations.sql                            |  43 ++-
 tools/build-pages.mjs                              |  12 +
 52 files changed, 1407 insertions(+), 775 deletions(-)
```

## 7. 전부 되돌리는 방법

야간 A 변경만 전부 되돌리는 명령이다. 현재 `main`의 다른 미커밋 변경은 건드리지 않는다.

```powershell
Set-Location -LiteralPath 'C:\Users\LS\Downloads\새 폴더\00_분류완료\01_브랜드_및_클라이언트\벨로르\웹서비스_및_시안\bellore-shop-fix'
Copy-Item -LiteralPath 'C:\Users\LS\.codex\skills\brain\scripts\check_protected_invariants.py.bak' -Destination 'C:\Users\LS\.codex\skills\brain\scripts\check_protected_invariants.py' -Force
Remove-Item -LiteralPath '.\scripts\check-brain-latest-sha.mjs' -Force
$rollbackIndex = Join-Path $env:TEMP ('bellore-night-rollback-' + [guid]::NewGuid().ToString('N'))
$env:GIT_INDEX_FILE = $rollbackIndex
try {
  git read-tree codex/night-cleanup-20260827
  git reset f45fe5b8c7fefba51837eb56ad60926f5ea413a2 -- .codex/hooks.json
  git rm --cached --ignore-unmatch scripts/check-brain-latest-sha.mjs
  $tree = git write-tree
  $parent = git rev-parse codex/night-cleanup-20260827
  $commit = 'rollback night A changes; keep investigation report' | git commit-tree $tree -p $parent
  git update-ref refs/heads/codex/night-cleanup-20260827 $commit $parent
} finally {
  Remove-Item -LiteralPath $rollbackIndex -Force -ErrorAction SilentlyContinue
  Remove-Item Env:GIT_INDEX_FILE -ErrorAction SilentlyContinue
}
```

이 명령은 야간 branch에서 A-1/A-3만 되돌리는 새 커밋을 만들고 B/C 보고서는 보존한다. 현재 checkout의 `.codex/hooks.json`은 다른 작업 변경과 섞여 있으므로 통째로 복원하지 않는다. `NIGHT_REPORT.md`는 조사 결과이므로 남긴다.
