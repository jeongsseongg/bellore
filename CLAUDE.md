# BELLORE 작업 지침 (Claude 자동 로드)

> ⚠️ **디자인은 반드시 `DESIGN.md`(디자인 표준)를 따른다. 절대 벗어나지 말 것.**
> **(2026-06 변경) 흑백화 금지 — `design-refs/`의 바이버/구구스 레퍼런스처럼 컬러로 똑같이 간다.**
> Pretendard 전체 통일 · 라벨+박스+우측아이콘 입력 · 좌우 여백+중앙 정렬 ·
> 규격/정렬 픽셀 일관성. CTA는 검정 기본이되 레퍼런스가 컬러면 그 색을 따른다. (사장님 확정)

벨로르(bellore.co.kr) — 명품시계 거래 PWA. Firebase 호스팅(`newyork-watch`) + Supabase 백엔드 + 토스페이먼츠.
정적 앱: `index.html` / `script.js` / `supabase.js` / `payments.js` / `bellore-features.js` / `styles.css`. DB 변경은 루트의 `*.sql` 파일로 관리(사용자가 Supabase SQL Editor에 직접 실행).

## 사용자(사장님) 핵심 요구 — 매번 지킬 것
1. **수정은 "끝까지" 한다.** 사용자가 지적한 항목만 고치지 말 것.
   - 폼 필드를 바꾸면 → 그 값을 쓰는 **payload·DB 저장(supabase.js)·카드/상세 표시(script.js)·CSS**까지 전부 연동해서 고친다.
   - 중복은 **사용자가 일일이 짚어주기 전에** 내가 먼저 전부 찾아 정리한다. (예: 같은 정보가 칩·아이콘·표·상태글에 3~4번 반복되면 단일 소스만 남긴다.)
2. **"안 됨"의 원인을 명확히 구분해 보고한다.** 특히 DB 트리거/컬럼이 필요한 기능은 "SQL 실행 전엔 동작 안 함"을 분명히 안내하고, 가능하면 **클라이언트 측 폴백**도 함께 넣어 SQL 없이도 즉시 동작하게 한다.
3. **UI는 잘림/겹침 없이.** 스크롤 영역(`overflow:auto`) 안의 절대위치 툴팁은 잘린다 → 호버 툴팁 대신 **줄글(인라인)** 로 표시.
4. SQL을 요청하면 **복붙용 전체 블록**으로 준다(요약 X).

## 도메인 규칙 (확정)
- **판매등록 폼**: 구성품은 체크박스(박스/케이스/개런티카드/보증서) 하나로 통일 → '구성품'·'등급' 자동 도출. 사이즈(mm) 미사용·미리수 유지. 구매년도 폐지 → '스탬핑/연식' 한 필드로 통합.
- **상품번호**: `00` + 등급 + `YYMMDD`(KST) + 그날 순번(3자리). 등급 = 1억↑ A / 1천만↑ B / 100만↑ C / 그 미만 D. 비우면 자동 생성(신규는 클라이언트 폴백, 기존 소급은 `product_no.sql`).
- **배송 기본값**: 미지정 시 "결제 후 2~4일 이내 발송".
- **쿠폰**: 종류 3가지 — auto(가입 자동지급)/code(코드입력)/image(이미지 클릭 다운로드). 관리자 목록은 카드 클릭=수정, 활성토글·삭제는 수정 페이지 안에서.

## 결제 보안 (확정 사항 — 절대 약화 금지)
- 결제 승인은 Edge Function `confirm-payment`가 service_role로 수행. 금액은 **서버에서 listings.price 기준 재계산** 후 대조(프런트 amount/discount 불신). 쿠폰도 서버 재검증.

## 배포 워크플로
- 개발 브랜치: `claude/hopeful-cannon-zqRIZ`. 작업 후 `main`(배포 브랜치)로 fast-forward 머지 + 양쪽 push.
- 클라이언트(JS/HTML/CSS) 변경 시 **`sw.js`의 VERSION 올린다**(캐시 무효화). Edge Function .ts는 SW 캐시 대상 아님.
- PR은 명시 요청 시에만. 커밋/PR/코드/주석 등 산출물에 모델 식별자 절대 미포함.
- ADMIN_EMAIL `bellorekr@gmail.com`. NW_ADMIN_EMAILS에 brpartners@gmail.com, jeongsseongg@gmail.com.
