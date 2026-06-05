# 뉴욕워치 (NEWYORK WATCH)

명품시계 구입 · 판매 · 수리 전문 - 공식 직영점

## 🌐 Live Demo

GitHub Pages 배포 후 URL 업데이트 예정

## 📋 주요 기능

- **홈**: 히어로 + LIVE 비교견적 진행 현황 + 판매시계 가로 슬라이드
- **비교견적**: 실시간 입찰 시뮬레이션 (1,500만 → 1,900만 매입완료)
- **판매시계**: 뉴욕워치 판매 / 고객 판매 마켓 (2단 그리드)
- **인사이트**: 시세분석/매입가이드/브랜드스토리/시계위키/매입후기/제휴처 (6개 카테고리)
- **브랜드**: 롤렉스 역사 + 6개 명품 브랜드 카드
- **소개**: 공식 직영점 강조 + 감정사 + 인증 + 프로세스

### 💎 핵심 인터랙션

- 시계 판매/구입/수리 3개 폼 (각각 입력 필드)
- 사진 10장 업로드 (드래그/클릭)
- 비교견적 시뮬레이션 (가격 부드러운 카운트업)
- 회원가입 / 로그인 (카카오/네이버 연동 자리)
- 관리자 모드 (admin/admin1234) → 매물 승인 + 등록
- 제휴처 클릭 → 예약/문의 모달
- 인사이트 게시글 클릭 → 상세 모달

## 🏗 기술 스택

- HTML5
- CSS3 (Pretendard 폰트, 다크베이지+화이트 테마)
- Vanilla JavaScript
- **Supabase** 백엔드 (인증/DB/실시간/Storage)
- 모바일 앱 비율 (660px) + 하단 탭바

## 🔌 Supabase 백엔드 연동

디자인은 그대로 두고 기능만 Supabase로 연결되어 있습니다.

- `supabase-config.js` — 프로젝트 URL / anon 키 / 부트스트랩 관리자 이메일
- `supabase.js` — 인증·비교견적·판매시계·커뮤니티·후기·알림 백엔드 레이어 (`window.NWBackend`)
- `bellore-features.js` — 업체 입찰 화면 / 인사이트·후기 작성(관리자) / 고객판매 등록(관리자)

### 구현 기능

1. **회원가입/로그인** — 이메일 + 구글 + 카카오 (OAuth)
2. **비교견적** — 고객 요청 → 관리자 승인 → 승인업체 입찰 → 고객 채택
3. **업체 승인제** — 업체 가입 시 대기 → 관리자(마이페이지) 승인
4. **판매시계** — 벨로르판매 / 고객판매 카테고리
5. **인사이트·커뮤니티** — 카테고리별, 관리자만 작성
6. **후기** — 관리자 등록, 인사이트 "매입 후기" 탭에 노출
7. **실시간 알림** — 새 견적/입찰/승인 알림 (Supabase Realtime)

### 설정 메모

- 테이블·RLS·트리거·실시간·Storage(`photos`)는 Supabase에 이미 생성되어 있습니다.
- 최초 관리자 지정: 해당 계정 가입 후 SQL Editor에서
  `update public.profiles set role='admin' where id=(select id from auth.users where email='관리자메일');`
- 구글/카카오 로그인: Supabase **Authentication → Providers** 에서 각 Provider를
  Enable 하고, **URL Configuration → Site URL** 에 배포 주소를 등록하세요.
  (Redirect URI: `https://<프로젝트>.supabase.co/auth/v1/callback`)

## 📞 연락처

- 대표번호: 010-6293-6668
- 24시간 카카오톡 상담
- 오픈채팅: https://open.kakao.com/o/sMuCaAFh
- 카카오 채널: https://pf.kakao.com/_Uzxixen

## 🏢 매장

- 종로점 · 강남점 · 청담점 (직영)
- 부천 · 이태원 · 여의도 · 분당 · 일산 · 인천 · 수원 · 부산 · 대구 (제휴)

---

SINCE 2008 · 17년 운영
