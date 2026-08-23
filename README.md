# BELLORE

명품시계 판매·구매·상담·분석을 제공하는 벨로르 정적 PWA입니다. 운영 도메인은 [bellore.co.kr](https://bellore.co.kr)이며, 실제 작업 저장소는 이 폴더 하나입니다.

## 빠른 시작

필수 도구:

- Node.js 20 이상 — 검사와 보조 스크립트
- 정적 HTTP 서버 — 네이티브 모듈은 `file://`가 아니라 HTTP로 확인

Windows 예시:

```powershell
python -m http.server 8765 --bind 127.0.0.1
```

브라우저에서 `http://127.0.0.1:8765/`를 엽니다. 정적 UI 확인에는 별도 빌드와 `npm install`이 필요하지 않습니다. Supabase·결제·외부 SDK 동작에는 네트워크와 해당 운영/테스트 설정이 필요합니다.

## 한 줄 검사

```powershell
node scripts/check.mjs
```

이 명령은 JavaScript 문법, 현재 프로젝트 테스트, HTML ID·로컬 자산, 서비스워커 셸, 구조 래칫을 검사합니다. 브라우저 E2E, 모바일 실기기, 실제 Supabase RLS 역할별 접근, PostgreSQL 동시성, PortOne/KG 실결제는 별도 검증입니다.

## 코드 구조

- [ARCHITECTURE.md](ARCHITECTURE.md) — 현재 구조, 목표 뼈대, 단방향 의존, 점진 추출 순서
- [CODE_RULES.md](CODE_RULES.md) — 지금 기계적으로 지키는 규칙과 예외 절차
- `app/bootstrap.js` — 신규 모듈의 조립점
- `app/features/` — 사용자 기능 단위 모듈
- `script.js`, `supabase.js`, `index.html`, 대형 CSS — 점진 축소 중인 레거시 경로
- `supabase/functions/` — 비밀·권한·결제처럼 서버 권위가 필요한 Edge Function

새 기능을 `index.html` 또는 대형 전역 파일에 추가하지 않습니다. 실제 기능 모듈을 만들고 `bootstrap`에서 의존성을 조립합니다.

## 환경값과 비밀

`.env.local.example`은 로컬 브리지·서버 작업용 이름 목록입니다. 필요할 때만 `.env.local`을 별도로 만들며 커밋하지 않습니다.

- Supabase publishable/legacy anon 키는 RLS와 최소 권한을 전제로 브라우저에서 사용할 수 있습니다.
- `service_role`, Supabase secret 키, PortOne API secret, 로컬 worker secret은 브라우저 코드·로그·Git에 넣지 않습니다.
- 최종 가격, 관리자 승인, 결제 승인·취소·환불은 UI가 아니라 Edge Function/DB 정책·RPC가 권위입니다.

## 배포 경로

주 운영:

- Git 원격: `https://github.com/jeongsseongg/bellore.git`
- 기준 브랜치: `main`
- 도메인: `bellore.co.kr`
- GitHub Pages branch-source가 현재 공개 트래픽을 제공합니다.

보조 운영:

- `.github/workflows/firebase-deploy.yml`
- Firebase 프로젝트 `newyork-watch`, 채널 `live`
- 로컬과 같은 `node scripts/check.mjs`가 성공해야 Firebase 배포 단계로 진행합니다.

`quality-gate.yml`도 같은 검사를 실행하지만, branch-source GitHub Pages는 별도 workflow 실패만으로 자동 차단되지 않습니다. 주 운영 배포를 강제하려면 GitHub의 required check/PR ruleset 또는 승인된 Pages Actions 전환이 필요합니다.

`main` push는 운영 배포를 유발할 수 있습니다. 작업 전 `git status`, 대상 브랜치, `CNAME`, `sw.js` 버전, Pages 설정을 확인하고, 사용자 승인이 있을 때만 커밋·푸시합니다.

## 롤백

- 공개 장애가 난 변경은 원인을 확인한 뒤 해당 변경만 되돌리는 새 revert 커밋으로 복구합니다.
- `git reset --hard`, 광범위 checkout, 사용자 미커밋 작업 삭제를 사용하지 않습니다.
- 클라이언트 자산 롤백에는 `sw.js` 셸 목록·캐시 버전도 함께 맞춥니다.
- DB/결제/외부 인증은 코드 롤백과 별개이므로 적용 전 백업·역마이그레이션·복원 경로를 검증합니다.

## 주요 문서

- `00_작업안내.md` — 저장소·파일 작업 안내
- `DESIGN.md` — 벨로르 UI 기준

과거 복사본 `bellore-mypick-fix`는 복구를 명시적으로 요청받은 경우에만 사용합니다.
