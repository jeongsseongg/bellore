# 벨로르 릴리스 런북

이 문서는 `main`을 GitHub Pages 주 운영과 Firebase 보조 운영에 배포할 때의 순서다. 배포 승인, 코드 배포, DB/Edge Function 적용은 서로 다른 권한으로 취급한다.

## 1. 변경 범위와 복구점 확인

1. 사용자가 이번 배포를 명시적으로 승인했는지 확인한다.
2. `git status --short`로 사용자 미커밋 파일과 이번 릴리스 파일을 분리한다. 관련 없는 파일은 스태시·되돌리기·커밋하지 않는다.
3. `git fetch origin` 뒤 `git rev-parse HEAD`와 `git rev-parse origin/main`을 기록한다. 기준이 바뀌었으면 새 기준에서 검사를 다시 한다.
4. 배포 전 커밋 SHA를 롤백 기준으로 기록한다. 광범위한 `reset --hard`는 복구 절차가 아니다.

DB·Storage 정책·Edge Function이 포함되면 `PRODUCTION_DEPLOY_ENABLED=false`로 자동 웹 게시를 먼저 잠그고 다음 순서를 고정한다.

1. GitHub와 Supabase의 재대조 및 신규 결제 환경 스위치를 모두 `false`로 두고, 정적 자동 배포도 `PRODUCTION_DEPLOY_ENABLED=false`로 잠근다.
2. DB 제어 RPC가 없거나 `false`이면 주문·결제사 접근 전에 503으로 닫히는 Edge를 `payment-webhook` → `confirm-payment` → `cancel-payment` → `reconcile-payments` → `create-checkout` 순서로 배포한다. 함수별로 동일 잠금 응답과 결제사 호출 0회를 확인한다.
3. 잠금 전에 시작된 최대 150초 요청이 끝나도록 180초 drain한다.
4. `DB Maintenance`의 `validate-authority-payment`가 운영의 schema-only dump만 데이터 없는 고정-digest Supabase PostgreSQL에 복원하고, 물리 system identifier 차이와 운영 행 0건을 확인한 뒤 합성 상품으로 전체 migration·결제/환불 픽스처·즉시 제약 검사를 전부 rollback하게 한다. 운영 DB에서는 rollback 픽스처를 실행하지 않는다.
5. 24시간 이내 암호화 DB 백업 workflow가 실제 `db-backup` artifact를 만들고 성공했는지 확인한다. 시크릿 누락으로 건너뛴 실행은 백업 성공이 아니다.
6. `apply-authority-payment`에 정확한 `confirm_sha`, 백업 `run_id`, hash-only 주문 보류값과 승인 문자열을 입력한다. 보호 주문 원문은 입력·로그·DB에 남기지 않는다. 사전 스키마 지문을 통과한 뒤 대상 5개 migration과 원장 5개를 한 트랜잭션으로 적용한다.
7. 운영 ACL·RLS·trigger·hold 사후검사와 Supabase security/performance advisor를 확인한다. 보호 주문 행은 직접 조회하지 않는다.
8. 동일 SHA의 Edge와 Pages artifact를 다시 검사하고, `PRODUCTION_DEPLOY_ENABLED=false`를 유지한 채 잠금 브랜치 SHA로 GitHub Pages를 수동 배포한다. Firebase는 공개 도메인의 주 운영 경로가 아니다.
9. DB 제어를 `payment_webhook` → `confirm_payment` → `cancel_payment` 순서로 먼저 연다. 보류 주문 제외가 검증된 재대조만 그 다음 열고, `create_checkout`과 신규 결제 환경 스위치는 마지막에 연다.
10. 새 별도 테스트 주문으로 승인→웹훅→예약 표시를 확인하고, 별도 승인된 테스트 주문으로 취소·전액 환불을 검증한다.

어느 단계든 실패하면 뒤 단계를 진행하지 않는다. migration의 재실행 안전성, 적용 후 검증 SQL, 되돌리기 또는 복원 방법을 먼저 준비하고 결과 건수를 기록한다.

## 2. 로컬 릴리스 게이트

저장소 루트에서 두 게이트를 실행한다.

```powershell
node scripts/check.mjs
node scripts/check-edge.mjs
```

둘 다 종료 코드가 0이어야 한다. 첫 명령은 JS/MJS 테스트, SEO 생성기, 깨끗한 정적 artifact, JavaScript 문법, 자산·서비스워커·구조 래칫을 확인하고 둘째 명령은 잠긴 Edge Function 전체를 타입검사한다. 실패한 기대값을 현재 결과에 맞춰 낮추지 말고 원인을 고친다.

별도로 확인할 항목:

- `CNAME`의 유일한 값이 `bellore.co.kr`인지
- 클라이언트 자산이 바뀌었다면 `sw.js` 셸 목록과 캐시 버전이 함께 갱신됐는지
- 브라우저 HTTP smoke, 모바일 핵심 화면, 로그인·결제처럼 자동검사가 다루지 않는 흐름
- 결제/권한 변경이면 실제 PostgreSQL 역할 행렬·동시성·멱등성 검증

## 3. main 반영과 자동 배포

1. 이번 변경만 커밋하고 커밋 SHA를 기록한다.
2. `main`이 최신 `origin/main`과 충돌하지 않는지 다시 확인한다.
3. 승인된 경우에만 `main`을 push한다.
4. 다음 세 workflow를 구분해서 확인한다.

| 경로 | 성공 기준 | 역할 |
| --- | --- | --- |
| Project Quality Check | `quality` 성공 | PR/main 진단 결과 |
| Deploy GitHub Pages | `build`와 `deploy` 성공 | `bellore.co.kr` 주 운영 |
| Deploy to Firebase Hosting | `deploy` 성공 | `newyork-watch/live` 보조 운영 |

Pages와 Firebase는 일반 검사와 잠긴 Edge 타입검사가 모두 성공한 뒤 `_site`를 만들고 최종 artifact를 재검사한다. workflow 파일의 main guard는 다른 브랜치의 수동 live 배포를 막는다. 직접 push·merge 차단은 원격 required check/ruleset이 실제로 켜져 있을 때만 보장된다.

## 4. 운영 확인

자동화 성공과 실제 사용자 노출을 구분한다.

1. `https://bellore.co.kr/`과 대표 `/market/{상품번호}/`가 HTTP 200인지 확인한다.
2. 루트 DNS가 GitHub Pages A 레코드, `www`가 운영 CNAME인지 확인한다.
3. 운영 HTML의 릴리스 키 또는 변경된 DOM, `sw.js` 캐시 버전을 확인한다.
4. 상품 수·사이트맵 URL 수·대표 이미지 수처럼 이번 변경의 전후 실측값을 기록한다.
5. 보조 Firebase도 해당 workflow가 게시한 live URL에서 같은 릴리스인지 별도로 확인한다.

## 5. 실패와 부분 롤백

- 로컬/CI 검사 실패: 배포하지 않고 실패 원인을 수정한다.
- Pages 실패, Firebase 성공: 주 운영 장애 여부를 먼저 확인하고 Firebase 성공을 주 운영 성공으로 보고하지 않는다.
- Pages 성공, Firebase 실패: `bellore.co.kr` 상태를 확인한 뒤 보조 경로만 재시도한다.
- 코드 회귀: 문제 커밋만 되돌리는 새 revert 커밋을 만들고 한 줄 게이트 후 다시 배포한다.
- 서비스워커 회귀: 이전 셸 목록과 캐시 버전을 함께 복구한다.
- DB/결제 회귀: 코드 revert만으로 데이터를 되돌렸다고 간주하지 않는다. 검증된 역마이그레이션 또는 암호화 백업 복원을 사용하고 전후 건수를 확인한다.

완료 보고에는 커밋 SHA, 세 workflow 결과, 운영 HTTP/DNS/DOM 확인, 전후 수치, 미검증 영역을 함께 남긴다.
